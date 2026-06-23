// Apollo API wrapper — person match by LinkedIn URL or name+domain.
// Used in the reveal route as a cheap ($0.01) intermediate tier between
// Company Enrich ($0.12) and ContactOut ($0.55).

import { callOrthogonal } from './orthogonal';

interface RawApolloMatch {
  person?: {
    email?: string | null;
    email_status?: string | null;
  } | null;
}

export interface ApolloMatchParams {
  linkedin?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
  domain?: string | null;
}

// Cheap role/org-inbox heuristic so we don't surface generic catch-alls.
// Apollo sometimes returns a company-name email (e.g. bostonconsultinggroup@bcg.com)
// for high-profile people — detect these by checking if the local part contains
// the domain root (the part before the first dot) as a substring.
function isGenericEmail(email: string, domain: string | null | undefined): boolean {
  const local = email.split('@')[0].toLowerCase();
  if (!local) return true;
  // Match the domain root (e.g. "bcg" from "bcg.com")
  const root = (domain ?? '').split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (root.length >= 5 && local.includes(root)) return true;
  return false;
}

/**
 * Match a person in the Apollo database and return their email ($0.01).
 * Returns null when not found, when Apollo returns a generic/role inbox,
 * or when no identifying parameters are provided.
 */
export async function matchPerson(params: ApolloMatchParams): Promise<string | null> {
  const hasLinkedin = !!params.linkedin;
  const hasName = !!(params.firstName && params.lastName);
  const hasOrg = !!(params.organizationName || params.domain);
  if (!hasLinkedin && !(hasName && hasOrg)) return null;

  const body: Record<string, unknown> = { reveal_personal_emails: false };
  if (params.linkedin) body.linkedin_url = params.linkedin;
  if (params.firstName) body.first_name = params.firstName;
  if (params.lastName) body.last_name = params.lastName;
  if (params.organizationName) body.organization_name = params.organizationName;
  if (params.domain) body.domain = params.domain;

  const raw = await callOrthogonal<RawApolloMatch>('apollo', '/api/v1/people/match', body, 'POST');
  const email = raw?.person?.email ?? null;
  if (!email) return null;
  if (isGenericEmail(email, params.domain)) return null;
  return email;
}
