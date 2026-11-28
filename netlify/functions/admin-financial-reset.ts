import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb, getAdminApp, hasAdminAuth, hasAdminDb } from "../../api/_lib/firebase-admin";
import { getUserRecord, normaliseRole } from "../../api/_lib/billing";
import {
  DERIVED_BALANCE_COLLECTIONS,
  PRESERVED_COLLECTIONS,
  PRESERVED_CONFIG_DOCS,
  TARGET_FINANCIAL_COLLECTIONS,
  computePreviewSignature,
  stripTestPaymentFieldsFromBillingObject,
  stripTestPaymentFieldsFromProgrammeEnrollment,
  summarizeCollectionDocs,
  validateResetEnvironmentGuard,
  validateResetExecutionRequest,
  type CollectionInventorySummary,
  type FinancialResetInventory,
} from "../../api/_lib/financial-reset-core";

const tokenFromEvent = (event: any) => {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
};

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const BATCH_LIMIT = 400;

function resolveActiveProjectId(): string {
  const fromApp = String((getAdminApp()?.options as any)?.projectId || "").trim();
  if (fromApp) return fromApp;
  return String(
    process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      ""
  ).trim();
}

function serializeForBackup(value: any): any {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  if (Array.isArray(value)) return value.map(serializeForBackup);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serializeForBackup(v)])
    );
  }
  return value;
}

async function scanInventory(): Promise<{
  inventory: FinancialResetInventory;
  rawDocsByCollection: Record<string, Array<{ id: string; data: Record<string, any> }>>;
}> {
  const activeProjectId = resolveActiveProjectId();
  const guard = validateResetEnvironmentGuard({
    activeProjectId,
    expectedTestProjectId: process.env.EXPECTED_TEST_FIREBASE_PROJECT_ID,
    allowResetFlag: process.env.ALLOW_TEST_FINANCIAL_RESET,
    firebaseEnv: process.env.FIREBASE_ENV || process.env.APP_ENV || process.env.CONTEXT,
    nodeEnv: process.env.NODE_ENV,
  });

  const collections: CollectionInventorySummary[] = [];
  const rawDocsByCollection: Record<string, Array<{ id: string; data: Record<string, any> }>> = {};

  // 1. Financial transaction & reminder collections (candidates for deletion)
  for (const colName of TARGET_FINANCIAL_COLLECTIONS) {
    const snap = await adminDb.collection(colName).get();
    const entries = snap.docs.map((d) => ({ id: d.id, data: d.data() || {} }));
    rawDocsByCollection[colName] = entries;
    collections.push(
      summarizeCollectionDocs({
        collection: colName,
        action: "DELETE_DOCUMENTS",
        docs: entries.map((e) => e.data),
        notes: "Test transaction / payout / reminder history documents",
      })
    );
  }

  // 2. Derived wallet balances (zeroed, preserving payout bank metadata)
  for (const colName of DERIVED_BALANCE_COLLECTIONS) {
    const snap = await adminDb.collection(colName).get();
    const affected = snap.docs
      .map((d) => ({ id: d.id, data: d.data() || {} }))
      .filter(
        (e) =>
          Number(e.data.availableBalance || 0) !== 0 ||
          Number(e.data.reservedBalance || 0) !== 0 ||
          Number(e.data.lifetimeEarned || 0) !== 0
      );
    rawDocsByCollection[colName] = affected;
    collections.push(
      summarizeCollectionDocs({
        collection: colName,
        action: "RESET_DERIVED_BALANCES",
        docs: affected.map((e) => e.data),
        notes: "Zeroes availableBalance, reservedBalance, lifetimeEarned while preserving tutor payout profile",
      })
    );
  }

  // 3. Embedded test payment history fields (documents preserved; contract config preserved)
  const embeddedChecks: Array<{
    collection: string;
    predicate: (d: Record<string, any>) => boolean;
    notes: string;
  }> = [
    {
      collection: "schools",
      predicate: (d) =>
        Boolean(
          d.billing &&
            (d.billing.lastPaidAt ||
              d.billing.lastPaymentReference ||
              Number(d.billing.amountPaid || 0) > 0 ||
              d.billing.paidThrough)
        ),
      notes: "Resets schools.billing settlement history while preserving school record & baseAmount/cycle/plan config",
    },
    {
      collection: "users",
      predicate: (d) =>
        Boolean(
          d.billing &&
            (d.billing.lastPaidAt ||
              d.billing.lastPaymentReference ||
              Number(d.billing.amountPaid || 0) > 0 ||
              d.billing.paidThrough)
        ),
      notes: "Resets users.billing settlement history while preserving user accounts & billing configuration",
    },
    {
      collection: "individualStudents",
      predicate: (d) =>
        Boolean(
          d.lastPaidAt ||
            d.lastPaymentReference ||
            Number(d.amountPaid || 0) > 0 ||
            d.paidThrough
        ),
      notes: "Clears test payment timestamps/references while preserving student accounts & classes",
    },
    {
      collection: "students",
      predicate: (d) =>
        Boolean(
          d.lastPaidAt ||
            d.lastPaymentReference ||
            Number(d.amountPaid || 0) > 0 ||
            d.paidThrough
        ),
      notes: "Clears test payment timestamps/references while preserving student accounts & classes",
    },
    {
      collection: "programme_enrollments",
      predicate: (d) =>
        Boolean(
          d.lastPaidAt ||
            d.lastPaymentReference ||
            Number(d.amountPaid || 0) > 0 ||
            (Array.isArray(d.paymentHistory) && d.paymentHistory.length > 0)
        ),
      notes: "Clears test paymentHistory & amountPaid while preserving enrolment & approvedFee",
    },
    {
      collection: "enrollment_requests",
      predicate: (d) => Boolean(d.paymentReference || d.paymentStatus === "PAID"),
      notes: "Clears test paymentReference/paymentStatus while preserving enrolment request records",
    },
    {
      collection: "billingSubscriptions",
      predicate: (d) =>
        Boolean(
          d.lastSuccessfulPaymentAt ||
            d.lastPaymentReference ||
            Number(d.amountPaid || 0) > 0
        ),
      notes: "Resets test payment settlement history on subscriptions while preserving plan/amount config",
    },
  ];

  for (const check of embeddedChecks) {
    const snap = await adminDb.collection(check.collection).get();
    const affected = snap.docs
      .map((d) => ({ id: d.id, data: d.data() || {} }))
      .filter((e) => check.predicate(e.data));
    rawDocsByCollection[`embedded:${check.collection}`] = affected;
    collections.push(
      summarizeCollectionDocs({
        collection: check.collection,
        action: "RESET_EMBEDDED_PAYMENT_FIELDS",
        docs: affected.map((e) => e.data),
        notes: check.notes,
      })
    );
  }

  const totalFinancialDocumentsToDelete = collections
    .filter((c) => c.action === "DELETE_DOCUMENTS")
    .reduce((sum, c) => sum + c.documentCount, 0);
  const totalDerivedWalletDocsToZero = collections
    .filter((c) => c.action === "RESET_DERIVED_BALANCES")
    .reduce((sum, c) => sum + c.documentCount, 0);
  const totalEmbeddedRecordsToClean = collections
    .filter((c) => c.action === "RESET_EMBEDDED_PAYMENT_FIELDS")
    .reduce((sum, c) => sum + c.documentCount, 0);
  const totalAggregateAmountNaira = Number(
    collections
      .filter((c) => c.action === "DELETE_DOCUMENTS")
      .reduce((sum, c) => sum + c.aggregateAmountNaira, 0)
      .toFixed(2)
  );

  const previewSignature = computePreviewSignature({
    activeProjectId: guard.activeProjectId,
    collections,
  });

  return {
    inventory: {
      activeProjectId: guard.activeProjectId,
      environmentLabel: guard.environmentLabel,
      guard,
      collections,
      totalFinancialDocumentsToDelete,
      totalDerivedWalletDocsToZero,
      totalEmbeddedRecordsToClean,
      totalAggregateAmountNaira,
      preservedCollections: PRESERVED_COLLECTIONS,
      preservedConfigDocs: PRESERVED_CONFIG_DOCS,
      previewSignature,
      generatedAt: new Date().toISOString(),
    },
    rawDocsByCollection,
  };
}

async function writeBackupChunks(params: {
  operationId: string;
  actorUid: string;
  actorEmail: string;
  inventory: FinancialResetInventory;
  rawDocsByCollection: Record<string, Array<{ id: string; data: Record<string, any> }>>;
}): Promise<{ backupDocId: string; chunkCount: number }> {
  const backupRef = adminDb.collection("financialResetBackups").doc(params.operationId);
  await backupRef.set({
    operationId: params.operationId,
    activeProjectId: params.inventory.activeProjectId,
    environmentLabel: params.inventory.environmentLabel,
    createdByUid: params.actorUid,
    createdByEmail: params.actorEmail,
    previewSignature: params.inventory.previewSignature,
    summary: {
      totalFinancialDocumentsToDelete: params.inventory.totalFinancialDocumentsToDelete,
      totalDerivedWalletDocsToZero: params.inventory.totalDerivedWalletDocsToZero,
      totalEmbeddedRecordsToClean: params.inventory.totalEmbeddedRecordsToClean,
      totalAggregateAmountNaira: params.inventory.totalAggregateAmountNaira,
    },
    createdAt: new Date().toISOString(),
  });

  let chunkIndex = 0;
  const CHUNK_SIZE = 50;
  for (const [key, docs] of Object.entries(params.rawDocsByCollection)) {
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const slice = docs.slice(i, i + CHUNK_SIZE).map((entry) => ({
        id: entry.id,
        data: serializeForBackup(entry.data),
      }));
      await backupRef.collection("chunks").doc(`chunk_${String(chunkIndex).padStart(4, "0")}`).set({
        sourceKey: key,
        chunkIndex,
        count: slice.length,
        documents: slice,
      });
      chunkIndex += 1;
    }
  }

  return { backupDocId: params.operationId, chunkCount: chunkIndex };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }
  if (!hasAdminAuth() || !hasAdminDb()) {
    return json(200, { fallback: true, reason: "ADMIN_SDK_UNAVAILABLE" });
  }

  try {
    const token = tokenFromEvent(event);
    if (!token) return json(401, { error: "Authentication required." });
    const decoded = await adminAuth.verifyIdToken(token);
    const email = String(decoded.email || "").toLowerCase();
    const adminUser = await getUserRecord(decoded.uid, email);
    const adminRole = normaliseRole(adminUser.role);
    const isSuperAdmin = email === "johnrufai242@gmail.com" || adminRole === "superadmin";

    if (!isSuperAdmin) {
      return json(403, {
        error: "Superadmin authorization is strictly required for Controlled Test Financial Data Reset.",
      });
    }

    const body = JSON.parse(event.body || "{}");
    const action = String(body.action || "").toLowerCase();

    // =========================================================================
    // STAGE A: DRY RUN & SAFETY VERIFICATION (READ-ONLY — ZERO MODIFICATIONS)
    // =========================================================================
    if (action === "dry_run") {
      const { inventory } = await scanInventory();
      return json(200, {
        stage: "DRY_RUN",
        modifiedFirestore: false,
        inventory,
      });
    }

    // =========================================================================
    // STAGE B: CONTROLLED EXECUTION (BACKUP + BATCHED RESET + AUDIT LOG)
    // =========================================================================
    if (action === "execute") {
      const { inventory, rawDocsByCollection } = await scanInventory();
      const validation = validateResetExecutionRequest({
        isSuperAdmin,
        confirmationPhrase: String(body.confirmationPhrase || ""),
        providedPreviewSignature: String(body.previewSignature || ""),
        freshPreviewSignature: inventory.previewSignature,
        guard: inventory.guard,
      });

      if (!validation.ok) {
        return json(400, {
          error: validation.error,
          guard: inventory.guard,
          freshPreviewSignature: inventory.previewSignature,
        });
      }

      const operationId = `finreset_${Date.now()}_${decoded.uid.slice(0, 8)}`;
      const nowIso = new Date().toISOString();

      // 1. Write recoverable backup BEFORE modifying any document
      const backupInfo = await writeBackupChunks({
        operationId,
        actorUid: decoded.uid,
        actorEmail: email,
        inventory,
        rawDocsByCollection,
      });

      // 2. Delete target financial transaction collections in paginated batches
      const deletedCounts: Record<string, number> = {};
      for (const colName of TARGET_FINANCIAL_COLLECTIONS) {
        const docs = rawDocsByCollection[colName] || [];
        let deleted = 0;
        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
          const batch = adminDb.batch();
          const slice = docs.slice(i, i + BATCH_LIMIT);
          for (const item of slice) {
            batch.delete(adminDb.collection(colName).doc(item.id));
          }
          await batch.commit();
          deleted += slice.length;
        }
        deletedCounts[colName] = deleted;
      }

      // 3. Zero derived staff wallet balances while keeping bank payout profiles intact
      let zeroedWallets = 0;
      const walletDocs = rawDocsByCollection.staffWallets || [];
      for (let i = 0; i < walletDocs.length; i += BATCH_LIMIT) {
        const batch = adminDb.batch();
        const slice = walletDocs.slice(i, i + BATCH_LIMIT);
        for (const item of slice) {
          batch.set(
            adminDb.collection("staffWallets").doc(item.id),
            {
              availableBalance: 0,
              reservedBalance: 0,
              lifetimeEarned: 0,
              lastResetOperationId: operationId,
              updatedAt: nowIso,
            },
            { merge: true }
          );
        }
        await batch.commit();
        zeroedWallets += slice.length;
      }

      // 4. Clean embedded test payment fields WITHOUT deleting operational docs or pricing config
      const cleanedEmbeddedCounts: Record<string, number> = {};

      for (const colName of ["schools", "users"] as const) {
        const docs = rawDocsByCollection[`embedded:${colName}`] || [];
        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
          const batch = adminDb.batch();
          for (const item of docs.slice(i, i + BATCH_LIMIT)) {
            const cleanedBilling = stripTestPaymentFieldsFromBillingObject(item.data.billing);
            if (cleanedBilling) {
              batch.set(
                adminDb.collection(colName).doc(item.id),
                { billing: cleanedBilling, updatedAt: nowIso },
                { merge: true }
              );
            }
          }
          await batch.commit();
        }
        cleanedEmbeddedCounts[colName] = docs.length;
      }

      for (const colName of ["individualStudents", "students"] as const) {
        const docs = rawDocsByCollection[`embedded:${colName}`] || [];
        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
          const batch = adminDb.batch();
          for (const item of docs.slice(i, i + BATCH_LIMIT)) {
            batch.set(
              adminDb.collection(colName).doc(item.id),
              {
                amountPaid: 0,
                remainingBalance: Number(item.data.tuitionFee ?? item.data.fee ?? 0),
                lastPaidAt: null,
                lastPaymentReference: null,
                paidThrough: null,
                updatedAt: nowIso,
              },
              { merge: true }
            );
          }
          await batch.commit();
        }
        cleanedEmbeddedCounts[colName] = docs.length;
      }

      const enrollDocs = rawDocsByCollection["embedded:programme_enrollments"] || [];
      for (let i = 0; i < enrollDocs.length; i += BATCH_LIMIT) {
        const batch = adminDb.batch();
        for (const item of enrollDocs.slice(i, i + BATCH_LIMIT)) {
          batch.set(
            adminDb.collection("programme_enrollments").doc(item.id),
            {
              ...stripTestPaymentFieldsFromProgrammeEnrollment(item.data),
              updatedAt: nowIso,
            },
            { merge: true }
          );
        }
        await batch.commit();
      }
      cleanedEmbeddedCounts.programme_enrollments = enrollDocs.length;

      const reqDocs = rawDocsByCollection["embedded:enrollment_requests"] || [];
      for (let i = 0; i < reqDocs.length; i += BATCH_LIMIT) {
        const batch = adminDb.batch();
        for (const item of reqDocs.slice(i, i + BATCH_LIMIT)) {
          batch.set(
            adminDb.collection("enrollment_requests").doc(item.id),
            {
              paymentReference: null,
              paymentStatus: "UNPAID",
              paidAt: null,
              updatedAt: nowIso,
            },
            { merge: true }
          );
        }
        await batch.commit();
      }
      cleanedEmbeddedCounts.enrollment_requests = reqDocs.length;

      const subDocs = rawDocsByCollection["embedded:billingSubscriptions"] || [];
      for (let i = 0; i < subDocs.length; i += BATCH_LIMIT) {
        const batch = adminDb.batch();
        for (const item of subDocs.slice(i, i + BATCH_LIMIT)) {
          const amt = Number(item.data.amount || 0);
          batch.set(
            adminDb.collection("billingSubscriptions").doc(item.id),
            {
              amountPaid: 0,
              remainingBalance: amt,
              lastSuccessfulPaymentAt: null,
              lastPaymentReference: null,
              lastReminderSentAt: null,
              lockdownActivatedAt: null,
              status: item.data.exemption?.exempt ? "EXEMPT" : "ACTIVE",
              updatedAt: nowIso,
            },
            { merge: true }
          );
        }
        await batch.commit();
      }
      cleanedEmbeddedCounts.billingSubscriptions = subDocs.length;

      // 5. Post-reset verification scan
      const verification: Record<string, number> = {};
      for (const colName of TARGET_FINANCIAL_COLLECTIONS) {
        const afterSnap = await adminDb.collection(colName).limit(5).get();
        verification[colName] = afterSnap.size;
      }

      // 6. Write permanent audit log (never cleared)
      const auditRecord = {
        operationId,
        action: "CONTROLLED_TEST_FINANCIAL_DATA_RESET",
        activeProjectId: inventory.activeProjectId,
        environmentLabel: inventory.environmentLabel,
        executedByUid: decoded.uid,
        executedByEmail: email,
        executedByName: String((adminUser as any)?.fullName || (adminUser as any)?.name || email),
        previewSignature: inventory.previewSignature,
        backupDocId: backupInfo.backupDocId,
        backupChunkCount: backupInfo.chunkCount,
        deletedCounts,
        zeroedWallets,
        cleanedEmbeddedCounts,
        postResetRemainingCounts: verification,
        preservedCollections: PRESERVED_COLLECTIONS,
        preservedConfigDocs: PRESERVED_CONFIG_DOCS,
        executedAt: nowIso,
      };

      await adminDb.collection("financialResetAuditLogs").doc(operationId).set(auditRecord);
      await adminDb.collection("adminAuditLogs").add({
        action: "CONTROLLED_TEST_FINANCIAL_DATA_RESET",
        actorUid: decoded.uid,
        actorEmail: email,
        actorName: auditRecord.executedByName,
        targetType: "FINANCIAL_TEST_DATA",
        targetId: operationId,
        metadata: {
          activeProjectId: inventory.activeProjectId,
          deletedCounts,
          zeroedWallets,
          backupDocId: backupInfo.backupDocId,
        },
        createdAt: nowIso,
      });

      return json(200, {
        stage: "EXECUTED",
        operationId,
        backupDocId: backupInfo.backupDocId,
        deletedCounts,
        zeroedWallets,
        cleanedEmbeddedCounts,
        postResetRemainingCounts: verification,
        executedAt: nowIso,
      });
    }

    // Read recent reset audit logs for transparency
    if (action === "list_audit_logs") {
      const snap = await adminDb.collection("financialResetAuditLogs").limit(25).get();
      const logs = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .sort((a: any, b: any) => String(b.executedAt || "").localeCompare(String(a.executedAt || "")));
      return json(200, { logs });
    }

    return json(400, { error: "Unsupported action. Use dry_run, execute, or list_audit_logs." });
  } catch (err: any) {
    console.error("admin-financial-reset error:", err);
    return json(500, { error: err?.message || "Unable to complete financial reset operation." });
  }
};
