import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyError,
  getFriendlyErrorMessage,
  logInternalDiagnostic,
} from "../src/utils/friendlyErrors.ts";

test("network errors are classified with helpful connectivity copy", () => {
  const err1 = new Error("Failed to fetch");
  assert.equal(
    getFriendlyErrorMessage(err1),
    "Unable to connect. Please check your internet connection and try again."
  );

  const err2 = { code: "auth/network-request-failed" };
  assert.equal(
    getFriendlyErrorMessage(err2),
    "Unable to connect. Please check your internet connection and try again."
  );

  const classification = classifyError(new Error("net::ERR_NAME_NOT_RESOLVED"));
  assert.equal(classification.category, "network");
  assert.equal(classification.recoverable, true);
});

test("invalid authentication credentials never leak user-not-found or wrong-password", () => {
  const errWrongPassword = { code: "auth/wrong-password" };
  assert.equal(
    getFriendlyErrorMessage(errWrongPassword),
    "The username or password is incorrect. Check your details and try again."
  );

  const errUserNotFound = new Error("Firebase: Error (auth/user-not-found).");
  assert.equal(
    getFriendlyErrorMessage(errUserNotFound),
    "The username or password is incorrect. Check your details and try again."
  );

  const errInvalidCredential = { code: "auth/invalid-credential" };
  assert.equal(
    getFriendlyErrorMessage(errInvalidCredential),
    "The username or password is incorrect. Check your details and try again."
  );
});

test("expired sessions prompt the user to sign in again calmly", () => {
  const err = { code: "auth/id-token-expired" };
  const classification = classifyError(err);
  assert.equal(classification.category, "authentication");
  assert.equal(
    classification.userMessage,
    "Your session has expired. Please sign in again to continue."
  );
});

test("suspended or disabled accounts provide clear guidance", () => {
  const err = { code: "auth/user-disabled" };
  const classification = classifyError(err);
  assert.equal(classification.category, "authentication");
  assert.equal(
    classification.userMessage,
    "This account is currently disabled or suspended. Please contact your administrator."
  );
  assert.equal(classification.recoverable, false);
});

test("duplicate email conflicts are identified and guided", () => {
  const err = { code: "auth/email-already-in-use" };
  const classification = classifyError(err);
  assert.equal(classification.category, "conflict");
  assert.equal(
    classification.userMessage,
    "An account with this email address already exists. Please sign in or use a different email."
  );
});

test("rate limiting is classified with calm retry advice", () => {
  const err = { code: "auth/too-many-requests" };
  const classification = classifyError(err);
  assert.equal(classification.category, "rate_limit");
  assert.equal(
    classification.userMessage,
    "Too many requests. Please wait a moment before trying again."
  );
});

test("permission denied errors protect internal collections and roles", () => {
  const err = { code: "permission-denied" };
  const classification = classifyError(err);
  assert.equal(classification.category, "permission");
  assert.equal(
    classification.userMessage,
    "You do not have permission to perform this action. Contact your administrator if you believe this is a mistake."
  );

  // Never leaks collection name or rules path
  assert.equal(classification.userMessage.includes("firestore"), false);
  assert.equal(classification.userMessage.includes("rule"), false);
});

test("HTTP 500 and internal server errors present calm user-facing messages", () => {
  const err = { status: 500, message: "Internal server error" };
  const classification = classifyError(err);
  assert.equal(classification.category, "server");
  assert.equal(
    classification.userMessage,
    "We couldn't complete that request right now. Your data has not been confirmed as saved. Please try again shortly."
  );
});

test("fallback message is used when provided for unrecognized errors", () => {
  const customFallback = "Could not publish this examination draft.";
  const friendly = getFriendlyErrorMessage(new Error("Something unhandled"), customFallback);
  assert.equal(friendly, customFallback);
});

test("logInternalDiagnostic safely executes and strips sensitive fields", () => {
  let capturedLog = null;
  const originalError = console.error;
  console.error = (...args) => {
    capturedLog = args;
  };

  try {
    logInternalDiagnostic("TestOperation", new Error("Simulated failure"), {
      username: "student_john",
      password: "SuperSecretPassword123!",
      accessCode: "JBS-ABC12345",
      safeMeta: "Safe metadata",
    });

    assert.ok(capturedLog);
    const logOutput = JSON.stringify(capturedLog);
    assert.ok(logOutput.includes("Jaystarbliss::Diagnostic"));
    assert.ok(logOutput.includes("TestOperation"));
    assert.ok(logOutput.includes("student_john"));
    assert.ok(logOutput.includes("Safe metadata"));
    // Verify sensitive fields are strictly redacted
    assert.ok(!logOutput.includes("SuperSecretPassword123!"));
    assert.ok(!logOutput.includes("JBS-ABC12345"));
    assert.ok(logOutput.includes("[REDACTED]"));
  } finally {
    console.error = originalError;
  }
});
