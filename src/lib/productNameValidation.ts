const NON_PRODUCT_PATTERNS = [
  /^hi\\b/i,
  /^hello\\b/i,
  /^dear\\b/i,
  /no\\s+cost\\s+emi/i,
  /visa\\s+card\\s+ending/i,
  /you have availed/i,
  /^congratulations!?/i,
  /please share (?:your )?feedback/i,
  /return request processed/i,
  /your order (?:has been|is) (?:placed|confirmed|shipped|delivered)/i,
  /^(?:order|delivery|shipping|payment|refund|return) (?:update|confirmation|details|notification)/i,
  /^(?:view|track) (?:your )?(?:order|package)/i,
  /^(?:amazon|flipkart|myntra|ajio)$/i,
  /^unknown article$/i,
];

export function isPlausibleProductName(value: string | null | undefined): boolean {
  if (!value) return false;
  const name = value.replace(/[“”"']/g, '').replace(/\\s+/g, ' ').trim();
  if (name.length < 4 || name.length > 220) return false;
  if (!/[a-z0-9]{3}/i.test(name)) return false;
  if (NON_PRODUCT_PATTERNS.some(pattern => pattern.test(name))) return false;
  // Reject sentence-like promotional/email copy rather than product titles.
  if (name.split(/\\s+/).length > 16 && /[.!?]/.test(name)) return false;
  return true;
}
