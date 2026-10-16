/** Light check for a usable address: something@domain.tld, no spaces. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i.test(value.trim());
}
