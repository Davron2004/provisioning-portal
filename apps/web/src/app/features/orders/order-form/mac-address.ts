const HEX_PAIRS = /^[0-9A-F]{12}$/;

/**
 * Accepts a MAC address however it is typed or pasted ("001a2b3c4d5e",
 * "00-1a-2b-3c-4d-5e", "00:1A:2B:3C:4D:5E") and returns the contract's form,
 * upper-case and colon-separated. Null when it is empty or not a MAC address.
 */
export function normalizeMac(value: string | null | undefined): string | null {
  const hex = (value ?? '').replace(/[\s:.-]/g, '').toUpperCase();
  return HEX_PAIRS.test(hex) ? (hex.match(/../g) ?? []).join(':') : null;
}
