export const MIN_PASSWORD_LENGTH = 8;

const LOWER = /[a-z]/;
const UPPER = /[A-Z]/;
const DIGIT = /\d/;
const SYMBOL = /[^A-Za-z0-9]/;

export const passwordChecks = [
  {
    label: "At least 8 characters",
    test: (password: string) => password.length >= MIN_PASSWORD_LENGTH,
  },
  {
    label: "One uppercase letter (A-Z)",
    test: (password: string) => UPPER.test(password),
  },
  {
    label: "One lowercase letter (a-z)",
    test: (password: string) => LOWER.test(password),
  },
  {
    label: "One number (0-9)",
    test: (password: string) => DIGIT.test(password),
  },
  {
    label: "One special character (!@#$%...)",
    test: (password: string) => SYMBOL.test(password),
  },
] as const;

export function passwordError(password: string, confirmation: string) {
  const unmet = passwordChecks.find((check) => !check.test(password));

  if (unmet) {
    return unmet.label;
  }

  if (password !== confirmation) {
    return "Passwords do not match.";
  }

  return null;
}
