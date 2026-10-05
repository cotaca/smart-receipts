// Mirror of the backend policy (`_meets_password_policy` in
// backend/src/backend/schemas/auth.py). Keep the character classes identical.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

export function checkPassword(pw: string) {
  return {
    length: [...pw].length >= MIN_PASSWORD_LENGTH,
    upper: /\p{Lu}/u.test(pw),
    lower: /\p{Ll}/u.test(pw),
    digit: /\p{N}/u.test(pw),
    special: /[^\p{L}\p{N}]/u.test(pw),
    tooLong: new TextEncoder().encode(pw).length > MAX_PASSWORD_BYTES,
  };
}

export function isValidPassword(pw: string): boolean {
  const { tooLong, ...rules } = checkPassword(pw);
  return !tooLong && Object.values(rules).every(Boolean);
}

// Like <input type="email"> plus a dot in the domain. The server (EmailStr)
// stays authoritative.
export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s);
}
