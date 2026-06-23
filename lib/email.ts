// Pure email utility — safe to import in both server and client components.

/**
 * Apply a Tomba-style format pattern to a person's name.
 * Handles tokens: {first}, {last}, {f} (first initial), {l} (last initial).
 * Returns null when the name is too short to fill all tokens, or when the
 * format contains an unrecognised token after substitution.
 */
export function applyEmailFormat(
  format: string,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  domain: string,
): string | null {
  const first = (firstName ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const last = (lastName ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!first && !last) return null;

  const local = format
    .replace('{first}', first)
    .replace('{last}', last)
    .replace('{f}', first[0] ?? '')
    .replace('{l}', last[0] ?? '');

  // If an unresolved token remains (e.g. the format uses an unknown placeholder)
  // or the local part is empty, skip.
  if (!local || local.includes('{')) return null;
  return `${local}@${domain}`;
}
