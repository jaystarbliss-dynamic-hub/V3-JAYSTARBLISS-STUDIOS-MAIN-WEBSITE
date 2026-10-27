import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb, hasAdminAuth, hasAdminDb } from "../../api/_lib/firebase-admin";
import { getPaymentConfig, getUserRecord, normaliseRole, isPrivilegedRole, isStaffRole, isActiveRecord } from "../../api/_lib/billing";

const tokenFromEvent = (event: any) => {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
};

const plain = (value: any): any => {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, plain(val)]));
  return value;
};

const docs = async (collectionName: string, field: string, value: string, limitCount = 100) => {
  const snap = await adminDb.collection(collectionName).where(field, "==", value).limit(limitCount).get();
  return snap.docs.map(doc => ({ id: doc.id, ...plain(doc.data()) }));
};

const safeStudent = (record: any) => {
  const safe = { ...(record || {}) };
  ["accessCode", "passcode", "accessCodeHash", "credentialIssuedAt", "credentialIssuedBy"].forEach(key => delete safe[key]);
  return safe;
};

const safeWallet = (record: any) => {
  const safe = { ...(record || {}) };
  ["bankAccountNumber", "accountNumber", "bankToken", "recipientCode"].forEach(key => delete safe[key]);
  return safe;
};

const staffAssignmentFields = ["tutorId", "staffId", "assignedTutorId", "assignedStaffId", "instructorId"];

const assignedStudentRecords = async (uid: string) => {
  const studentMap = new Map<string, any>();
  for (const field of staffAssignmentFields) {
    for (const collectionName of ["individualStudents", "students"]) {
      try {
        const records = await docs(collectionName, field, uid, 100);
        records.forEach(record => studentMap.set(`${collectionName}:${record.id}`, safeStudent(record)));
      } catch (error) {
        console.warn(`Assigned ${collectionName}/${field} lookup failed:`, error);
      }
    }
  }
  return Array.from(studentMap.values());
};

const staffPayments = async (uid: string) => {
  const paymentMap = new Map<string, any>();
  for (const field of staffAssignmentFields) {
    try {
      const records = await docs("payments", field, uid, 100);
      records.forEach(record => paymentMap.set(record.id, record));
    } catch (error) {
      console.warn(`Payment ${field} lookup failed:`, error);
    }
  }
  return Array.from(paymentMap.values());
};

const numericAmount = (payment: any) => {
  for (const candidate of [payment.customerTotal, payment.totalAmount, payment.amountPaid, payment.amount, payment.grossAmount]) {
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }
  return 0;
};

const paymentDate = (payment: any) => {
  const value = payment.paidAt || payment.paymentDate || payment.createdAt || payment.updatedAt;
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

const isSuccessfulPayment = (payment: any) => {
  const status = String(payment.status || payment.paymentStatus || "").toUpperCase();
  return !status || ["SUCCESS", "SUCCESSFUL", "PAID", "COMPLETED", "APPROVED"].includes(status);
};

const billingSummary = (payments: any[]) => {
  const successful = payments.filter(isSuccessfulPayment).filter(p => numericAmount(p) > 0);
  const totalPaid = successful.reduce((sum, p) => sum + numericAmount(p), 0);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyRevenue = successful.reduce((sum, p) => {
    const date = paymentDate(p);
    return date && date >= monthStart ? sum + numericAmount(p) : sum;
  }, 0);
  const latest = successful.map(payment => ({ payment, date: paymentDate(payment) })).filter(item => item.date).sort((a, b) => b.date!.getTime() - a.date!.getTime())[0];
  const lastPaidAt = latest?.date || null;
  const cycleDays = latest?.payment ? Math.max(1, Number(latest.payment.durationWeeks || 4)) * 7 : 28;
  const explicitPaidThrough = latest?.payment?.paidThrough ? new Date(latest.payment.paidThrough) : null;
  const nextPaymentDue = explicitPaidThrough && !Number.isNaN(explicitPaidThrough.getTime()) ? explicitPaidThrough : lastPaidAt ? new Date(lastPaidAt.getTime() + cycleDays * 24 * 60 * 60 * 1000) : null;
  const transactionFees = successful.reduce((sum, p) => {
    const fee = Number(p.transactionFee ?? p.gatewayFee ?? p.paystackFee ?? 0);
    return sum + (Number.isFinite(fee) && fee >= 0 ? fee : 0);
  }, 0);
  return {
    totalPaid,
    monthlyRevenue,
    transactionFees,
    paymentCount: successful.length,
    lastPaidAt: lastPaidAt?.toISOString() || null,
    nextPaymentDue: nextPaymentDue?.toISOString() || null,
    paymentCycleDays: cycleDays,
    paymentCycleWeeks: Math.round(cycleDays / 7),
    overdue: Boolean(nextPaymentDue && nextPaymentDue.getTime() < now.getTime())
  };
};

export const handler: Handler = async event => {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    if (!hasAdminAuth() || !hasAdminDb()) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ fallback: true })
      };
    }
    const token = tokenFromEvent(event);
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: "Authentication required." }) };
    const decoded = await adminAuth.verifyIdToken(token);
    const user = await getUserRecord(decoded.uid, decoded.email);
    const role = normaliseRole(user.role);
    if (!isActiveRecord(user)) return { statusCode: 403, body: JSON.stringify({ error: "Your account is not active." }) };
    const config = await getPaymentConfig();

    // Privileged Admin Role
    if (isPrivilegedRole(role)) {
      const requestedSchoolId = event.queryStringParameters?.schoolId || "";
      const [paymentsSnap, enrollmentSnap, usersTutorSnap, usersStaffSnap, withdrawalsSnap, schoolsSnap, parentsSnap, individualSnap, studentsSnap, usersStudentSnap] = await Promise.all([
        adminDb.collection("payments").limit(500).get(),
        adminDb.collection("enrollment_requests").limit(200).get(),
        adminDb.collection("users").where("role", "in", ["TUTOR", "tutor", "INSTRUCTOR", "instructor"]).limit(100).get(),
        adminDb.collection("users").where("role", "in", ["STAFF", "staff"]).limit(100).get(),
        adminDb.collection("walletWithdrawals").limit(200).get(),
        adminDb.collection("schools").limit(100).get(),
        adminDb.collection("users").where("role", "in", ["PARENT", "parent"]).limit(150).get(),
        adminDb.collection("individualStudents").limit(500).get(),
        adminDb.collection("students").limit(500).get(),
        adminDb.collection("users").where("role", "in", ["STUDENT", "student", "SCHOLAR", "scholar", "CADET", "cadet"]).limit(500).get()
      ]);

      const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...plain(doc.data()) }));
      const staffMap = new Map<string, any>();
      [...usersTutorSnap.docs, ...usersStaffSnap.docs].forEach(doc => {
        const data = doc.data();
        staffMap.set(doc.id, {
          id: doc.id,
          name: data.name || data.displayName || data.email || doc.id,
          email: data.email || "",
          role: normaliseRole(data.role),
          accountStatus: data.accountStatus || "ACTIVE"
        });
      });

      const schools = schoolsSnap.docs.map(doc => ({
        id: doc.id,
        ...plain(doc.data())
      }));

      const parents = parentsSnap.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || doc.data().displayName || doc.data().email || "Parent",
        email: doc.data().email || "",
        phone: doc.data().phone || "",
        role: "parent",
        billing: plain(doc.data().billing) || null,
        accountStatus: doc.data().accountStatus || "ACTIVE",
        createdAt: plain(doc.data().createdAt)
      }));

      const allStudentsMap = new Map<string, any>();
      individualSnap.docs.forEach(d => allStudentsMap.set(d.id, { id: d.id, collection: 'individualStudents', ...plain(d.data()) }));
      studentsSnap.docs.forEach(d => {
        if (!allStudentsMap.has(d.id)) allStudentsMap.set(d.id, { id: d.id, collection: 'students', ...plain(d.data()) });
      });
      usersStudentSnap.docs.forEach(d => {
        const data = d.data();
        const key = String(data.studentDocId || d.id);
        if (!allStudentsMap.has(key)) {
          allStudentsMap.set(key, { id: key, collection: 'users', fullName: data.fullName || data.name || 'Student', ...plain(data) });
        }
      });

      let allStudentsList = Array.from(allStudentsMap.values()).map(safeStudent);
      if (requestedSchoolId) {
        allStudentsList = allStudentsList.filter(s => String(s.schoolId || '').toLowerCase() === requestedSchoolId.toLowerCase());
      }

      // Filter direct/self-registered students (no schoolId, no parentId)
      const directStudents = allStudentsList.filter(s => !s.schoolId && !s.parentId);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
          role,
          config,
          payments,
          billingSummary: billingSummary(payments),
          enrollments: enrollmentSnap.docs.map(doc => ({ id: doc.id, ...plain(doc.data()) })),
          withdrawals: withdrawalsSnap.docs.map(doc => ({ id: doc.id, ...plain(doc.data()) })),
          staff: Array.from(staffMap.values()).filter(item => isActiveRecord(item)),
          schools,
          parents,
          students: allStudentsList,
          directStudents
        })
      };
    }

    // Staff / Tutor Role
    if (isStaffRole(role)) {
      const [payments, students, walletSnap, withdrawalSnap] = await Promise.all([
        staffPayments(decoded.uid),
        assignedStudentRecords(decoded.uid),
        adminDb.collection("staffWallets").doc(decoded.uid).get(),
        adminDb.collection("walletWithdrawals").where("staffId", "==", decoded.uid).limit(25).get()
      ]);
      const wallet = walletSnap.exists ? safeWallet(plain(walletSnap.data())) : { availableBalance: 0, reservedBalance: 0, lifetimeEarned: 0 };
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
          role,
          config,
          payments,
          billingSummary: billingSummary(payments),
          students,
          wallet,
          withdrawals: withdrawalSnap.docs.map(doc => ({ id: doc.id, ...plain(doc.data()) }))
        })
      };
    }

    // School Administrator Role
    if (role === "school") {
      let schoolId = String((user as any).schoolId || event.queryStringParameters?.schoolId || "").trim();
      let schoolDoc: any = null;

      if (schoolId) {
        const snap = await adminDb.collection("schools").doc(schoolId).get();
        if (snap.exists) schoolDoc = { id: snap.id, ...plain(snap.data()) };
      }

      if (!schoolDoc) {
        // Try finding by UID
        const byUidSnap = await adminDb.collection("schools").doc(decoded.uid).get();
        if (byUidSnap.exists) {
          schoolDoc = { id: byUidSnap.id, ...plain(byUidSnap.data()) };
          schoolId = schoolDoc.id;
        } else {
          // Try finding by user email or contactEmail or adminEmail or adminUid
          const userEmail = (decoded.email || (user as any).email || "").toLowerCase();
          if (userEmail) {
            const byEmailSnap = await adminDb.collection("schools").where("contactEmail", "==", userEmail).limit(1).get();
            if (!byEmailSnap.empty) {
              schoolDoc = { id: byEmailSnap.docs[0].id, ...plain(byEmailSnap.docs[0].data()) };
              schoolId = schoolDoc.id;
            } else {
              const byEmail2 = await adminDb.collection("schools").where("email", "==", userEmail).limit(1).get();
              if (!byEmail2.empty) {
                schoolDoc = { id: byEmail2.docs[0].id, ...plain(byEmail2.docs[0].data()) };
                schoolId = schoolDoc.id;
              } else {
                const byAdminEmail = await adminDb.collection("schools").where("adminEmail", "==", userEmail).limit(1).get();
                if (!byAdminEmail.empty) {
                  schoolDoc = { id: byAdminEmail.docs[0].id, ...plain(byAdminEmail.docs[0].data()) };
                  schoolId = schoolDoc.id;
                }
              }
            }
          }
          if (!schoolDoc) {
            const byAdminUid = await adminDb.collection("schools").where("adminUid", "==", decoded.uid).limit(1).get();
            if (!byAdminUid.empty) {
              schoolDoc = { id: byAdminUid.docs[0].id, ...plain(byAdminUid.docs[0].data()) };
              schoolId = schoolDoc.id;
            }
          }
        }
      }

      const effectiveSchoolId = schoolId || decoded.uid;
      const schoolName = String(schoolDoc?.name || (user as any).schoolName || (user as any).name || "").trim();

      // Collect all payments matching school (including migrated previousAdminUid / previousAdminEmail)
      const paymentQueries = [
        adminDb.collection("payments").where("schoolId", "==", effectiveSchoolId).limit(100).get(),
        adminDb.collection("payments").where("userId", "==", decoded.uid).limit(100).get(),
      ];
      if (schoolDoc?.id && schoolDoc.id !== effectiveSchoolId) {
        paymentQueries.push(adminDb.collection("payments").where("schoolId", "==", schoolDoc.id).limit(100).get());
      }
      if (schoolDoc?.previousAdminUid) {
        paymentQueries.push(adminDb.collection("payments").where("userId", "==", String(schoolDoc.previousAdminUid)).limit(100).get());
      }
      if (schoolDoc?.previousAdminEmail) {
        paymentQueries.push(adminDb.collection("payments").where("email", "==", String(schoolDoc.previousAdminEmail)).limit(100).get());
        paymentQueries.push(adminDb.collection("payments").where("payerEmail", "==", String(schoolDoc.previousAdminEmail)).limit(100).get());
      }
      if (decoded.email) {
        paymentQueries.push(adminDb.collection("payments").where("email", "==", decoded.email).limit(100).get());
        paymentQueries.push(adminDb.collection("payments").where("payerEmail", "==", decoded.email).limit(100).get());
      }
      if (schoolName) {
        paymentQueries.push(adminDb.collection("payments").where("schoolName", "==", schoolName).limit(100).get());
      }

      // Collect all students matching school
      const studentQueries = [
        adminDb.collection("individualStudents").where("schoolId", "==", effectiveSchoolId).limit(200).get(),
        adminDb.collection("students").where("schoolId", "==", effectiveSchoolId).limit(200).get(),
        adminDb.collection("users").where("schoolId", "==", effectiveSchoolId).limit(200).get(),
      ];
      if (schoolDoc?.id && schoolDoc.id !== effectiveSchoolId) {
        studentQueries.push(adminDb.collection("individualStudents").where("schoolId", "==", schoolDoc.id).limit(200).get());
        studentQueries.push(adminDb.collection("students").where("schoolId", "==", schoolDoc.id).limit(200).get());
        studentQueries.push(adminDb.collection("users").where("schoolId", "==", schoolDoc.id).limit(200).get());
      }
      if (schoolName) {
        studentQueries.push(adminDb.collection("individualStudents").where("schoolName", "==", schoolName).limit(200).get());
        studentQueries.push(adminDb.collection("students").where("schoolName", "==", schoolName).limit(200).get());
      }

      const recipientIds = Array.from(new Set([decoded.uid, effectiveSchoolId, schoolDoc?.previousAdminUid].filter(Boolean)));
      const [paymentSnaps, studentSnaps, enrollmentsSnap, notificationSnap] = await Promise.all([
        Promise.all(paymentQueries.map(q => q.catch(() => ({ docs: [] as any[] })))),
        Promise.all(studentQueries.map(q => q.catch(() => ({ docs: [] as any[] })))),
        adminDb.collection("enrollment_requests").where("schoolId", "==", effectiveSchoolId).limit(100).get().catch(() => ({ docs: [] as any[] })),
        adminDb.collection("notifications").where("recipientId", "in", recipientIds.slice(0, 10)).limit(25).get().catch(() => ({ docs: [] as any[] }))
      ]);

      const paymentMap = new Map<string, any>();
      paymentSnaps.forEach(snap => {
        snap.docs.forEach(doc => {
          if (!paymentMap.has(doc.id)) {
            paymentMap.set(doc.id, { id: doc.id, ...plain(doc.data()) });
          }
        });
      });
      const payments = Array.from(paymentMap.values()).sort((a, b) => new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime());

      const studentMap = new Map<string, any>();
      studentSnaps.forEach(snap => {
        snap.docs.forEach(doc => {
          const data = doc.data();
          const roleVal = String(data.role || '').toUpperCase();
          if (snap === studentQueries[2] && !['STUDENT', 'SCHOLAR', 'CADET'].includes(roleVal) && !data.studentDocId) {
            return;
          }
          const key = String(data.studentDocId || doc.id);
          if (!studentMap.has(key)) {
            studentMap.set(key, {
              id: key,
              fullName: data.fullName || data.studentName || data.name || 'Student',
              studentName: data.fullName || data.studentName || data.name || 'Student',
              username: data.username || key,
              class: data.class || data.grade || 'General',
              grade: data.class || data.grade || 'General',
              track: data.track || 'General Tech',
              schoolId: data.schoolId || effectiveSchoolId,
              schoolName: data.schoolName || schoolName,
              portalAccessEnabled: data.portalAccessEnabled !== false,
              accountStatus: data.accountStatus || 'ACTIVE',
              ...plain(data)
            });
          }
        });
      });
      const students = Array.from(studentMap.values()).map(safeStudent);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
          role,
          config,
          schoolInfo: schoolDoc ? { id: schoolDoc.id, name: schoolDoc.name, schoolCode: schoolDoc.schoolCode, contactEmail: schoolDoc.contactEmail } : { id: effectiveSchoolId, name: schoolName || 'Partner School' },
          schoolBilling: schoolDoc?.billing || (user as any).billing || null,
          schoolPrograms: schoolDoc?.programs || [],
          payments,
          billingSummary: billingSummary(payments),
          enrollments: enrollmentsSnap.docs.map(doc => ({ id: doc.id, ...plain(doc.data()) })),
          students,
          notifications: notificationSnap.docs.map(doc => ({ id: doc.id, ...plain(doc.data()) }))
        })
      };
    }

    // Parent Role
    if (role === "parent") {
      const [payments, enrollments, students, notificationSnap] = await Promise.all([
        docs("payments", "parentId", decoded.uid, 100),
        docs("enrollment_requests", "parentId", decoded.uid, 100),
        Promise.all([
          docs("individualStudents", "parentId", decoded.uid, 100),
          docs("students", "parentId", decoded.uid, 100)
        ]).then(([a, b]) => [...a, ...b].map(safeStudent)),
        adminDb.collection("notifications").where("recipientId", "==", decoded.uid).limit(25).get()
      ]);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
          role,
          config,
          parentBilling: (user as any).billing || null,
          payments,
          billingSummary: billingSummary(payments),
          enrollments,
          students,
          notifications: notificationSnap.docs.map(doc => ({ id: doc.id, ...plain(doc.data()) }))
        })
      };
    }

    // Student Role
    if (role === "student") {
      // Find if this student is registered by a school or parent
      let studentRecord: any = null;
      const studentDocId = String((user as any).studentDocId || "");
      if (studentDocId) {
        const snap = await adminDb.collection("individualStudents").doc(studentDocId).get();
        if (snap.exists) studentRecord = { id: snap.id, ...plain(snap.data()) };
      }
      if (!studentRecord) {
        const byUidSnap = await adminDb.collection("individualStudents").where("firebaseUid", "==", decoded.uid).limit(1).get();
        if (!byUidSnap.empty) studentRecord = { id: byUidSnap.docs[0].id, ...plain(byUidSnap.docs[0].data()) };
      }
      if (!studentRecord) {
        const byEmailSnap = await adminDb.collection("individualStudents").where("email", "==", decoded.email?.toLowerCase() || "").limit(1).get();
        if (!byEmailSnap.empty) studentRecord = { id: byEmailSnap.docs[0].id, ...plain(byEmailSnap.docs[0].data()) };
      }

      const schoolId = String(studentRecord?.schoolId || (user as any).schoolId || "");
      const parentId = String(studentRecord?.parentId || (user as any).parentId || "");

      let isExempt = false;
      let managedBy: "school" | "parent" | "direct" = "direct";
      let managerName = "";

      if (schoolId) {
        isExempt = true;
        managedBy = "school";
        // lookup school name
        const schoolSnap = await adminDb.collection("schools").doc(schoolId).get();
        managerName = schoolSnap.exists ? schoolSnap.data()?.name || "Affiliated Partner School" : "Affiliated Partner School";
      } else if (parentId) {
        isExempt = true;
        managedBy = "parent";
        const parentSnap = await adminDb.collection("users").doc(parentId).get();
        managerName = parentSnap.exists ? parentSnap.data()?.name || "Parent / Guardian" : "Parent / Guardian";
      }

      const payments = await docs("payments", "userId", decoded.uid, 50);
      const notificationSnap = await adminDb.collection("notifications").where("recipientId", "==", decoded.uid).limit(25).get();

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
          role,
          config,
          isExempt,
          managedBy,
          managerName,
          studentBilling: (user as any).billing || studentRecord?.billing || null,
          payments,
          billingSummary: billingSummary(payments),
          notifications: notificationSnap.docs.map(doc => ({ id: doc.id, ...plain(doc.data()) }))
        })
      };
    }

    // Default fallback
    const payments = await docs("payments", "userId", decoded.uid, 50);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        role,
        config,
        payments,
        billingSummary: billingSummary(payments)
      })
    };
  } catch (error) {
    console.warn("Billing data lookup fallback engaged:", error);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ fallback: true })
    };
  }
};
