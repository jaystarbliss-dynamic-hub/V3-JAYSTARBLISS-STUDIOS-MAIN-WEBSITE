import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { getClientDatabases } from './firebase';
import { formatNormalizedClassDisplay, isCanonicalClass, normalizeClassList, normalizeClassName } from './classes';

let migrationInProgress = false;
let lastMigrationRunAt = 0;

/**
 * Scans all relevant Firestore collections across active client databases and
 * migrates any legacy class/grade values (Primary X, Year X, JSS X, SS X,
 * Undergraduate, Graduate, etc.) into the 15 canonical platform grades while
 * eliminating duplicate grades (e.g. "Grade 5, Grade 5").
 */
export async function migrateAllFirestoreClasses(force = false): Promise<number> {
  const now = Date.now();
  if (migrationInProgress) return 0;
  if (!force && now - lastMigrationRunAt < 60_000) return 0;

  migrationInProgress = true;
  lastMigrationRunAt = now;
  let updatedCount = 0;

  try {
    const databases = getClientDatabases();
    const collectionsToScan = [
      'students',
      'individualStudents',
      'users',
      'enrollment_requests',
      'student_requests',
      'enrollments',
      'classSchedules',
      'jdiExams',
      'schoolExams',
      'jdiExamAttempts',
      'parents',
      'schools',
    ];

    for (const targetDb of databases) {
      for (const collName of collectionsToScan) {
        let snap;
        try {
          snap = await getDocs(collection(targetDb, collName));
        } catch {
          continue;
        }

        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          if (!data || typeof data !== 'object') continue;

          // For `users`, only normalize student records or records that explicitly carry class/grade fields
          if (collName === 'users') {
            const role = String(data.role || '').toUpperCase();
            const isStudentRecord =
              ['STUDENT', 'CADET', 'SCHOLAR', 'INDIVIDUAL_STUDENT'].includes(role) ||
              Boolean(data.isStudent || data.studentDocId || data.class || data.grade || data.classLevel);
            if (!isStudentRecord) continue;
          }

          const updates: Record<string, any> = {};

          // 1. Single-string class fields
          const stringFields = ['class', 'grade', 'className', 'classLevel', 'studentClass', 'targetClass'];
          for (const field of stringFields) {
            if (typeof data[field] === 'string' && data[field].trim()) {
              const rawVal = data[field].trim();
              const normalized = rawVal.includes(',')
                ? formatNormalizedClassDisplay(rawVal, '')
                : normalizeClassName(rawVal, '');
              if (normalized && normalized !== rawVal && (isCanonicalClass(normalized) || normalized.includes(','))) {
                updates[field] = normalized;
              }
            }
          }

          // Special handling for `studentAge` on enrollment_requests when it contains a class/grade label
          if (typeof data.studentAge === 'string' && data.studentAge.trim()) {
            const normAge = normalizeClassName(data.studentAge, '');
            if (normAge && isCanonicalClass(normAge)) {
              if (data.studentAge.trim() !== normAge) {
                updates.studentAge = normAge;
              }
              if (data.class !== normAge) updates.class = normAge;
              if (data.grade !== normAge) updates.grade = normAge;
            }
          }

          // Keep `class` and `grade` synchronized on student documents
          if (collName === 'students' || collName === 'individualStudents') {
            const resolved =
              updates.class ||
              updates.grade ||
              normalizeClassName(data.class || data.grade || data.className || data.classLevel, '');
            if (resolved && isCanonicalClass(resolved)) {
              if (data.class !== resolved) updates.class = resolved;
              if (data.grade !== resolved) updates.grade = resolved;
            }
          }

          // 2. Array class fields (deduplicating any repeated grades like ["Grade 5", "Grade 5"])
          const arrayFields = ['classLevels', 'combinedClasses', 'targetClasses', 'classes'];
          for (const field of arrayFields) {
            if (Array.isArray(data[field]) && data[field].length > 0) {
              const rawArr: string[] = data[field].map((x: unknown) => String(x ?? '').trim()).filter(Boolean);
              const hasAll = rawArr.some(x => x.toLowerCase() === 'all');
              const normArr = hasAll ? ['all'] : normalizeClassList(rawArr);
              if (
                normArr.length > 0 &&
                (normArr.length !== rawArr.length || normArr.some((val, idx) => val !== rawArr[idx]))
              ) {
                updates[field] = normArr;
              }
            }
          }

          // 3. `slotGroups` array inside `classSchedules`
          if (Array.isArray(data.slotGroups) && data.slotGroups.length > 0) {
            let slotChanged = false;
            const nextSlots = data.slotGroups.map((slot: any) => {
              if (!slot || !Array.isArray(slot.classes)) return slot;
              const normClasses = normalizeClassList(slot.classes);
              const prevClasses = slot.classes.map((c: any) => String(c ?? '').trim());
              const nextLabel =
                normClasses.length > 1
                  ? `${normClasses.join(' & ')} Combined`
                  : normClasses[0] || slot.label || 'Class Cohort';
              if (
                normClasses.length !== prevClasses.length ||
                normClasses.some((v, i) => v !== prevClasses[i]) ||
                (slot.label && /\b(jss|ss|sss|primary|year)\b/i.test(slot.label))
              ) {
                slotChanged = true;
                return { ...slot, classes: normClasses, label: nextLabel };
              }
              return slot;
            });
            if (slotChanged) {
              updates.slotGroups = nextSlots;
            }
          }

          // 4. `children` array inside `parents`
          if (collName === 'parents' && Array.isArray(data.children) && data.children.length > 0) {
            let childrenChanged = false;
            const nextChildren = data.children.map((child: any) => {
              if (!child || typeof child !== 'object') return child;
              const normChildClass = normalizeClassName(child.class || child.grade || child.studentAge, '');
              if (normChildClass && isCanonicalClass(normChildClass)) {
                if (child.class !== normChildClass || child.grade !== normChildClass) {
                  childrenChanged = true;
                  return { ...child, class: normChildClass, grade: normChildClass };
                }
              }
              return child;
            });
            if (childrenChanged) {
              updates.children = nextChildren;
            }
          }

          if (Object.keys(updates).length > 0) {
            try {
              await updateDoc(doc(targetDb, collName, docSnap.id), updates);
              updatedCount++;
            } catch {
              // Ignore individual permission or offline errors
            }
          }
        }
      }
    }
  } finally {
    migrationInProgress = false;
  }

  return updatedCount;
}
