import { ApiError } from "../middleware/errors.js";

/**
 * Minimum password policy (Prompt 8): at least 10 chars with letters and digits.
 * Enforced wherever a human-chosen password is SET; login only ever compares
 * hashes and must not leak policy state.
 */
export function assertPasswordPolicy(password: string): void {
  const problems: string[] = [];
  if (password.length < 10) problems.push("at least 10 characters");
  if (!/[A-Za-z]/.test(password)) problems.push("one letter");
  if (!/\d/.test(password)) problems.push("one digit");
  if (problems.length > 0) {
    throw ApiError.badRequest(
      `Password must contain ${problems.join(", ")}`,
      { code: "PASSWORD_POLICY" },
    );
  }
}
