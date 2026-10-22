import { createHash } from "node:crypto";

const CODE_FIELDS = ["accessCode", "passcode", "code"];
const PLAINTEXT_PASSWORD_FIELDS = ["password", "customPassword"];
const HASH_FIELDS = [
  "accessCodeHash",
  "passwordHash",
  "customPasswordHash",
  "passcodeHash",
  "codeHash",
  "hashedAccessCode"
];
const USERNAME_FIELDS = ["username", "studentUsername", "loginUsername", "userName"];

const clean = value => String(value ?? "").trim();
const normalizeCode = value => clean(value).toUpperCase();

export function normalizeStudentUsername(value) {
  return clean(value).toLowerCase().replace(/^@/, "").replace(/\\s+/g, "");
}

export function hashStudentAccessCode(value) {
  return createHash("sha256").update(normalizeCode(value)).digest("hex");
}

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");

function hashesFor(value) {
  const raw = clean(value);
  return new Set([sha256(raw), sha256(normalizeCode(raw))].map(hash => hash.toLowerCase()));
}

function matchesStoredPlainCode(profile, suppliedCode) {
  const raw = clean(suppliedCode);
  const normalized = normalizeCode(raw);
  return CODE_FIELDS.some(field => {
    const stored = clean(profile?.[field]);
    return !!stored && (stored === raw || normalizeCode(stored) === normalized);
  });
}

/**
 * Validate a submitted student credential against the student record and any
 * linked users/{uid} profile. Supports both historical SHA-256 formats (hashing
 * the submitted case or its uppercase normalized form) and older plaintext
 * fields, while keeping all verification on the trusted server.
 */
export function matchesStudentCredentials(profiles, suppliedCode, identifier = "") {
  const rawCode = clean(suppliedCode);
  if (!rawCode) return false;
  const codeHashes = hashesFor(rawCode);
  const idHashes = hashesFor(identifier);

  for (const profile of profiles || []) {
    if (!profile || typeof profile !== "object") continue;

    if (matchesStoredPlainCode(profile, rawCode)) return true;

    // Older student/tutor imports used these fields instead of accessCode.
    if (PLAINTEXT_PASSWORD_FIELDS.some(field => {
      const stored = clean(profile[field]);
      return !!stored && stored === rawCode;
    })) return true;

    if (HASH_FIELDS.some(field => {
      const storedHash = clean(profile[field]).toLowerCase();
      return !!storedHash && (codeHashes.has(storedHash));
    })) return true;

    // Preserve the historical swapped-input behavior without allowing a
    // username alone to authenticate: the identifier must itself match the
    // student's stored plaintext/hash code, and the second field must match
    // that same record's username.
    const identifierMatchesStoredCode =
      matchesStoredPlainCode(profile, identifier) ||
      HASH_FIELDS.some(field => {
        const storedHash = clean(profile[field]).toLowerCase();
        return !!storedHash && idHashes.has(storedHash);
      });

    const submittedUsername = normalizeStudentUsername(rawCode);
    const storedUsername = USERNAME_FIELDS
      .map(field => normalizeStudentUsername(profile[field]))
      .filter(Boolean);

    if (identifierMatchesStoredCode && submittedUsername && storedUsername.includes(submittedUsername)) {
      return true;
    }
  }

  return false;
}
