import type { Handler } from "@netlify/functions";
import { adminAuth } from "../../api/_lib/firebase-admin";
import { extractBearerToken, resolveEntitlementForUser } from "../../api/_lib/subscription-service";

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const token = extractBearerToken(event);
    if (!token) {
      return json(401, { code: "AUTH_REQUIRED", error: "Authentication required." });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const entitlement = await resolveEntitlementForUser({
      uid: decoded.uid,
      email: decoded.email,
    });

    return json(200, { entitlement });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("id-token") || message.includes("auth/")) {
      return json(401, { code: "AUTH_INVALID", error: "Session expired. Please sign in again." });
    }
    console.error("[subscription-status] failed:", error);
    return json(500, { error: "Unable to resolve subscription status." });
  }
};
