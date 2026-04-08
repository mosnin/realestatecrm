import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { getSpaceFromSlug } from '@/lib/space';
import { scoreLeadApplicationDynamic } from '@/lib/lead-scoring';
import type { LeadScoringResult } from '@/lib/lead-scoring';
import type { Contact } from '@/lib/types';
import {
  applicationFingerprintKey,
  buildApplicationData,
  normalizePhone,
  publicApplicationSchema,
} from '@/lib/public-application';
import { notifyNewLead } from '@/lib/notify';
import { sendApplicationConfirmation } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { formConfigSchema, type IntakeFormConfig, type FormQuestion } from '@/lib/form-config-schema';
import { getFormConfigs, getDefaultFormConfig } from '@/lib/form-builder';
import type { ScoringModel } from '@/lib/scoring/scoring-model-types';

/** Parse budget/rent range strings like 'under_1500', '1500_2000', '1m_plus' to a midpoint number. */
function parseBudgetToNumber(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  const s = String(val).toLowerCase().trim();
  if (!s) return null;
  // Try direct numeric parse first
  const direct = Number(s);
  if (!isNaN(direct) && direct > 0) return direct;
  // Handle range strings: 'under_1500' -> 1250, '1500_2000' -> 1750, '3500_plus' -> 4000
  const underMatch = s.match(/^under[_\s]?(\d+)/);
  if (underMatch) return Math.round(Number(underMatch[1]) * 0.8);
  const rangeMatch = s.match(/^(\d+)[k]?[_\s-]+(\d+)[k]?$/);
  if (rangeMatch) {
    let lo = Number(rangeMatch[1]);
    let hi = Number(rangeMatch[2]);
    // Handle 'k' suffix: 200k_350k
    if (s.includes('k')) { lo *= 1000; hi *= 1000; }
    return Math.round((lo + hi) / 2);
  }
  const plusMatch = s.match(/^(\d+)[k]?[_\s]?(?:plus|\+)$/);
  if (plusMatch) {
    let base = Number(plusMatch[1]);
    if (s.includes('k') || s.includes('m')) base *= 1000;
    if (s.startsWith('1m')) return 1250000;
    return Math.round(base * 1.2);
  }
  return null;
}

// ── Dynamic form config helpers ───────────────────────────────────────────

/**
 * Resolve the correct form config for a space + lead type using the dual config system.
 *
 * Fallback chain:
 *   1. Dual config: SpaceSetting.[rental|buyer]FormConfig (custom per-agent)
 *   2. Legacy single: SpaceSetting.formConfig (if leadType matches)
 *   3. Brokerage dual: Brokerage.[brokerage[Rental|Buyer]FormConfig]
 *   4. Brokerage legacy: Brokerage.brokerageFormConfig (if leadType matches)
 *   5. null (use legacy schema / default template)
 */
async function fetchFormConfigForLeadType(
  spaceId: string,
  brokerageId: string | null,
  leadType: 'rental' | 'buyer',
): Promise<IntakeFormConfig | null> {
  try {
    const dual = await getFormConfigs(spaceId, brokerageId);

    const config = leadType === 'buyer'
      ? dual.buyer
      : dual.rental;

    if (config) return config;
  } catch (err) {
    console.warn('[apply] getFormConfigs failed, trying legacy fetch', { spaceId, err });
  }

  // Legacy fallback: try the single formConfig column directly
  try {
    const { data: spaceSetting } = await supabase
      .from('SpaceSetting')
      .select('formConfig, formConfigSource')
      .eq('spaceId', spaceId)
      .maybeSingle();

    if (spaceSetting?.formConfig && spaceSetting.formConfigSource !== 'legacy') {
      const parsed = formConfigSchema.safeParse(spaceSetting.formConfig);
      if (parsed.success) {
        // Only use if the leadType matches or is 'general'
        const configLeadType = parsed.data.leadType;
        if (configLeadType === leadType || configLeadType === 'general') {
          return parsed.data;
        }
      }
    }

    // Fall back to brokerage-level config
    if (brokerageId) {
      const { data: brokerage } = await supabase
        .from('Brokerage')
        .select('brokerageFormConfig')
        .eq('id', brokerageId)
        .maybeSingle();

      if (brokerage?.brokerageFormConfig) {
        const parsed = formConfigSchema.safeParse(brokerage.brokerageFormConfig);
        if (parsed.success) {
          const configLeadType = parsed.data.leadType;
          if (configLeadType === leadType || configLeadType === 'general') {
            return parsed.data;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[apply] legacy fetchFormConfig also failed', { spaceId, err });
  }

  return null;
}

/**
 * Build a Zod schema dynamically from the IntakeFormConfig.
 * The schema validates that required fields are present and types match.
 */
function buildDynamicSchema(config: IntakeFormConfig) {
  const shape: Record<string, z.ZodTypeAny> = {
    slug: z.string().min(1),
  };

  const allQuestions: FormQuestion[] = [];
  for (const section of config.sections) {
    for (const question of section.questions) {
      allQuestions.push(question);

      let fieldSchema: z.ZodTypeAny;

      switch (question.type) {
        case 'email':
          fieldSchema = question.required
            ? z.string().trim().min(1).email().max(255)
            : z.string().trim().email().max(255).optional().or(z.literal(''));
          break;
        case 'phone':
          fieldSchema = question.required
            ? z.string().trim().min(1).max(40)
            : z.string().trim().max(40).optional().or(z.literal(''));
          break;
        case 'number':
          fieldSchema = question.required
            ? z.union([z.number(), z.string()]).pipe(z.coerce.number())
            : z.union([z.number(), z.string(), z.null(), z.undefined()]).optional();
          break;
        case 'checkbox':
          fieldSchema = question.required
            ? z.boolean()
            : z.boolean().optional();
          break;
        case 'multi_select':
          fieldSchema = question.required
            ? z.array(z.string()).min(1)
            : z.array(z.string()).optional();
          break;
        case 'date':
        case 'text':
        case 'textarea':
        case 'select':
        case 'radio':
        default:
          fieldSchema = question.required
            ? z.string().trim().min(1).max(4000)
            : z.string().trim().max(4000).optional().or(z.literal(''));
          break;
      }

      shape[question.id] = fieldSchema;
    }
  }

  // Allow passthrough for extra fields (e.g. privacyConsent, completedSteps)
  return { schema: z.object(shape).passthrough(), allQuestions };
}

/**
 * Extract standard contact fields from dynamic form submission.
 */
function extractContactFields(data: Record<string, unknown>, config: IntakeFormConfig) {
  const name = (data.name as string) ?? '';
  const email = (data.email as string) || null;
  const phone = (data.phone as string) ?? '';

  // Build notes from non-system text fields
  const noteParts: string[] = [];
  for (const section of config.sections) {
    for (const question of section.questions) {
      if (question.system) continue;
      const val = data[question.id];
      if (val != null && val !== '' && typeof val !== 'boolean') {
        const valStr = Array.isArray(val) ? val.join(', ') : String(val);
        if (valStr) noteParts.push(`${question.label}: ${valStr}`);
      }
    }
  }

  return { name, email, phone, notes: noteParts.length > 0 ? noteParts.join('\n') : null };
}

export async function POST(req: NextRequest) {
  console.log('[APPLY-DEBUG] 1. Route handler entered');
  // ── IP-based rate limiting (10 submissions / IP / hour) ──────────────────
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const { allowed } = await checkRateLimit(`apply:rl:${ip}`, 10, 3600);
  console.log('[APPLY-DEBUG] 2. Rate limit passed');
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch (error) {
    console.warn('[apply] invalid JSON body', { error });
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Extract slug early from raw body to look up the space and its formConfig
  const rawSlug = typeof requestBody === 'object' && requestBody !== null
    ? (requestBody as Record<string, unknown>).slug
    : undefined;
  if (!rawSlug || typeof rawSlug !== 'string') {
    return NextResponse.json({ error: 'Invalid submission data' }, { status: 400 });
  }

  try {
    const space = await getSpaceFromSlug(rawSlug);
    console.log('[APPLY-DEBUG] 4. Space found:', space?.id);
    if (!space) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    // ── Extract leadType from the raw payload ─────────────────────────────
    // The "Getting Started" step sends leadType: 'rental' | 'buyer'.
    // We need this BEFORE fetching the form config so we fetch the correct one.
    const rawBody = requestBody as Record<string, unknown>;
    const rawLeadType = rawBody.leadType;
    const resolvedLeadType: 'rental' | 'buyer' =
      rawLeadType === 'buyer' ? 'buyer' : 'rental';

    // ── Determine if this space uses a dynamic form config ────────────────
    // Fetch the CORRECT config based on leadType (rental vs buyer)
    let formConfig: IntakeFormConfig | null = null;
    try {
      const rawConfig = await fetchFormConfigForLeadType(space.id, space.brokerageId, resolvedLeadType);
      if (rawConfig) {
        // Re-validate the stored config to guard against corrupt data
        formConfig = formConfigSchema.parse(rawConfig);
      }
    } catch (err) {
      console.warn('[apply] form config invalid or fetch failed, falling back to legacy', {
        spaceId: space.id,
        leadType: resolvedLeadType,
        err,
      });
      formConfig = null;
    }

    // ── Fetch the saved ScoringModel (AI-generated weights/ranges) ─────
    let scoringModel: ScoringModel | null = null;
    if (formConfig) {
      try {
        const scoringColumn = resolvedLeadType === 'buyer'
          ? 'buyerScoringModel'
          : 'rentalScoringModel';
        const { data: scoringSettings } = await supabase
          .from('SpaceSetting')
          .select(scoringColumn)
          .eq('spaceId', space.id)
          .maybeSingle();
        if (scoringSettings) {
          scoringModel = (scoringSettings as Record<string, unknown>)[scoringColumn] as ScoringModel | null;
        }
      } catch (err) {
        console.warn('[apply] scoring model fetch failed (non-fatal, will use legacy scoring)', {
          spaceId: space.id,
          leadType: resolvedLeadType,
          err,
        });
      }
    }

    // ── Validate & extract submission data ────────────────────────────────
    // Two code paths: dynamic form config vs legacy publicApplicationSchema
    let contactName: string;
    let contactEmail: string | null;
    let contactPhone: string;
    let contactNotes: string | null;
    let contactBudget: number | null;
    let contactPreferences: string | null;
    let contactAddress: string | null;
    let contactLeadType: 'rental' | 'buyer';
    let applicationData: Record<string, unknown>;
    let formConfigSnapshot: IntakeFormConfig | null = null;
    let privacyConsent: boolean | undefined;
    let slugForFingerprint: string;

    if (formConfig) {
      // ── Dynamic form config path ──────────────────────────────────────
      console.log('[apply] using dynamic form config', { spaceId: space.id, version: formConfig.version });
      const { schema: dynamicSchema } = buildDynamicSchema(formConfig);

      const parsed = dynamicSchema.safeParse(requestBody);
      if (!parsed.success) {
        console.warn('[apply] dynamic validation failed', { issues: parsed.error.issues });
        // Only return field-level path/message to the client, not full Zod internals
        const safeIssues = parsed.error.issues.map(i => ({
          path: i.path,
          message: i.message,
        }));
        return NextResponse.json({ error: 'Invalid submission data', issues: safeIssues }, { status: 400 });
      }

      const data = parsed.data as Record<string, unknown>;
      const extracted = extractContactFields(data, formConfig);

      contactName = extracted.name;
      contactEmail = extracted.email;
      contactPhone = extracted.phone;
      contactNotes = extracted.notes;
      // Use the resolved leadType from the "Getting Started" step, not the config's leadType
      // (the config's leadType reflects which form template it is, but the user's choice is authoritative)
      contactLeadType = resolvedLeadType;
      contactBudget = parseBudgetToNumber(data.monthlyRent ?? data.buyerBudget ?? data.monthlyGrossIncome ?? null);
      contactPreferences = typeof data.propertyAddress === 'string' ? data.propertyAddress : null;
      contactAddress = typeof data.currentAddress === 'string' ? data.currentAddress : null;
      privacyConsent = typeof data.privacyConsent === 'boolean' ? data.privacyConsent : undefined;
      slugForFingerprint = rawSlug;
      formConfigSnapshot = JSON.parse(JSON.stringify(formConfig));

      // Build applicationData from all submitted answers
      applicationData = {
        ...data,
        submittedAt: new Date().toISOString(),
        formConfigVersion: formConfig.version,
        leadType: contactLeadType,
      };
    } else {
      // ── Legacy path (backwards compatible) ────────────────────────────
      const parsed = publicApplicationSchema.safeParse(requestBody);
      if (!parsed.success) {
        console.warn('[apply] validation failed', { issues: parsed.error.issues });
        return NextResponse.json({ error: 'Invalid submission data' }, { status: 400 });
      }

      const payload = parsed.data;
      console.log('[APPLY-DEBUG] 3. Body parsed, slug:', payload.slug);

      contactName = payload.legalName;
      contactEmail = payload.email ?? null;
      contactPhone = payload.phone;
      // Use resolvedLeadType which was extracted from raw body before validation
      contactLeadType = resolvedLeadType;
      contactBudget = parseBudgetToNumber(
        payload.leadType === 'buyer'
          ? (payload.buyerBudget ?? payload.monthlyGrossIncome ?? null)
          : (payload.monthlyRent ?? payload.monthlyGrossIncome ?? null),
      );
      contactPreferences = payload.propertyAddress ?? null;
      contactAddress = payload.currentAddress ?? null;
      privacyConsent = payload.privacyConsent;
      slugForFingerprint = payload.slug;

      // Build notes for backwards compat with existing lead cards
      const noteParts: string[] = [];
      if (payload.targetMoveInDate) noteParts.push(`Timeline: ${payload.targetMoveInDate}`);
      if (payload.propertyAddress) noteParts.push(`Property: ${payload.propertyAddress}`);
      if (payload.employmentStatus) noteParts.push(`Employment: ${payload.employmentStatus}`);
      if (payload.monthlyGrossIncome != null) noteParts.push(`Income: $${payload.monthlyGrossIncome}/mo`);
      if (payload.additionalNotes) noteParts.push(payload.additionalNotes);
      contactNotes = noteParts.length > 0 ? noteParts.join('\n') : null;

      applicationData = buildApplicationData(payload);
    }

    const fingerprint = applicationFingerprintKey({
      slug: slugForFingerprint,
      legalName: contactName,
      phone: contactPhone,
      email: contactEmail,
    });
    const idempotencyKey = `apply:idempotency:${fingerprint}`;

    // First line of defense against duplicate creates from retries/double-click.
    let idempotencyLockAcquired = false;
    try {
      const lockResult = await redis.set(idempotencyKey, '1', { nx: true, ex: 120 });
      idempotencyLockAcquired = lockResult === 'OK';
    } catch (error) {
      console.warn('[apply] idempotency lock unavailable; using DB fallback', { error, spaceId: space.id });
    }

    // Expanded window: 5 minutes (was 2 minutes)
    const duplicateCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existingRecentLeads, error: dupError } = await supabase
      .from('Contact')
      .select('id, phone, email, scoringStatus, leadScore, scoreLabel, scoreSummary, scoreDetails, applicationRef')
      .eq('spaceId', space.id)
      .eq('name', contactName)
      .contains('tags', ['application-link'])
      .gte('createdAt', duplicateCutoff)
      .order('createdAt', { ascending: false })
      .limit(5);
    if (dupError) throw dupError;

    // Generate a unique application reference for the status page (24 hex chars = 96 bits entropy)
    const applicationRef = (crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')).slice(0, 24);

    // Generate a secure portal token for applicant access (64 hex chars = 256 bits entropy)
    const statusPortalToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

    if (existingRecentLeads?.length) {
      const normalizedPhone = normalizePhone(contactPhone);
      const normalizedEmail = (contactEmail ?? '').trim().toLowerCase();

      const duplicate = (existingRecentLeads as Contact[]).find((lead) => {
        const phoneMatch =
          normalizePhone(lead.phone ?? '') !== '' &&
          normalizePhone(lead.phone ?? '') === normalizedPhone;
        const emailMatch =
          normalizedEmail !== '' &&
          (lead.email ?? '').trim().toLowerCase() === normalizedEmail;
        return phoneMatch || emailMatch;
      });

    if (duplicate) {
        // Return the EXISTING contact's applicationRef (if any), not the newly
        // generated one that was never persisted. Using a phantom ref would
        // give the user a status-tracking link that points to nothing.
        const existingRef = (duplicate as Record<string, unknown>).applicationRef;
        return NextResponse.json(
          {
            success: true,
            id: duplicate.id,
            applicationRef: typeof existingRef === 'string' ? existingRef : undefined,
          },
          { status: 200 }
        );
      }
    }

    if (!idempotencyLockAcquired) {
      console.info('[apply] proceeding without distributed lock', {
        spaceId: space.id,
        slug: slugForFingerprint,
        fingerprint,
      });
    }

    // Fetch space settings for consent snapshot + applicant confirmation email
    let spacePrivacyPolicyUrl: string | null = null;
    let spaceBusinessName: string | null = null;
    let intakeConfirmationEmail: string | null = null;
    try {
      const { data: spaceSetting } = await supabase
        .from('SpaceSetting')
        .select('privacyPolicyUrl, businessName, intakeConfirmationEmail')
        .eq('spaceId', space.id)
        .maybeSingle();
      spacePrivacyPolicyUrl = spaceSetting?.privacyPolicyUrl ?? null;
      spaceBusinessName = spaceSetting?.businessName ?? null;
      intakeConfirmationEmail = spaceSetting?.intakeConfirmationEmail ?? null;
    } catch (err) {
      console.warn('[apply] failed to fetch space settings', { spaceId: space.id, err });
    }

    const contactInsert: Record<string, unknown> = {
      id: crypto.randomUUID(),
      spaceId: space.id,
      name: contactName,
      email: contactEmail,
      phone: contactPhone,
      budget: contactBudget,
      preferences: contactPreferences,
      address: contactAddress,
      notes: contactNotes,
      type: 'QUALIFICATION',
      properties: [],
      leadType: contactLeadType,
      formLeadType: contactLeadType,
      tags: ['application-link', 'new-lead'],
      scoringStatus: 'pending',
      scoreLabel: 'unscored',
      sourceLabel: 'intake-form',
      applicationData,
      applicationRef,
      statusPortalToken,
      applicationStatus: 'received',
      consentGiven: privacyConsent === true ? true : privacyConsent === false ? false : null,
      consentTimestamp: privacyConsent === true ? new Date().toISOString() : null,
      consentIp: privacyConsent === true ? ip : null,
      consentPrivacyPolicyUrl: privacyConsent === true ? spacePrivacyPolicyUrl : null,
    };

    // Store formConfigSnapshot so we know which config version generated this submission
    if (formConfigSnapshot) {
      contactInsert.formConfigSnapshot = formConfigSnapshot;
    }

    const { data: contacts, error: insertError } = await supabase
      .from('Contact')
      .insert(contactInsert)
      .select();
    if (insertError) throw insertError;
    const contact = contacts![0] as Contact;
    console.log('[APPLY-DEBUG] 5. Contact created:', contact?.id);

    // Create initial status update record for audit trail
    await supabase.from('ApplicationStatusUpdate').insert({
      contactId: contact.id,
      spaceId: space.id,
      fromStatus: null,
      toStatus: 'received',
      note: null,
    }).then(({ error: auditErr }) => {
      if (auditErr) console.warn('[apply] Initial status audit insert failed (non-fatal):', auditErr);
    });

    console.info('[apply] submission persisted', {
      contactId: contact.id,
      spaceId: space.id,
      slug: slugForFingerprint,
      dynamicForm: !!formConfigSnapshot,
    });

    // ── AI scoring + notification (both awaited before response) ───────────
    // On Vercel serverless the function is killed after the response is sent,
    // so all important work must complete before we return.
    let scoring: LeadScoringResult = {
      scoringStatus: 'failed',
      leadScore: null,
      scoreLabel: 'unscored',
      scoreSummary: 'Scoring unavailable right now. Lead saved successfully.',
      scoreDetails: null,
    };

    console.log('[APPLY-DEBUG] 6. Starting scoring');
    try {
      scoring = await scoreLeadApplicationDynamic({
        contactId: contact.id,
        formConfig: formConfigSnapshot,
        answers: formConfigSnapshot
          ? (applicationData as Record<string, string | string[] | number | boolean>)
          : undefined,
        name: contactName,
        email: contactEmail,
        phone: contactPhone,
        budget: contactBudget,
        applicationData: !formConfigSnapshot
          ? (applicationData as Record<string, unknown> & { legalName: string })
          : undefined,
        leadType: contactLeadType,
        scoringModel,
      });

      const { error: scoreUpdateError } = await supabase
        .from('Contact')
        .update({
          scoringStatus: scoring.scoringStatus,
          leadScore: scoring.leadScore,
          scoreLabel: scoring.scoreLabel,
          scoreSummary: scoring.scoreSummary,
          scoreDetails: scoring.scoreDetails,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', contact.id);
      if (scoreUpdateError) {
        console.error('[apply] scoring update failed', { contactId: contact.id, scoreUpdateError });
      } else {
        console.info('[apply] scoring persisted', {
          contactId: contact.id,
          scoringStatus: scoring.scoringStatus,
          scoreLabel: scoring.scoreLabel,
        });
      }
    } catch (error) {
      console.error('[apply] scoring failed', { contactId: contact.id, error });
      try {
        await supabase
          .from('Contact')
          .update({
            scoringStatus: 'failed',
            leadScore: null,
            scoreLabel: 'unscored',
            scoreSummary: 'Scoring unavailable right now. Lead saved successfully.',
            updatedAt: new Date().toISOString(),
          })
          .eq('id', contact.id);
      } catch (fallbackErr) {
        console.error('[apply] fallback scoring state failed', { contactId: contact.id, fallbackErr });
      }
    }

    console.log('[APPLY-DEBUG] 7. Scoring complete:', scoring?.scoringStatus);

    // Send realtor notification + applicant confirmation email in parallel
    const businessName = spaceBusinessName || space.name;

    const realtorNotification = notifyNewLead({
      spaceId: space.id,
      contactId: contact.id,
      name: contactName,
      phone: contactPhone ?? null,
      email: contactEmail ?? null,
      leadScore: scoring.leadScore,
      scoreLabel: scoring.scoreLabel,
      scoreSummary: scoring.scoreSummary,
      applicationData,
    }).catch((notifyErr) => {
      console.error('[apply] Realtor notification failed:', notifyErr);
    });

    const applicantConfirmation = contactEmail
      ? sendApplicationConfirmation({
          toEmail: contactEmail,
          applicantName: contactName,
          businessName,
          slug: slugForFingerprint,
          applicationRef,
          leadType: contactLeadType,
          customMessage: intakeConfirmationEmail,
          statusPortalToken,
        }).catch((confirmErr) => {
          console.error('[apply] Applicant confirmation email failed:', confirmErr);
        })
      : Promise.resolve();

    await Promise.all([realtorNotification, applicantConfirmation]);
    console.log('[apply] Notifications dispatched');

    console.log('[APPLY-DEBUG] 10. Returning response');
    return NextResponse.json(
      {
        success: true,
        id: contact.id,
        applicationRef,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[apply] unhandled submission failure', {
      slug: rawSlug,
      error,
    });
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
