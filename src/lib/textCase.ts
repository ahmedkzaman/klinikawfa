const NAME_LOWERCASE_EXCEPTIONS = new Set([
  'bin', 'binti', 'bt', 'bte', 'binte', 'a/l', 'a/p', 'al', 'el', 'd/o', 's/o', 'v/o',
]);

/**
 * Title-case a Malaysian name while keeping particles like
 * "bin", "binti", "a/l", "a/p" lowercase (unless they are the first word).
 * Whitespace is preserved exactly so the value round-trips cleanly.
 */
export function toMalayTitleCase(input: string): string {
  if (!input) return '';

  return input
    .toLocaleLowerCase()
    .split(/(\s+)/)
    .map((tok, i) => {
      if (/^\s+$/.test(tok)) return tok;
      if (i > 0 && NAME_LOWERCASE_EXCEPTIONS.has(tok)) return tok;
      return tok.charAt(0).toLocaleUpperCase() + tok.slice(1);
    })
    .join('');
}

/** Null-safe upper-case + trim, used at submit time to normalise DB values. */
export function toUpperSafe(input: string | null | undefined): string {
  return (input ?? '').trim().toLocaleUpperCase();
}
