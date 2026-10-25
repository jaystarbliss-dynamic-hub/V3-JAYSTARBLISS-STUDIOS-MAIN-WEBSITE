import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  hashStudentAccessCode,
  matchesStudentCredentials,
  normalizeStudentUsername
} from "../api/_lib/student-login-compat.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");

test("normalizes usernames consistently with old and new login paths", () => {
  assert.equal(normalizeStudentUsername("  @Jane Doe  "), "janedoe");
  assert.equal(normalizeStudentUsername("JANE"), "jane");
});

test("accepts the uppercase-normalized hash used by new school onboarding", () => {
  const profile = { username: "newstudent", accessCodeHash: hashStudentAccessCode("abc-123-XYZ") };
  assert.equal(matchesStudentCredentials([profile], "abc-123-XYZ", "newstudent"), true);
  assert.equal(matchesStudentCredentials([profile], "ABC-123-XYZ", "newstudent"), true);
});

test("accepts a legacy hash made from the exact submitted code", () => {
  const profile = { username: "legacy", accessCodeHash: sha256("MiXeD-Code") };
  assert.equal(matchesStudentCredentials([profile], "MiXeD-Code", "legacy"), true);
});

test("accepts historical passwordHash and customPasswordHash formats", () => {
  assert.equal(matchesStudentCredentials([{ username: "one", passwordHash: sha256("Secret") }], "Secret", "one"), true);
  assert.equal(matchesStudentCredentials([{ username: "two", customPasswordHash: sha256("SECRET") }], "secret", "two"), true);
});

test("accepts old plaintext accessCode, passcode, and code fields case-insensitively", () => {
  assert.equal(matchesStudentCredentials([{ username: "one", accessCode: "Abc-123" }], "abc-123", "one"), true);
  assert.equal(matchesStudentCredentials([{ username: "two", passcode: "Abc-123" }], "ABC-123", "two"), true);
  assert.equal(matchesStudentCredentials([{ username: "three", code: "Abc-123" }], "abc-123", "three"), true);
});

test("accepts old customPassword only when its case-sensitive value matches", () => {
  const profile = { username: "student", customPassword: "CaseSensitive" };
  assert.equal(matchesStudentCredentials([profile], "CaseSensitive", "student"), true);
  assert.equal(matchesStudentCredentials([profile], "casesensitive", "student"), false);
});

test("checks linked user profile credentials as well as the student record", () => {
  const student = { username: "linked-student", fullName: "Linked Student" };
  const user = { role: "student", accessCodeHash: hashStudentAccessCode("JBS-1234") };
  assert.equal(matchesStudentCredentials([student, user], "JBS-1234", "linked-student"), true);
});

test("preserves legacy swapped-input login only when both code and username match", () => {
  const profile = { username: "@Old Student", accessCode: "OLD-CODE" };
  assert.equal(matchesStudentCredentials([profile], "old student", "old-code"), true);
  assert.equal(matchesStudentCredentials([profile], "someone-else", "old-code"), false);
});

test("rejects a wrong code and never authenticates on username alone", () => {
  const profile = { username: "student", accessCodeHash: hashStudentAccessCode("right-code") };
  assert.equal(matchesStudentCredentials([profile], "wrong-code", "student"), false);
  assert.equal(matchesStudentCredentials([{ username: "student" }], "student", "student"), false);
});

test("accepts access codes entered with or without hyphens and spaces", () => {
  const hashedProfile = { username: "jaystarbliss", accessCodeHash: hashStudentAccessCode("JBS-4829") };
  assert.equal(matchesStudentCredentials([hashedProfile], "JBS4829", "jaystarbliss"), true);
  assert.equal(matchesStudentCredentials([hashedProfile], "jbs 4829", "JAYSTARBLISS"), true);

  const plainProfile = { username: "JAYSTARBLISS", accessCode: "JBS-4829" };
  assert.equal(matchesStudentCredentials([plainProfile], "jbs4829", "jaystarbliss"), true);
});

