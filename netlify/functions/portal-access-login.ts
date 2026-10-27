import type { Handler } from "@netlify/functions";
import { createHash } from "node:crypto";
import { adminAuth, adminDb, getAdminDatabases } from "../../api/_lib/firebase-admin";
import { hashStudentAccessCode, matchesStudentCredentials, normalizeStudentUsername } from "../../api/_lib/student-login-compat.mjs";

const normalizeUsername = (value: string) => normalizeStudentUsername(value);
const normalizeCode = (value: string) => value.trim().toUpperCase();
const hashAccessCode = (value: string) => hashStudentAccessCode(value);
const isBlocked = (data: Record<string, any>) => ["SUSPENDED", "BANNED", "DISABLED"].includes(String(data.accountStatus || data.status || "ACTIVE").toUpperCase());

type StudentLoginCandidate = {
  snap: any;
  profile: Record<string, any>;
  sourceCollection: string;
  studentDocId: string;
  preferredUid?: string;
  credentialProfiles: Record<string, any>[];
  enriched?: boolean;
};

const STUDENT_USERNAME_FIELDS = ["username", "studentUsername", "loginUsername", "userName"];
const STUDENT_CODE_FIELDS = ["accessCode", "passcode", "code"];
const STUDENT_HASH_FIELDS = ["accessCodeHash", "passwordHash", "customPasswordHash", "passcodeHash", "codeHash", "hashedAccessCode"];

const hasStudentIndicators = (data: Record<string, any>) =>
  !!(
    data.studentDocId || data.studentId || data.individualStudentId ||
    data.username || data.studentUsername || data.loginUsername ||
    data.accessCodeHash || data.accessCode || data.passcode || data.code ||
    data.passwordHash || data.customPasswordHash
  );

const isStudentUserProfile = (data: Record<string, any>) => {
  const role = normaliseRole(data.role);
  return (!role || role.includes("student")) && hasStudentIndicators(data);
};

async function findStudent(identifier: string, suppliedCode: string, db: FirebaseFirestore.Firestore): Promise<StudentLoginCandidate | null> {
  const raw = identifier.trim();
  const code = suppliedCode.trim();
  const username = normalizeUsername(raw);
  const email = raw.toLowerCase();
  const candidates = new Map<string, StudentLoginCandidate>();
  const processedUsers = new Set<string>();

  const addCandidate = (snap: any, extraProfile?: Record<string, any>, preferredUid?: string) => {
    if (!snap?.exists) return;
    const sourceCollection = String(snap.ref?.parent?.id || "");
    const key = sourceCollection + "/" + snap.id;
    const profile = snap.data() || {};
    let candidate = candidates.get(key);
    if (!candidate) {
      candidate = {
        snap,
        profile,
        sourceCollection,
        studentDocId: snap.id,
        preferredUid: preferredUid || (sourceCollection === "users" ? snap.id : undefined) ||
          String(profile.firebaseUid || profile.userId || profile.authUid || "") || undefined,
        credentialProfiles: [profile]
      };
      candidates.set(key, candidate);
    }
    if (extraProfile && !candidate.credentialProfiles.includes(extraProfile)) candidate.credentialProfiles.push(extraProfile);
    if (preferredUid && !candidate.preferredUid) candidate.preferredUid = preferredUid;
  };

  const addUserProfile = async (userSnap: any) => {
    if (!userSnap?.exists || processedUsers.has(userSnap.id)) return;
    processedUsers.add(userSnap.id);
    const user = userSnap.data() || {};
    if (!isStudentUserProfile(user)) return;

    const linkedIds = [...new Set([
      user.studentDocId, user.studentId, user.individualStudentId
    ].map(value => String(value || "").trim()).filter(Boolean))];

    for (const linkedId of linkedIds) {
      const linkedSnapshots = await Promise.all(["individualStudents", "students"].map(async collectionName => {
        try { return await db.collection(collectionName).doc(linkedId).get(); }
        catch { return null; }
      }));
      const linked = linkedSnapshots.find((snapshot: any) => snapshot?.exists);
      if (linked) {
        addCandidate(linked, user, userSnap.id);
        return;
      }
    }

    // Legacy installations sometimes stored the complete student credential
    // profile only at users/{uid}; accept it only if it is a student profile.
    addCandidate(userSnap, undefined, userSnap.id);
  };

  const runLimited = async <T,>(tasks: Array<() => Promise<T>>, concurrency = 12): Promise<T[]> => {
    const output = new Array<T>(tasks.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= tasks.length) return;
        try { output[index] = await tasks[index](); }
        catch { output[index] = undefined as T; }
      }
    }));
    return output;
  };

  const enrichCandidates = async () => {
    const snapshot = [...candidates.values()].filter(candidate => candidate.sourceCollection !== "users" && !candidate.enriched);
    await Promise.all(snapshot.map(async candidate => {
      candidate.enriched = true;
      const data = candidate.profile;
      const possibleUids = [...new Set([
        data.firebaseUid, data.userId, data.authUid, data.uid
      ].map(value => String(value || "").trim()).filter(Boolean))];

      for (const linkedUid of possibleUids) {
        try {
          const userSnap = await db.collection("users").doc(linkedUid).get();
          if (!userSnap.exists) continue;
          const user = userSnap.data() || {};
          const role = normaliseRole(user.role);
          if (role && !role.includes("student")) continue;
          if (!candidate.credentialProfiles.includes(user)) candidate.credentialProfiles.push(user);
          candidate.preferredUid ||= linkedUid;
          break;
        } catch {}
      }

      // Some older user profiles link back to the student but the student
      // document does not contain a firebaseUid/userId field.
      if (possibleUids.length === 0) {
        const tasks = ["studentDocId", "studentId", "individualStudentId"].map(field => async () => {
          try { return await db.collection("users").where(field, "==", candidate.snap.id).limit(3).get(); }
          catch { return null; }
        });
        const linkResults = await runLimited(tasks, 3);
        for (const result of linkResults) {
          for (const userSnap of result?.docs || []) {
            const user = userSnap.data() || {};
            const role = normaliseRole(user.role);
            if (role && !role.includes("student")) continue;
            if (!candidate.credentialProfiles.includes(user)) candidate.credentialProfiles.push(user);
            candidate.preferredUid ||= userSnap.id;
          }
        }
      }
    }));
  };

  const chooseMatch = (): StudentLoginCandidate | null => {
    const matching = [...candidates.values()].filter(candidate =>
      matchesStudentCredentials(candidate.credentialProfiles, code, raw)
    );
    if (!matching.length) return null;
    // When duplicate legacy records exist, prefer an active matching record.
    return matching.find(candidate =>
      !candidate.credentialProfiles.some(profile =>
        isBlocked(profile) || profile.portalAccessEnabled === false
      )
    ) || matching[0];
  };

  const search = async (specifications: Array<{ collectionName: string; field: string; value: string }>) => {
    const unique = new Map<string, { collectionName: string; field: string; value: string }>();
    for (const spec of specifications) {
      if (!spec.value) continue;
      unique.set([spec.collectionName, spec.field, spec.value].join("\u0000"), spec);
    }
    const entries = [...unique.values()];
    let successfulQueries = 0;
    const queryFailures: string[] = [];
    const trackedTasks = entries.map(spec => async () => {
      try {
        const query = await db.collection(spec.collectionName).where(spec.field, "==", spec.value).limit(5).get();
        successfulQueries += 1;
        return { collectionName: spec.collectionName, docs: query.docs };
      } catch (error) {
        const code = String((error as any)?.code || "unknown");
        queryFailures.push(code);
        console.warn("[portal-access-login] Firestore student lookup query failed", {
          collection: spec.collectionName,
          field: spec.field,
          code
        });
        return { collectionName: spec.collectionName, docs: [] as any[] };
      }
    });
    const results = await runLimited(trackedTasks, 12);
    if (successfulQueries === 0 && queryFailures.length > 0) {
      throw new Error("Student lookup failed because every Firestore query failed.");
    }
    for (const result of results) {
      if (!result) continue;
      for (const snap of result.docs || []) {
        if (result.collectionName === "users") await addUserProfile(snap);
        else addCandidate(snap);
      }
    }
    if (queryFailures.length > 0) {
      console.warn("[portal-access-login] Some student lookup queries failed", {
        successfulQueries,
        failedQueries: queryFailures.length,
        errorCodes: [...new Set(queryFailures)]
      });
    }
    await enrichCandidates();
    return chooseMatch();
  };

  const collections = ["individualStudents", "students", "users"];
  const primarySpecs = collections.map(collectionName => ({
    collectionName, field: "username", value: username
  }));
  if (email.includes("@")) {
    primarySpecs.push(...collections.map(collectionName => ({
      collectionName, field: "email", value: email
    })));
  }

  let matched = await search(primarySpecs);
  if (matched) return matched;

  // Compatibility lookup adapted from the September 28 working login flow:
  // legacy field names, casing/@ variants, user-profile links, and old names.
  const identifierForms = [...new Set([
    raw, raw.toLowerCase(), raw.toUpperCase(), username, username.toUpperCase(),
    username ? `@${username}` : "", username ? `@${username.toUpperCase()}` : ""
  ].filter(Boolean))];
  const legacySpecs: Array<{ collectionName: string; field: string; value: string }> = [];

  for (const collectionName of ["individualStudents", "students"]) {
    for (const field of STUDENT_USERNAME_FIELDS) {
      for (const value of identifierForms) legacySpecs.push({ collectionName, field, value });
    }
    if (email.includes("@")) {
      for (const field of ["email", "studentEmail"]) legacySpecs.push({ collectionName, field, value: email });
    }
    for (const field of ["fullName", "studentName", "name"]) {
      for (const value of [...new Set([raw, raw.toLowerCase(), raw.toUpperCase()])]) {
        legacySpecs.push({ collectionName, field, value });
      }
    }
  }
  for (const field of STUDENT_USERNAME_FIELDS) {
    for (const value of identifierForms) legacySpecs.push({ collectionName: "users", field, value });
  }
  if (email.includes("@")) legacySpecs.push({ collectionName: "users", field: "email", value: email });

  // The historical resolver also located records when the code was accidentally
  // entered in the username field. Search only by the identifier here; the second
  // field must still match that same record's code/hash AND username.
  for (const collectionName of collections) {
    for (const field of STUDENT_CODE_FIELDS) {
      for (const value of [...new Set([raw, raw.toUpperCase()])]) {
        legacySpecs.push({ collectionName, field, value });
      }
    }
    for (const field of STUDENT_HASH_FIELDS) {
      const rawHash = createHash("sha256").update(raw).digest("hex");
      const normalizedHash = hashAccessCode(raw);
      for (const value of [...new Set([
        rawHash, rawHash.toUpperCase(), normalizedHash, normalizedHash.toUpperCase()
      ])]) {
        legacySpecs.push({ collectionName, field, value });
      }
    }
  }

  matched = await search(legacySpecs);
  if (matched) return matched;

  // Preserve direct document-ID lookup from the old resolver.
  const directIds = [...new Set([raw, username].filter(Boolean))];
  for (const collectionName of collections) {
    for (const docId of directIds) {
      try {
        const snap = await db.collection(collectionName).doc(docId).get();
        if (collectionName === "users") await addUserProfile(snap);
        else addCandidate(snap);
      } catch {}
    }
  }
  await enrichCandidates();
  matched = chooseMatch();
  if (matched) return matched;

  // Last-resort compatibility scan for legacy records whose username/email
  // was stored with unexpected whitespace, punctuation, or field formatting.
  // This runs only on the trusted server and still requires the submitted
  // access code/hash to match the same candidate record before issuing a token.
  // The bounded scan mirrors the historical client resolver without restoring
  // public Firestore reads or client-side account creation.
  const scanResults = await Promise.all(collections.map(async (collectionName) => {
    try {
      return { collectionName, snapshot: await db.collection(collectionName).limit(500).get() };
    } catch {
      return { collectionName, snapshot: null };
    }
  }));
  for (const result of scanResults) {
    if (!result.snapshot) continue;
    for (const snap of result.snapshot.docs) {
      if (result.collectionName === "users") await addUserProfile(snap);
      else addCandidate(snap);
    }
  }
  await enrichCandidates();
  matched = chooseMatch();
  if (matched) return matched;

  console.info("[portal-access-login] student credential lookup failed", {
    outcome: candidates.size ? "record_found_code_mismatch" : "record_not_found",
    candidateCount: candidates.size
  });
  return null;
}

async function getOrCreateUid(email: string | undefined, displayName: string, fallbackKey: string, preferredUid?: string) {
  if (preferredUid) {
    try { await adminAuth.getUser(preferredUid); return preferredUid; } catch {}
  }
  if (email) {
    try { return (await adminAuth.getUserByEmail(email)).uid; } catch {}
  }
  const safeKey = fallbackKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "record";
  const syntheticEmail = `portal-${safeKey}@${email ? "jdh-student.local" : "jdh-portal.local"}`;
  try { return (await adminAuth.getUserByEmail(syntheticEmail)).uid; } catch {}
  return (await adminAuth.createUser({ email: email || syntheticEmail, displayName })).uid;
}

const getExistingUserStatus = async (uid: string, db: FirebaseFirestore.Firestore = adminDb) => {
  const userSnap = await db.collection("users").doc(uid).get();
  const data = userSnap.exists ? userSnap.data() || {} : {};
  return { exists: userSnap.exists, data };
};
const isAuthDisabled = (user: { disabled?: boolean }) => user.disabled === true;
const normaliseRole = (value: unknown) => String(value || "").trim().toLowerCase();

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const body = JSON.parse(event.body || "{}");
    const role = String(body.role || "").toLowerCase();
    const identifier = String(body.identifier || "").trim();
    const code = String(body.code || "").trim();
    if (!["student", "school"].includes(role) || !identifier || !code || code.length > 128) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid login request." }) };
    }

    let uid = "";
    let profile: Record<string, any> = {};
    let response: Record<string, any> = {};

    if (role === "student") {
      const dbs = getAdminDatabases();
      if (dbs.length === 0) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          body: JSON.stringify({ fallback: true, error: "Direct client resolver active." }),
        };
      }

      let candidate: StudentLoginCandidate | null = null;
      let activeDb: FirebaseFirestore.Firestore = dbs[0];

      for (const dbInstance of dbs) {
        try {
          const found = await findStudent(identifier, code, dbInstance);
          if (found) {
            candidate = found;
            activeDb = dbInstance;
            break;
          }
        } catch (dbErr) {
          console.warn("[portal-access-login] Database instance lookup warning:", dbErr);
        }
      }

      if (!candidate) {
        return { statusCode: 401, body: JSON.stringify({ error: "Invalid student access code or credentials." }) };
      }
      const snap = candidate.snap;
      profile = candidate.profile;
      const recordId = candidate.studentDocId || snap.id;
      const matchedProfiles = candidate.credentialProfiles || [profile];

      if (matchedProfiles.some((candidateProfile: Record<string, any>) => isBlocked(candidateProfile))) {
        return { statusCode: 401, body: JSON.stringify({ error: "This student account is currently disabled." }) };
      }
      if (matchedProfiles.some((candidateProfile: Record<string, any>) => candidateProfile.portalAccessEnabled === false)) {
        return { statusCode: 403, body: JSON.stringify({ error: "Student portal access is disabled for this account." }) };
      }

      const tutorId = String(profile.tutorId || profile.staffId || profile.assignedTutorId || profile.assignedStaffId || profile.instructorId || "").trim();
      const schoolId = String(profile.schoolId || "").trim();

      uid = await getOrCreateUid(
        typeof profile.email === "string" && profile.email.includes("@") ? profile.email.toLowerCase() : undefined,
        String(profile.fullName || profile.studentName || profile.username || profile.name || "Student"),
        `student-${recordId}`,
        candidate.preferredUid || (typeof profile.firebaseUid === "string" ? profile.firebaseUid : undefined)
      );

      const existingUser = await getExistingUserStatus(uid, activeDb);
      if (existingUser.exists) {
        const existingRole = normaliseRole(existingUser.data.role);
        const existingStudentDocId = String(existingUser.data.studentDocId || "").trim();
        if (existingRole && !existingRole.includes("student") && existingStudentDocId && existingStudentDocId !== recordId) {
          return { statusCode: 409, body: JSON.stringify({ error: "This student identity is already linked to another portal account." }) };
        }
      }
      if (existingUser.exists && isBlocked(existingUser.data)) {
        return { statusCode: 401, body: JSON.stringify({ error: "This student account is currently disabled." }) };
      }

      const authUser = await adminAuth.getUser(uid);
      if (isAuthDisabled(authUser)) {
        return { statusCode: 401, body: JSON.stringify({ error: "This student account is disabled in authentication." }) };
      }

      const updates: Record<string, unknown> = { firebaseUid: uid, userId: uid, authEmail: authUser.email || null, portalAccessEnabled: true, updatedAt: new Date() };
      const storedAccessHash = String(profile.accessCodeHash || "").trim();
      const legacyCode = String(profile.accessCode || profile.passcode || profile.code || "").trim();
      if (!storedAccessHash && legacyCode) updates.accessCodeHash = hashAccessCode(legacyCode);
      await snap.ref.set(updates, { merge: true });

      const userPayload = {
        uid,
        email: authUser.email || null,
        name: profile.fullName || profile.studentName || profile.username || "Student",
        fullName: profile.fullName || profile.studentName || profile.username || "Student",
        username: String(profile.username || "").toLowerCase().replace(/^@/, "").trim(),
        role: "STUDENT",
        studentDocId: recordId,
        schoolId: schoolId || null,
        schoolName: profile.schoolName || "",
        class: profile.class || profile.grade || "General",
        tutorId: tutorId || null,
        portalAccessEnabled: true,
        accountStatus: "ACTIVE",
        status: "ACTIVE",
        updatedAt: new Date()
      };
      await activeDb.collection("users").doc(uid).set(userPayload, { merge: true });
      if (activeDb !== dbs[0]) {
        await dbs[0].collection("users").doc(uid).set(userPayload, { merge: true }).catch(() => undefined);
      }

      response = {
        role: "student",
        studentDocId: recordId,
        name: profile.fullName || profile.studentName || profile.username,
        username: profile.username || "",
        class: profile.class || profile.grade || "",
        schoolId,
        tutorId,
        schoolName: profile.schoolName || ""
      };
    } else {
      const raw = identifier;
      const inputCode = normalizeCode(code);
      let schoolSnap: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot | null = null;
      if (raw.includes("@")) {
        const q = await adminDb.collection("schools").where("email", "==", raw.toLowerCase()).limit(1).get();
        if (!q.empty) schoolSnap = q.docs[0];
      }
      if (!schoolSnap) { try { const d = await adminDb.collection("schools").doc(raw).get(); if (d.exists) schoolSnap = d; } catch {} }
      if (!schoolSnap) { const q = await adminDb.collection("schools").where("schoolId", "==", raw).limit(1).get(); if (!q.empty) schoolSnap = q.docs[0]; }
      if (!schoolSnap) return { statusCode: 401, body: JSON.stringify({ error: "Invalid school credentials." }) };
      profile = schoolSnap.data() || {};
      const storedHash = String(profile.accessCodeHash || "").trim().toLowerCase();
      const legacyCode = String(profile.accessCode || "").trim().toUpperCase();
      const codeMatches = storedHash ? storedHash === hashAccessCode(inputCode) : !!legacyCode && legacyCode === inputCode;
      if (!codeMatches || isBlocked(profile)) return { statusCode: 401, body: JSON.stringify({ error: "Invalid school credentials." }) };
      const email = typeof profile.email === "string" && profile.email.includes("@") ? profile.email.toLowerCase() : undefined;
      uid = await getOrCreateUid(email, String(profile.name || "Partner School"), `school-${schoolSnap.id}`, String(profile.adminUid || profile.userId || "") || undefined);
      const existingUser = await getExistingUserStatus(uid);
      if (existingUser.exists) {
        const existingRole = normaliseRole(existingUser.data.role);
        const existingSchoolId = String(existingUser.data.schoolId || "").trim();
        if (existingRole && existingRole !== "school" && !existingRole.includes("school") && (existingSchoolId && existingSchoolId !== schoolSnap.id)) {
          return { statusCode: 409, body: JSON.stringify({ error: "This school identity is already linked to another portal account." }) };
        }
      }
      if (existingUser.exists && isBlocked(existingUser.data)) return { statusCode: 401, body: JSON.stringify({ error: "This school account is currently disabled." }) };
      const authUser = await adminAuth.getUser(uid);
      if (isAuthDisabled(authUser)) return { statusCode: 401, body: JSON.stringify({ error: "This school account is disabled in authentication." }) };
      const schoolUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (!storedHash && legacyCode) schoolUpdates.accessCodeHash = hashAccessCode(legacyCode);
      if (Object.keys(schoolUpdates).length > 1) await schoolSnap.ref.set(schoolUpdates, { merge: true });
      await adminDb.collection("users").doc(uid).set({
        email: email || authUser.email || null,
        name: profile.name || "Partner School",
        fullName: profile.name || "Partner School",
        role: "SCHOOL",
        schoolId: schoolSnap.id,
        schoolName: profile.name || "",
        accountStatus: "ACTIVE",
        status: "ACTIVE",
        updatedAt: new Date()
      }, { merge: true });
      response = { role: "school", schoolDocId: schoolSnap.id, schoolId: schoolSnap.id, name: profile.name || "Partner School" };
    }

    const customToken = await adminAuth.createCustomToken(uid, { role: response.role, schoolId: response.schoolId || "", tutorId: response.tutorId || "" });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ customToken, ...response })
    };
  } catch (error) {
    console.error("Portal access login notice (engaging client fallback):", error);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fallback: true, error: "Direct client resolver active." }) };
  }
};
