import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp } from "firebase/firestore";
import { parseExamScript } from "../../modules/examinations/parseExamScript";
import { normalizeQuestions } from "../../../api/_lib/jdi-assessment.js";
import { School, GraduationCap, ClipboardPaste, BookOpen, KeyRound, Check, Copy, ArrowRight, Eye, AlertCircle } from "lucide-react";

export default function TutorExaminations() {
  const location = useLocation();
  const isAdminWorkspace = location.pathname.startsWith("/admin/");

  // Core metadata
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [learningVideoUrl, setLearningVideoUrl] = useState("");

  // School & Class Dropdown State (No manual School ID required!)
  const [assignedSchools, setAssignedSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [customClassName, setCustomClassName] = useState("");
  const [isCustomClass, setIsCustomClass] = useState(false);
  const [schoolsLoading, setSchoolsLoading] = useState(true);

  // Exam parameters
  const [duration, setDuration] = useState(30);
  const [raw, setRaw] = useState("");
  const [questions, setQuestions] = useState<any[]>([]);
  const [scriptWarnings, setScriptWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedExamId, setSavedExamId] = useState("");
  const [generatedPasscode, setGeneratedPasscode] = useState("");
  const [copiedPasscode, setCopiedPasscode] = useState(false);
  const [status, setStatus] = useState<"draft" | "scheduled" | "active">("active");
  const [customPasscode, setCustomPasscode] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [gradingMode, setGradingMode] = useState<"automatic" | "manual">("automatic");
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Existing exams & bank
  const [existingExams, setExistingExams] = useState<any[]>([]);
  const [existingBusy, setExistingBusy] = useState(false);
  const [questionBank, setQuestionBank] = useState<any[]>([]);
  const [selectedBankQuestion, setSelectedBankQuestion] = useState("");
  const [bankBusy, setBankBusy] = useState(false);

  // 1. Load Schools assigned to this Tutor / Admin
  useEffect(() => {
    let isMounted = true;
    const fetchAssignedSchools = async () => {
      setSchoolsLoading(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        // Check user document for role & assigned schools
        const userDocSnap = await getDoc(doc(db, "users", currentUser.uid)).catch(() => null);
        const userData = userDocSnap?.exists() ? userDocSnap.data() : {};
        const userRole = String(userData.role || "").toUpperCase();
        const isAdmin = isAdminWorkspace || ["ADMIN", "SUPER_ADMIN", "SUPERADMIN"].includes(userRole);

        // Fetch staff school access if exists
        const staffAccessSnap = await getDoc(doc(db, "staffSchoolAccess", currentUser.uid)).catch(() => null);
        const staffAccessData = staffAccessSnap?.exists() ? staffAccessSnap.data() : {};

        const directSchoolIds = new Set<string>();
        if (userData.schoolId) directSchoolIds.add(String(userData.schoolId));
        if (Array.isArray(userData.schoolIds)) userData.schoolIds.forEach((id: any) => id && directSchoolIds.add(String(id)));
        if (Array.isArray(userData.assignedSchools)) userData.assignedSchools.forEach((s: any) => typeof s === "string" ? directSchoolIds.add(s) : s?.id && directSchoolIds.add(s.id));
        if (staffAccessData.schoolId) directSchoolIds.add(String(staffAccessData.schoolId));
        if (Array.isArray(staffAccessData.schoolIds)) staffAccessData.schoolIds.forEach((id: any) => id && directSchoolIds.add(String(id)));

        // Load schools from Firestore
        const allSchoolsSnap = await getDocs(collection(db, "schools")).catch(() => ({ docs: [] } as any));
        const schoolsList: { id: string; name: string }[] = [];

        allSchoolsSnap.docs?.forEach((d: any) => {
          const s = d.data();
          const sId = d.id;
          const sName = s.name || s.schoolName || `School ${sId}`;

          if (isAdmin) {
            schoolsList.push({ id: sId, name: sName });
          } else {
            // Check tutor assignment vectors
            const tutorsArr = Array.isArray(s.tutors) ? s.tutors.map((x: any) => typeof x === "string" ? x : x?.id || x?.uid) : [];
            const assignedTutors = Array.isArray(s.assignedTutorIds) ? s.assignedTutorIds : [];
            const staffIds = Array.isArray(s.staffIds) ? s.staffIds : [];

            if (
              directSchoolIds.has(sId) ||
              tutorsArr.includes(currentUser.uid) ||
              assignedTutors.includes(currentUser.uid) ||
              staffIds.includes(currentUser.uid) ||
              s.tutorId === currentUser.uid ||
              s.staffId === currentUser.uid
            ) {
              schoolsList.push({ id: sId, name: sName });
            }
          }
        });

        // If admin workspace, load all schools. If tutor, strictly show ONLY schools assigned to them.
        if (isAdmin && schoolsList.length === 0 && allSchoolsSnap.docs?.length > 0) {
          allSchoolsSnap.docs.forEach((d: any) => {
            const s = d.data();
            schoolsList.push({ id: d.id, name: s.name || s.schoolName || d.id });
          });
        } else if (!isAdmin && schoolsList.length === 0) {
          const storedSchId = sessionStorage.getItem("schoolId") || sessionStorage.getItem("schoolDocId");
          const storedSchName = sessionStorage.getItem("schoolName");
          if (storedSchId && storedSchName) {
            schoolsList.push({ id: storedSchId, name: storedSchName });
          }
        }

        if (isMounted) {
          setAssignedSchools(schoolsList);
          if (schoolsList.length > 0 && !schoolId) {
            setSchoolId(schoolsList[0].id);
          }
        }
      } catch (err) {
        console.warn("Could not load assigned schools:", err);
      } finally {
        if (isMounted) setSchoolsLoading(false);
      }
    };

    void fetchAssignedSchools();
    return () => { isMounted = false; };
  }, [isAdminWorkspace]);

  // 2. Load classes for selected school
  useEffect(() => {
    let isMounted = true;
    if (!schoolId) {
      setAvailableClasses([]);
      return;
    }

    const fetchClassesForSchool = async () => {
      try {
        const classNames = new Set<string>();

        // Query students in this school to discover active classes
        const [indSnap, stdSnap, schSnap, schedSnap] = await Promise.all([
          getDocs(query(collection(db, "individualStudents"), where("schoolId", "==", schoolId))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, "students"), where("schoolId", "==", schoolId))).catch(() => ({ docs: [] } as any)),
          getDoc(doc(db, "schools", schoolId)).catch(() => null),
          getDocs(query(collection(db, "classSchedules"), where("schoolId", "==", schoolId))).catch(() => ({ docs: [] } as any))
        ]);

        indSnap.docs?.forEach((d: any) => {
          const c = d.data().class || d.data().grade || d.data().className;
          if (c && typeof c === "string" && c.trim()) classNames.add(c.trim());
        });
        stdSnap.docs?.forEach((d: any) => {
          const c = d.data().class || d.data().grade || d.data().className;
          if (c && typeof c === "string" && c.trim()) classNames.add(c.trim());
        });

        if (schSnap?.exists()) {
          const schData = schSnap.data();
          if (Array.isArray(schData.classes)) schData.classes.forEach((c: any) => c && classNames.add(String(c).trim()));
          if (Array.isArray(schData.grades)) schData.grades.forEach((c: any) => c && classNames.add(String(c).trim()));
        }

        schedSnap.docs?.forEach((d: any) => {
          const c = d.data().className || d.data().classLevel || d.data().grade;
          if (c && typeof c === "string" && c.trim()) classNames.add(c.trim());
        });

        // Add standard school grades if set is small
        if (classNames.size === 0) {
          ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6", "JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"].forEach(c => classNames.add(c));
        }

        const sorted = Array.from(classNames).sort();
        if (isMounted) {
          setAvailableClasses(sorted);
          if (sorted.length > 0 && !selectedClass) {
            setSelectedClass(sorted[0]);
          }
        }
      } catch (err) {
        console.warn("Could not load classes for school:", err);
      }
    };

    void fetchClassesForSchool();
    return () => { isMounted = false; };
  }, [schoolId]);

  // Parse Exam Script
  const parseScript = () => {
    const parsed = parseExamScript(raw);
    const issues: string[] = [];
    const questionSection = raw.split(/^\s*(answer\s*key|answers)\s*(?::|-)?/im)[0];
    const numbers = Array.from(questionSection.matchAll(/^\s*(\d+)[.)]\s+/gm), m => Number(m[1]));
    
    if (!raw.trim()) issues.push("Paste the questions and answer key before parsing.");
    if (!numbers.length) issues.push("Start each question with a number, for example: 1. What is 2 + 2?");
    
    const seen = new Set<number>();
    numbers.forEach((n, index) => {
      if (seen.has(n)) issues.push(`Question number ${n} is repeated.`);
      seen.add(n);
      if (n !== index + 1) issues.push(`Use consecutive question numbers starting at 1; found ${n} at position ${index + 1}.`);
    });

    if (numbers.length && !/^\s*(answer\s*key|answers)\s*(?::|-)?/im.test(raw)) {
      issues.push("Add an ANSWER KEY section after all questions.");
    }

    parsed.forEach((q, i) => {
      if (!q.prompt.trim()) issues.push(`Question ${i + 1} needs question text.`);
      if (["single_choice", "multiple_choice", "true_false"].includes(q.type) && (!q.options || q.options.length < 2)) {
        issues.push(`Question ${i + 1} needs at least two options.`);
      }
      if (["single_choice", "multiple_choice", "true_false"].includes(q.type) && !q.correctOptionIds?.length) {
        issues.push(`Question ${i + 1} has no valid answer-key entry. Check option letter and question number.`);
      }
      if (q.type === "single_choice" && q.correctOptionIds && q.correctOptionIds.length !== 1) {
        issues.push(`Question ${i + 1} must have exactly one correct option.`);
      }
    });

    setQuestions(parsed);
    setScriptWarnings([...new Set(issues)]);
  };

  const scriptTemplate = `1. What is the shortcut key to copy text on a computer?
A. Ctrl + C
B. Ctrl + V
C. Ctrl + P
D. Ctrl + X

2. Which of the following is an input device?
A. Monitor
B. Keyboard
C. Speaker
D. Printer

3. Hardware refers to the physical parts of a computer system.
A. True
B. False

ANSWER KEY
1. A
2. B
3. A`;

  // Compute SHA-256 for passcode
  const computeHash = async (val: string) => {
    try {
      const msgBuffer = new TextEncoder().encode(val.trim());
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return val.toLowerCase();
    }
  };

  // Save Examination (Direct Firestore + Netlify fallback)
  const save = async () => {
    setBusy(true);
    setMessage("");
    setSavedExamId("");
    try {
      if (!auth.currentUser) throw new Error("Please sign in to your tutor account.");
      if (!title.trim()) throw new Error("Please enter an examination title.");
      if (!subject.trim()) throw new Error("Please enter an examination subject.");
      if (!schoolId) throw new Error("Please select an assigned school.");
      
      const effectiveClass = isCustomClass ? customClassName.trim() : selectedClass;
      if (!effectiveClass) throw new Error("Please select or specify a target class.");
      if (!questions.length) throw new Error("Please paste and parse the examination questions before saving.");

      const selectedSchoolObj = assignedSchools.find(s => s.id === schoolId);
      const schoolName = selectedSchoolObj?.name || "Assigned Partner School";

      // Generate secure 6-digit passcode if not provided
      const finalPasscode = customPasscode.trim() || `JDI-${Math.floor(100000 + Math.random() * 900000)}`;
      const passcodeHash = await computeHash(finalPasscode);

      const examDocId = `exam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const targetClassList = effectiveClass === "all" ? ["all"] : [effectiveClass];

      const examPayload: Record<string, any> = {
        title: title.trim(),
        subject: subject.trim(),
        seriesName: seriesName.trim() || null,
        courseName: courseName.trim() || null,
        learningVideoUrl: learningVideoUrl.trim() || null,
        schoolId,
        schoolName,
        targetClass: effectiveClass,
        className: effectiveClass,
        classIds: targetClassList,
        audienceType: "school",
        durationMinutes: Number(duration) || 30,
        questions,
        status,
        gradingMode,
        maxAttempts: Number(maxAttempts) || 1,
        shuffleQuestions,
        shuffleOptions,
        passcode: finalPasscode,
        passcodeHash,
        availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
        availableUntil: availableUntil ? new Date(availableUntil).toISOString() : null,
        createdBy: auth.currentUser.uid,
        createdByName: auth.currentUser.displayName || "Tutor",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // 1. Try server endpoint
      let serverSaved = false;
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch("/.netlify/functions/tutor-examinations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...examPayload,
            passcode: finalPasscode
          })
        });
        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          if (data.exam?.id) {
            serverSaved = true;
            setSavedExamId(data.exam.id);
          }
        }
      } catch (apiErr) {
        console.warn("Server tutor exam notice, writing to Firestore:", apiErr);
      }

      // 2. Direct Firestore Write
      if (!serverSaved) {
        await Promise.all([
          setDoc(doc(db, "jdiExams", examDocId), examPayload, { merge: true }),
          setDoc(doc(db, "schoolExams", examDocId), examPayload, { merge: true })
        ]);
        setSavedExamId(examDocId);
      }

      setGeneratedPasscode(finalPasscode);
      setMessage(`Examination created successfully for ${schoolName} (Class: ${effectiveClass}).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save examination.");
    } finally {
      setBusy(false);
    }
  };

  const copyToClipboard = () => {
    if (!generatedPasscode) return;
    navigator.clipboard.writeText(generatedPasscode);
    setCopiedPasscode(true);
    setTimeout(() => setCopiedPasscode(false), 2500);
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      {/* HEADER */}
      <header className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-blue-200">JAYSTARBLISS DYNAMIC INSTITUTE · JDI</p>
            <h1 className="mt-2 text-3xl font-bold">{isAdminWorkspace ? "Examination Management Hub" : "Tutor Examination Creator"}</h1>
            <p className="mt-2 max-w-2xl text-slate-200">Select an assigned school and class from the dropdown lists, paste your examination questions with the answer key, and publish tests instantly for your learners.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <GraduationCap size={28} className="mx-auto text-blue-400" />
            <span className="mt-1 block text-xs font-semibold text-slate-300">Class-Specific CBT</span>
          </div>
        </div>
      </header>

      {/* SUCCESS PASSCODE BANNER */}
      {savedExamId && generatedPasscode && (
        <section className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-200/80 px-3 py-1 text-xs font-bold text-emerald-900">
                <Check size={14} /> Exam Published Successfully
              </span>
              <h2 className="mt-2 text-xl font-black text-emerald-950">Student Access Passcode</h2>
              <p className="mt-1 text-sm text-emerald-800">Share this code with students enrolled in this specific class so they can unlock and begin the test.</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-3 shadow-inner">
              <KeyRound size={20} className="text-emerald-700" />
              <span className="font-mono text-xl font-black tracking-widest text-slate-900">{generatedPasscode}</span>
              <button
                type="button"
                onClick={copyToClipboard}
                className="ml-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition-colors"
              >
                {copiedPasscode ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* STEP 1: AUDIENCE & BASIC METADATA */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-2 border-b pb-4">
          <School className="text-blue-600" size={22} />
          <div>
            <h2 className="text-lg font-bold text-slate-900">1. Assigned School & Class Selection</h2>
            <p className="text-xs text-slate-500">Pick from your assigned schools and choose which class this examination is intended for.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* School Dropdown */}
          <label className="block text-sm font-semibold text-slate-700">
            Assigned School
            <select
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              value={schoolId}
              onChange={e => {
                setSchoolId(e.target.value);
                setSelectedClass("");
              }}
              disabled={schoolsLoading}
            >
              {schoolsLoading ? (
                <option value="">Loading assigned schools…</option>
              ) : assignedSchools.length === 0 ? (
                <option value="">No schools currently assigned to your account</option>
              ) : (
                assignedSchools.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </label>

          {/* Class Dropdown */}
          <label className="block text-sm font-semibold text-slate-700">
            Assigned Class
            <div className="mt-1.5 flex gap-2">
              {!isCustomClass ? (
                <select
                  className="block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                >
                  <option value="all">All Classes (Whole School)</option>
                  {availableClasses.map(cls => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. Year 5 Alpha, Grade 4B, Primary 3"
                  className="block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  value={customClassName}
                  onChange={e => setCustomClassName(e.target.value)}
                />
              )}
              <button
                type="button"
                onClick={() => setIsCustomClass(!isCustomClass)}
                className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                {isCustomClass ? "From List" : "+ Custom"}
              </button>
            </div>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2 pt-2">
          <label className="block text-sm font-semibold text-slate-700">
            Examination Title *
            <input
              type="text"
              required
              placeholder="e.g. First Term CBT Assessment on Basic Computer Operations"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Subject / Area *
            <input
              type="text"
              required
              placeholder="e.g. Computer Studies & Coding, ICT, Mathematics"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Duration (Minutes)
            <input
              type="number"
              min={5}
              max={240}
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500"
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Marking Mode
            <select
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-3.5 font-normal text-slate-900 outline-none focus:border-blue-500"
              value={gradingMode}
              onChange={e => setGradingMode(e.target.value as any)}
            >
              <option value="automatic">Automatic Objective Grading (Instant Marks)</option>
              <option value="manual">Manual Marking by Tutor</option>
            </select>
          </label>
        </div>
      </section>

      {/* STEP 2: PASTE THE EXAM SCRIPT */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="text-blue-600" size={22} />
            <div>
              <h2 className="text-lg font-bold text-slate-900">2. Paste Examination Questions & Answer Key</h2>
              <p className="text-xs text-slate-500">Put each numbered question on its own line, list options A-D, and finish with an ANSWER KEY section.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setRaw(scriptTemplate);
              setScriptWarnings([]);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
          >
            <ClipboardPaste size={14} />
            Insert Sample Template
          </button>
        </div>

        <textarea
          rows={12}
          className="w-full rounded-xl border border-slate-300 bg-slate-900 p-4 font-mono text-sm text-emerald-400 outline-none focus:border-blue-500"
          value={raw}
          onChange={e => {
            setRaw(e.target.value);
            setScriptWarnings([]);
          }}
          placeholder={"1. What is the shortcut key to copy text on a computer?\nA. Ctrl + C\nB. Ctrl + V\nC. Ctrl + P\nD. Ctrl + X\n\nANSWER KEY\n1. A"}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={parseScript}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            <BookOpen size={16} />
            Parse & Validate Questions ({questions.length})
          </button>
          {questions.length > 0 && (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              ✓ {questions.length} question(s) parsed and ready
            </span>
          )}
        </div>

        {scriptWarnings.length > 0 && (
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle size={18} className="text-amber-700" />
              Please review the following formatting notices:
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
              {scriptWarnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* STEP 3: QUESTION CARDS REVIEW */}
      {questions.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-lg font-bold text-slate-900">3. Review Parsed Questions ({questions.length})</h2>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Eye size={14} />
              {showPreview ? "Hide Student View" : "Student View Preview"}
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((q, i) => (
              <div key={q.id || i} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">
                      {i + 1}. {q.prompt}
                    </p>
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {q.options.map((opt: any) => {
                          const isCorrect = Array.isArray(q.correctOptionIds) && q.correctOptionIds.includes(opt.id);
                          return (
                            <div
                              key={opt.id}
                              className={`rounded-lg border px-3 py-2 ${
                                isCorrect
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                                  : "border-slate-200 bg-white text-slate-700"
                              }`}
                            >
                              <span className="font-bold mr-1.5">{opt.id}.</span> {opt.text}
                              {isCorrect && <span className="ml-1 text-[10px] text-emerald-700 uppercase font-black">(Correct)</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="rounded-md bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">
                      {q.points || 1} mark(s)
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SUBMISSION & STATUS */}
      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900">
          {message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
        <a
          href={isAdminWorkspace ? "/admin/examination-history" : "/portal/staff/exam-history"}
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          View Examination History & Reports
        </a>
        <button
          type="button"
          disabled={busy || questions.length === 0}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving Examination…" : "Publish Examination Now"}
          <ArrowRight size={16} />
        </button>
      </div>
    </main>
  );
}
