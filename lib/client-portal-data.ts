/**
 * Client-portal data — aggregates everything tied to a verified client email
 * across ALL spaces: applications (Contact rows) and tours (Tour rows). This is
 * the "one page by email" surface. Read-only against realtor data; the client's
 * verified email is the authorization boundary (only rows matching their email).
 */
import 'server-only';
import { supabase } from '@/lib/supabase';
import { escapeIlikePattern } from '@/lib/ilike';

export interface PortalApplication {
  contactId: string;
  name: string | null;
  status: string;
  statusNote: string | null;
  applicationRef: string | null;
  spaceId: string;
  realtorName: string | null;
  realtorSlug: string | null;
  createdAt: string;
}

export interface PortalTour {
  id: string;
  propertyAddress: string | null;
  startsAt: string | null;
  status: string | null;
  spaceId: string;
  contactId: string | null;
  realtorName: string | null;
  realtorSlug: string | null;
}

export interface ClientPortalData {
  applications: PortalApplication[];
  tours: PortalTour[];
  /** Contact ids this client owns (by verified email) — the scope for
   *  messaging, documents, and info-requests. */
  contactIds: string[];
}

type SpaceRel = { name?: string | null; slug?: string | null } | null;

/**
 * Pull the client's applications + tours by email. `email` MUST be the verified
 * session email — it is the only authorization check, so never pass an
 * unverified or caller-supplied address here.
 */
export async function getClientPortalData(email: string): Promise<ClientPortalData> {
  const lower = email.trim().toLowerCase();
  // `_`/`%` are legal in email local-parts. Without escaping, a client
  // registered as `jane_doe@x.com` matches every `janeXdoe@x.com` tour —
  // including other tenants. Contact lookup was already escaped; Tour was not.
  const emailLiteral = escapeIlikePattern(lower);

  const [{ data: contacts }, { data: tours }] = await Promise.all([
    supabase
      .from('Contact')
      .select(
        'id, name, email, applicationStatus, applicationStatusNote, applicationRef, spaceId, createdAt, Space(name, slug)',
      )
      .ilike('email', emailLiteral)
      .order('createdAt', { ascending: false }),
    supabase
      .from('Tour')
      .select('id, propertyAddress, startsAt, status, spaceId, contactId, guestEmail, Space(name, slug)')
      .ilike('guestEmail', emailLiteral)
      .order('createdAt', { ascending: false }),
  ]);

  const applications: PortalApplication[] = (contacts ?? []).map((c) => {
    const space = c.Space as SpaceRel;
    return {
      contactId: c.id as string,
      name: (c.name as string | null) ?? null,
      status: (c.applicationStatus as string | null) ?? 'received',
      statusNote: (c.applicationStatusNote as string | null) ?? null,
      applicationRef: (c.applicationRef as string | null) ?? null,
      spaceId: c.spaceId as string,
      realtorName: space?.name ?? null,
      realtorSlug: space?.slug ?? null,
      createdAt: c.createdAt as string,
    };
  });

  const portalTours: PortalTour[] = (tours ?? []).map((t) => {
    const space = t.Space as SpaceRel;
    return {
      id: t.id as string,
      propertyAddress: (t.propertyAddress as string | null) ?? null,
      startsAt: (t.startsAt as string | null) ?? null,
      status: (t.status as string | null) ?? null,
      spaceId: t.spaceId as string,
      contactId: (t.contactId as string | null) ?? null,
      realtorName: space?.name ?? null,
      realtorSlug: space?.slug ?? null,
    };
  });

  const contactIds = Array.from(
    new Set([
      ...applications.map((a) => a.contactId),
      ...portalTours.map((t) => t.contactId).filter((id): id is string => Boolean(id)),
    ]),
  );

  return { applications, tours: portalTours, contactIds };
}

/** Guard: does this verified email own this contact? Used by messaging / docs
 *  / info-request endpoints before any read or write on a contact. */
export async function clientOwnsContact(email: string, contactId: string): Promise<boolean> {
  const lower = email.trim().toLowerCase();
  const { data } = await supabase
    .from('Contact')
    .select('id')
    .eq('id', contactId)
    .ilike('email', escapeIlikePattern(lower))
    .maybeSingle();
  return Boolean(data);
}
