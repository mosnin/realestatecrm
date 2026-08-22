import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { getSpaceFromSlug } from '@/lib/space';
import { scoreLeadApplicationDynamic } from '@/lib/lead-scoring';
import type { LeadScoringResult } from '@/lib/lead-scoring';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';
import { fireFirstTouch } from '@/lib/leads/first-touch';
import type { Contact } from '@/lib/types';
import {
  applicationFingerprintKey,
  normalizePhone,
} from '@/lib/public-application';
import { notifyNewLead } from '@/lib/notify';
import { runWorkflowsForEvent } from '@/lib/workflows/executor';
import { sendApplicationConfirmation } from '@/lib/email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { formConfigSchema, type IntakeFormConfig, type FormQuestion } from '@/lib/form-config-schema';
import { getFormConfigs, getDefaultFormConfig } from '@/lib/form-builder';
import { logger } from '@/lib/logger';
import { recordConsent } from '@/lib/messaging/compliance';
import { unscoped } from '@/lib/supabase-guard';


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
    logger.warn('[apply] getFormConfigs failed, trying legacy fetch', { spaceId }, err);
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
    logger.warn('[apply] legacy fetchFormConfig also failed', { spaceId }, err);
  }

  // No custom config: fall back to the default template the public intake
  // renders, so submissions are validated and scored against the same real
  // question set the applicant actually answered.
  return getDefaultFormConfig(leadType);
}

type VisibilityCondition = {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains';
  value: string;
} | undefined;

function evaluateVisibility(
  condition: VisibilityCondition,
  answers: Record<string, unknown>,
): boolean {
  if (!condition) return true;

  const raw = answers[condition.questionId];
  const currentValue = Array.isArray(raw)
    ? raw.join(',')
    : raw == null
      ? ''
      : String(raw);

  switch (condition.operator) {
    case 'equals':
      return currentValue === condition.value;
    case 'not_equals':
      return currentValue !== condition.value;
    case 'contains':
      return currentValue.includes(condition.value);
    default:
      return true;
  }
}

/**
 * Build a dynamic Zod schema that only enforces "required" on fields that are
 * visible for the current submission answers.
 *
 * Why: The client only submits answers from visible sections/questions.
 * If a required question is hidden by visibleWhen rules, the server must not
 * reject the submission for a missing hidden field.
 */
function buildDynamicSchemaForSubmission(
  config: IntakeFormConfig,
  submission: Record<string, unknown>,
) {
  const shape: Record<string, z.ZodTypeAny> = {
    slug: z.string().min(1),
  };

  const allQuestions: FormQuestion[] = [];

  for (const section of config.sections) {
    const sectionVisible = evaluateVisibility(section.visibleWhen, submission);

    for (const question of section.questions) {
      allQuestions.push(question);
      const questionVisible =
        sectionVisible && evaluateVisibility(question.visibleWhen, submission);

      let fieldSchema: z.ZodTypeAny;
      const required = questionVisible && question.required;

      switch (question.type) {
        case 'email':
          fieldSchema = required
            ? z.string().trim().min(1).email().max(255)
            : z.string().trim().email().max(255).optional().or(z.literal(''));
          break;
        case 'phone':
          fieldSchema = required
            ? z.string().trim().min(1).max(40)
            : z.string().trim().max(40).optional().or(z.literal(''));
          break;
        case 'number':
          fieldSchema = required
            ? z.union([z.number(), z.string()]).pipe(z.coerce.number())
            : z.union([z.number(), z.string(), z.null(), z.undefined()]).optional();
          break;
        case 'checkbox': {
          // The client stores checkbox answers as strings ('true'/'false') because
          // the question-renderer's onChange fires `e.target.checked ? 'true' : 'false'`.
          // Coerce both string and boolean representations to boolean.
          const boolCoerce = z.preprocess(
            (v) => {
              if (typeof v === 'boolean') return v;
              if (v === 'true' || v === '1') return true;
              if (v === 'false' || v === '0' || v === '' || v == null) return false;
              return v;
            },
            z.boolean(),
          );
          fieldSchema = required ? boolCoerce : boolCoerce.optional();
          break;
        }
        case 'multi_select':
          fieldSchema = required
            ? z.array(z.string()).min(1)
            : z.array(z.string()).optional();
          break;
        case 'date':
        case 'text':
        case 'textarea':
        case 'select':
        case 'radio':
        default:
          fieldSchema = required
            ? z.string().trim().min(1).max(4000)
            : z.string().trim().max(4000).optional().or(z.literal(''));
          break;
      }

      shape[question.id] = fieldSchema;
    }
  }

  return { schema: z.object(shape).passthrough(), allQuestions };
}

/**
 * Extract standard contact fields from dynamic form submission.
 */
function extractContactFields(data: Record<string, unknown>, config: IntakeFormConfig) {
  // Support split first/last name fields (new default) or legacy single name field
  const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : '';
  const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : '';
  const name = firstName && lastName
    ? `${firstName} ${lastName}`
    : firstName || lastName || ((data.name as string) ?? '');
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
  // ── IP-based rate limiting (10 submissions / IP / hour) ──────────────────
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(`apply:rl:${ip}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Try again in a bit.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Reject oversized payloads before parsing (1MB limit)
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (contentLength > 1_000_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch (error) {
    logger.warn('[apply] invalid JSON body', undefined, error);
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
    if (!space) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    // ── Extract leadType and sourceLabel from the raw payload ────────────
    // The "Getting Started" step sends leadType: 'rental' | 'buyer'.
    // We need this BEFORE fetching the form config so we fetch the correct one.
    const rawBody = requestBody as Record<string, unknown>;
    const rawLeadType = rawBody.leadType;
    const resolvedLeadType: 'rental' | 'buyer' =
      rawLeadType === 'buyer' ? 'buyer' : 'rental';

    // Accept a sourceLabel from the client only for the known AI-chat value.
    // All other sources default to 'intake-form' (set on contactInsert below).
    const ALLOWED_SOURCE_LABELS = new Set(['intake-form', 'intake-chat-ai']);
    const rawSourceLabel = typeof rawBody.sourceLabel === 'string' ? rawBody.sourceLabel : null;
    const resolvedSourceLabel: string =
      rawSourceLabel && ALLOWED_SOURCE_LABELS.has(rawSourceLabel)
        ? rawSourceLabel
        : 'intake-form';

    // ── Resolve the dynamic form config (custom, or default template) ─────
    // Fetch the CORRECT config based on leadType (rental vs buyer). This is
    // never null — fetchFormConfigForLeadType falls back to the default
    // template, so every submission is scored against a real question set.
    let formConfig: IntakeFormConfig;
    try {
      const rawConfig = await fetchFormConfigForLeadType(space.id, space.brokerageId, resolvedLeadType);
      // Re-validate the stored config to guard against corrupt data
      formConfig = formConfigSchema.parse(rawConfig);
    } catch (err) {
      logger.warn('[apply] form config invalid or fetch failed, using default template', {
        spaceId: space.id,
        leadType: resolvedLeadType,
      }, err);
      formConfig = getDefaultFormConfig(resolvedLeadType);
    }

    // ── Validate & extract submission data ────────────────────────────────
    // Single path: validate + score against the dynamic intake form config.
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

    // ── Score against the dynamic intake form config ────────────────────
    // Every submission is validated and scored against a real form config
    // (custom or the default template the public intake renders). There is no
    // legacy hardcoded-field path.
    logger.debug('[apply] using form config', { spaceId: space.id, version: formConfig.version });
    const { schema: dynamicSchema } = buildDynamicSchemaForSubmission(
      formConfig,
      requestBody as Record<string, unknown>,
    );

    const parsed = dynamicSchema.safeParse(requestBody);
    if (!parsed.success) {
      logger.warn('[apply] dynamic validation failed', { issues: parsed.error.issues });
      // Only return field-level path/message to the client, not full Zod internals
      const safeIssues = parsed.error.issues.map((i: z.ZodIssue) => ({
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
    // `data.budget` is the generic key emitted by the AI chat; the traditional
    // form uses `monthlyRent` (rental) or `buyerBudget` (buyer). Check all.
    contactBudget = parseBudgetToNumber(data.monthlyRent ?? data.buyerBudget ?? data.budget ?? data.monthlyGrossIncome ?? null);
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
      logger.warn('[apply] idempotency lock unavailable; using DB fallback', { spaceId: space.id }, error);
    }

    // Same-email dedupe across all time (case-insensitive) — BUT only when the
    // NAME also matches. An email is not an identity: shared household inboxes,
    // mistyped addresses, and re-used test emails all mean the same address can
    // belong to different applicants. Returning a prior contact's applicationRef
    // to a different person would hand them that person's status portal — a
    // cross-applicant data leak (the new submitter sees someone else's
    // application status). So we merge only on email + name; a same-email,
    // different-name submission falls through to a fresh contact with its own
    // ref + portal. The 5-minute name+phone window below still catches
    // double-tap resubmits for emailless flows.
    if (contactEmail) {
      const { data: emailMatches, error: emailDupErr } = await supabase
        .from('Contact')
        .select('id, name, applicationRef')
        .eq('spaceId', space.id)
        .ilike('email', contactEmail)
        .contains('tags', ['application-link'])
        .order('createdAt', { ascending: false })
        .limit(1);
      if (!emailDupErr && emailMatches && emailMatches.length > 0) {
        const match = emailMatches[0] as {
          id: string;
          name: string | null;
          applicationRef: string | null;
        };
        const sameName =
          (match.name ?? '').trim().toLowerCase() ===
          contactName.trim().toLowerCase();
        if (sameName) {
          return NextResponse.json(
            {
              success: true,
              id: match.id,
              applicationRef: match.applicationRef ?? undefined,
            },
            { status: 200 },
          );
        }
      }
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

    // Generate a unique application reference for the status page (64 hex chars = 256 bits entropy)
    const applicationRef = crypto.randomBytes(32).toString('hex');

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
      logger.info('[apply] proceeding without distributed lock', {
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
      logger.warn('[apply] failed to fetch space settings', { spaceId: space.id }, err);
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
      tags: [
        'application-link',
        'new-lead',
        ...(resolvedSourceLabel === 'intake-chat-ai' ? ['ai-chat'] : []),
      ],
      scoringStatus: 'pending',
      scoreLabel: 'unscored',
      sourceLabel: resolvedSourceLabel,
      // Structured lead-source attribution: this is the public per-realtor
      // intake form. (sourceLabel above remains the free-form sub-channel.)
      source: 'web_form',
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

    // TCPA/CAN-SPAM: turn the intake checkbox into real, per-channel consent
    // RECORDS (lib/messaging/compliance.ts). Without these the compliance gate
    // — which fails closed — blocks every automated marketing message to this
    // lead, so this write is what makes drip/nurture legal AND functional.
    // The disclosure text is frozen alongside the record: that is the artifact
    // that makes consent provable in a dispute.
    if (privacyConsent === true) {
      const disclosure =
        `Consented at intake on ${new Date().toISOString()} via the public application form` +
        (spacePrivacyPolicyUrl ? ` (privacy policy: ${spacePrivacyPolicyUrl})` : '');
      await Promise.all(
        ([
          ['email', contact.email],
          ['sms', contact.phone],
        ] as const)
          .filter(([, address]) => Boolean(address))
          .map(([channel, address]) =>
            recordConsent({
              spaceId: space.id,
              channel,
              address: address as string,
              contactId: contact.id,
              consentType: 'express_written',
              source: 'intake_form',
              disclosureText: disclosure,
              sourceIp: ip,
            }).catch((err) => {
              // Never fail an application over the consent record — but say so
              // loudly, because a missing record silently disables outreach.
              logger.error('[apply] consent record write failed', { contactId: contact.id }, err);
            }),
          ),
      );
    }

    // Create initial status update record for audit trail
    const { error: statusAuditErr } = await supabase
      .from('ApplicationStatusUpdate')
      .insert({
        contactId: contact.id,
        spaceId: space.id,
        fromStatus: null,
        toStatus: 'received',
        note: null,
      });
    if (statusAuditErr) {
      logger.warn('[apply] initial status audit insert failed (non-fatal)', { contactId: contact.id }, statusAuditErr);
    }

    logger.info('[apply] submission persisted', {
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
      scoreSummary: 'Scoring unavailable right now. Lead saved.',
      scoreDetails: null,
    };

    try {
      scoring = await scoreLeadApplicationDynamic({
        contactId: contact.id,
        formConfig: formConfigSnapshot,
        answers: applicationData as Record<string, string | string[] | number | boolean>,
        leadType: contactLeadType,
      });

      const { error: scoreUpdateError } = await unscoped(supabase
        .from('Contact'), 'public intake: slug/token then scoped write')
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
        logger.error('[apply] scoring update failed', { contactId: contact.id }, scoreUpdateError);
      } else {
        logger.info('[apply] scoring persisted', {
          contactId: contact.id,
          scoringStatus: scoring.scoringStatus,
          scoreLabel: scoring.scoreLabel,
        });
      }
    } catch (error) {
      logger.error('[apply] scoring failed', { contactId: contact.id }, error);
      try {
        await unscoped(supabase
          .from('Contact'), 'public intake: slug/token then scoped write')
          .update({
            scoringStatus: 'failed',
            leadScore: null,
            scoreLabel: 'unscored',
            scoreSummary: 'Scoring unavailable right now. Lead saved.',
            updatedAt: new Date().toISOString(),
          })
          .eq('id', contact.id);
      } catch (fallbackErr) {
        logger.error('[apply] fallback scoring state failed', { contactId: contact.id }, fallbackErr);
      }
    }

    // Send realtor notification + applicant confirmation email in parallel
    const businessName = spaceBusinessName || space.name;

    const realtorNotification = notifyNewLead({
      spaceId: space.id,
      contactId: contact.id,
      name: contactName,
      phone: contactPhone ?? null,
      email: contactEmail ?? null,
      budget: contactBudget,
      leadScore: scoring.leadScore,
      scoreLabel: scoring.scoreLabel,
      scoreSummary: scoring.scoreSummary,
      applicationData,
    }).catch((notifyErr) => {
      logger.error('[apply] realtor notification failed', { contactId: contact.id }, notifyErr);
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
          logger.error('[apply] applicant confirmation email failed', { contactId: contact.id }, confirmErr);
        })
      : Promise.resolve();

    await Promise.all([realtorNotification, applicantConfirmation]);
    logger.debug('[apply] notifications dispatched', { contactId: contact.id });

    // Fire the agent trigger so Chippi reacts to the new application in real
    // time (drafts a follow-up, scores against the realtor's criteria, etc.)
    // instead of waiting for the 4-hour cron sweep.
    try {
      await fireAgentTrigger({
        spaceId: space.id,
        event: 'application_submitted',
        contactId: contact.id,
      });
    } catch (e) {
      logger.error('[apply] agent trigger failed (non-fatal)', { contactId: contact.id }, e);
    }

    // ── Instant First Touch (fire-and-forget) ──────────────────────────────
    // Compose a grounded intro and (by default) send it while the lead is
    // still warm. Placed after scoring so the draft grounds on the scored
    // contact. fireFirstTouch never throws and registers its own after()
    // keep-alive — zero latency added to the applicant's response.
    // The try/catch is belt-and-suspenders: a bug in that module must never
    // fail the submission.
    try {
      void fireFirstTouch({ spaceId: space.id, contactId: contact.id, origin: 'inbound' });
    } catch (e) {
      logger.error('[apply] first-touch dispatch failed (non-fatal)', { contactId: contact.id }, e);
    }

    // ── Workflow engine dispatch (fire-and-forget) ─────────────────────────
    // Run AFTER the response so a workflow run never blocks, slows, or changes
    // the outcome of lead creation. `after()` defers to post-response; the body
    // is fully wrapped so a workflow error can NEVER surface to the applicant.
    //
    // We fire two trigger types off this one creation event:
    //   - lead_created          — always.
    //   - lead_score_threshold  — only when a numeric score is known.
    // The persisted contact row carries the scored fields (leadScore etc.) so a
    // workflow condition (e.g. score >= 80) has the value to gate on.
    //
    // FUTURE REFINEMENT: honor trigger.config.min directly in runWorkflowsForEvent
    // so a lead_score_threshold workflow is only run when the score actually
    // crosses its configured floor; today the workflow's conditions do that
    // filtering.
    const finalScore = scoring.leadScore;
    const leadRow: Record<string, unknown> = {
      ...(contact as unknown as Record<string, unknown>),
      leadScore: finalScore,
      score: finalScore,
      scoreLabel: scoring.scoreLabel,
      scoringStatus: scoring.scoringStatus,
    };
    // `after()` itself throws when called outside a request scope (e.g. unit
    // tests that invoke POST directly), so the scheduling call is wrapped too —
    // the same idiom as lib/ai-tools/persistence.ts. The dispatch is
    // best-effort; a missing request context must never turn a 201 into a 500.
    try {
      after(async () => {
        try {
          await runWorkflowsForEvent({
            spaceId: space.id,
            triggerType: 'lead_created',
            context: { event: { type: 'lead_created' }, lead: leadRow, contact: leadRow },
            triggerEvent: { type: 'lead_created', contactId: contact.id },
          });
        } catch (workflowErr) {
          logger.error('[apply] lead_created workflow dispatch failed (non-fatal)', { contactId: contact.id }, workflowErr);
        }
        if (typeof finalScore === 'number') {
          try {
            await runWorkflowsForEvent({
              spaceId: space.id,
              triggerType: 'lead_score_threshold',
              context: { event: { type: 'lead_score_threshold', score: finalScore }, lead: leadRow, contact: leadRow },
              triggerEvent: { type: 'lead_score_threshold', contactId: contact.id, score: finalScore },
            });
          } catch (workflowErr) {
            logger.error('[apply] lead_score_threshold workflow dispatch failed (non-fatal)', { contactId: contact.id }, workflowErr);
          }
        }
      });
    } catch (afterErr) {
      logger.error('[apply] workflow after() scheduling skipped (no request scope)', { contactId: contact.id }, afterErr);
    }

    return NextResponse.json(
      {
        success: true,
        id: contact.id,
        applicationRef,
        // Returned so the client confirmation can link straight into the
        // applicant's status portal (/apply/[slug]/status?ref=…&token=…).
        // Only the fresh-submission path exposes it; the dedupe paths above
        // return ref-only and the status page falls back to the read-only view.
        statusPortalToken,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('[apply] unhandled submission failure', { slug: rawSlug }, error);
    return NextResponse.json({ error: "Server hiccup — usually temporary." }, { status: 500 });
  }
}
