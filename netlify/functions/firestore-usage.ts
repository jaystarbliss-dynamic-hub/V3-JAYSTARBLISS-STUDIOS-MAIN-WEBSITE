import type { Handler } from "@netlify/functions";
import { getAdminApp } from "../../api/_lib/firebase-admin";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const bearer = (event: any) => {
  const value = event.headers?.authorization || event.headers?.Authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
};

const numberValue = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });
  try {
    const token = bearer(event);
    if (!token) return json(401, { error: "Authentication required." });
    const decoded = await adminAuth.verifyIdToken(token);
    const claims = decoded as Record<string, any>;
    let role = String(claims.role || claims.userRole || "").toUpperCase();
    if (!role) {
      const user = await adminDb.collection("users").doc(decoded.uid).get();
      role = String(user.data()?.role || "").toUpperCase();
    }
    if (!["ADMIN", "SUPER_ADMIN", "MAIN_ADMIN"].includes(role)) {
      return json(403, { error: "Administrator access required." });
    }

    const app = getAdminApp();
    const credential = app?.options.credential as any;
    if (!credential?.getAccessToken) {
      return json(200, {
        available: false,
        reason: "The server credential cannot request Google Cloud Monitoring access tokens.",
      });
    }

    const access = await credential.getAccessToken();
    const accessToken = typeof access === "string" ? access : access?.access_token || access?.accessToken;
    if (!accessToken) {
      return json(200, { available: false, reason: "Google Cloud Monitoring credentials are unavailable." });
    }

    // The daily Firestore usage chart is sourced from Cloud Monitoring, not estimated
    // from client-side SDK calls. Its API and Monitoring Viewer permission must be enabled.
    const end = new Date();
    const pacificParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit",
      second: "2-digit", hourCycle: "h23",
    }).formatToParts(end);
    const part = (type: string) => Number(pacificParts.find((item) => item.type === type)?.value || 0);
    const secondsSincePacificMidnight = part("hour") * 3600 + part("minute") * 60 + part("second");
    const start = new Date(end.getTime() - secondsSincePacificMidnight * 1000);
    const pacificDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(end);
    const filter = 'metric.type = "firestore.googleapis.com/document/read_ops_count" AND resource.type = "firestore.googleapis.com/Database"';
    const url = new URL("https://monitoring.googleapis.com/v3/projects/jaystarbliss-studios/timeSeries");
    url.searchParams.set("filter", filter);
    url.searchParams.set("interval.startTime", start.toISOString());
    url.searchParams.set("interval.endTime", end.toISOString());
    url.searchParams.set("view", "FULL");
    url.searchParams.set("aggregation.alignmentPeriod", "3600s");
    url.searchParams.set("aggregation.perSeriesAligner", "ALIGN_SUM");
    url.searchParams.set("pageSize", "1000");
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return json(200, {
        available: false,
        reason: response.status === 403
          ? "Enable the Cloud Monitoring API and grant the server service account Monitoring Viewer access."
          : `Cloud Monitoring returned HTTP ${response.status}.`,
        detail: detail.slice(0, 300),
      });
    }

    const payload = await response.json() as { timeSeries?: Array<any> };
    const databases: Record<string, number> = {};
    for (const series of payload.timeSeries || []) {
      const id = String(series.resource?.labels?.database_id || series.metric?.labels?.database_id || "unknown");
      const total = (series.points || []).reduce((sum: number, point: any) =>
        sum + numberValue(point.value?.int64Value ?? point.value?.doubleValue), 0);
      databases[id] = (databases[id] || 0) + total;
    }
    return json(200, {
      available: true,
      source: "Google Cloud Monitoring",
      date: pacificDate,
      timezone: "America/Los_Angeles",
      freeReadAllowance: 50000,
      databases: Object.entries(databases).map(([databaseId, reads]) => ({
        databaseId,
        reads: Math.round(reads),
        percentOfFreeAllowance: Math.round((reads / 50000) * 1000) / 10,
      })),
      note: "Cloud Monitoring samples every minute and may lag by up to four minutes. These are per-database document read metrics; AI Studio shared-quota grouping can differ.",
    });
  } catch (error) {
    console.error("[firestore-usage] Unable to load Firestore usage metrics:", error);
    return json(500, { error: "Unable to retrieve Firestore usage metrics." });
  }
};
