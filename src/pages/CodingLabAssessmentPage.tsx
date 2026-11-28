import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Lock,
} from 'lucide-react';
import { auth, db, getAllClientDatabases } from '../lib/firebase';
import SEO from '../components/ui/SEO';
import CodingLabEditorHost from '../components/coding-lab/CodingLabEditorHost';
import { CODING_LAB_CONFIG } from '../config/codingLabConfig';
import type {
  CodingLabAssessmentConfig,
  CodingLabSubmissionRecord,
} from '../types/codingLab';
import { downloadSubmittedCodingLabSb3 } from '../services/codingLab/CodingLabSubmissionService';
import {
  buildAssessmentProjectId,
  loadAssessmentProjectFromFirestore,
} from '../services/codingLab/CodingLabProjectService';

interface LoadedAssessmentAttempt {
  attemptId: string;
  examId: string;
  ownerUid: string;
  learnerName: string;
  schoolId: string;
  tutorId: string;
  status: string;
  title: string;
  subject: string;
  instructions: string;
  maxScore: number;
  durationMinutes: number | null;
  deadlineAt: string | null;
  attemptNumber?: number;
  maxAttempts?: number;
  releaseGradesPolicy?: string;
  codingConfig?: CodingLabAssessmentConfig;
  score?: number;
  percentage?: number;
  resultReleased?: boolean;
  submittedAt?: string;
}

/**
 * Dedicated Protected Full-Screen Coding Lab Assessment Workspace (`/coding-lab/assessment/:attemptId`).
 * Mounted outside PortalLayout so learners get the entire 100dvh viewport with zero portal chrome,
 * zero global marketing/WhatsApp widgets, and strict Coding Lab timer isolation.
 */
const CodingLabAssessmentPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState<LoadedAssessmentAttempt | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<CodingLabSubmissionRecord | null>(null);
  const [downloadingSb3, setDownloadingSb3] = useState(false);

  useEffect(() => {
    let active = true;

    const loadAttempt = async (uid: string) => {
      if (!attemptId) {
        if (active) {
          setError('Assessment attempt ID is missing.');
          setLoading(false);
        }
        return;
      }

      try {
        const dbs = getAllClientDatabases();
        let attemptData: Record<string, any> | null = null;
        let matchedDb = db;

        for (const dbInst of dbs) {
          const snap = await getDoc(doc(dbInst, 'jdiExamAttempts', attemptId)).catch(() => null);
          if (snap?.exists()) {
            attemptData = snap.data() as Record<string, any>;
            matchedDb = dbInst;
            break;
          }
        }

        if (!attemptData) {
          if (active) {
            setError('We could not find this Coding Lab assessment attempt.');
            setLoading(false);
          }
          return;
        }

        const attemptOwnerUid = String(attemptData.studentUid || attemptData.userId || '').trim();
        if (attemptOwnerUid && attemptOwnerUid !== uid) {
          if (active) {
            setError('You do not have permission to open another learner’s assessment attempt.');
            setLoading(false);
          }
          return;
        }

        const examId = String(attemptData.examId || '').trim();
        if (!examId) {
          if (active) {
            setError('Assessment reference is missing on this attempt.');
            setLoading(false);
          }
          return;
        }

        let examData: Record<string, any> | null = null;
        const primaryExamSnap = await getDoc(doc(matchedDb, 'jdiExams', examId)).catch(() => null);
        if (primaryExamSnap?.exists()) {
          examData = primaryExamSnap.data() as Record<string, any>;
        } else {
          for (const dbInst of dbs) {
            if (dbInst === matchedDb) continue;
            const snap = await getDoc(doc(dbInst, 'jdiExams', examId)).catch(() => null);
            if (snap?.exists()) {
              examData = snap.data() as Record<string, any>;
              break;
            }
          }
        }

        if (!examData) {
          if (active) {
            setError('The parent assessment for this Coding Lab session could not be loaded.');
            setLoading(false);
          }
          return;
        }

        // If this attempt is NOT a Coding Lab assessment, hand back cleanly to native exam route
        if (String(examData.deliveryMode || 'NATIVE').toUpperCase() !== 'CODING_LAB') {
          if (active) {
            navigate(`/portal/student/exams/${encodeURIComponent(attemptId)}`, { replace: true });
          }
          return;
        }

        const hasTimeLimit =
          examData.hasTimeLimit !== false &&
          (examData.hasTimeLimit === true ||
            (examData.durationMinutes != null && Number(examData.durationMinutes) > 0));

        const deadlineAt =
          hasTimeLimit && typeof attemptData.deadlineAt === 'string' && attemptData.deadlineAt
            ? attemptData.deadlineAt
            : null;

        if (active) {
          setLoaded({
            attemptId,
            examId,
            ownerUid: uid,
            learnerName:
              String(
                attemptData.studentName ||
                  sessionStorage.getItem('userName') ||
                  auth.currentUser?.displayName ||
                  'Student'
              ),
            schoolId: String(attemptData.schoolId || examData.schoolId || ''),
            tutorId: String(examData.tutorId || ''),
            status: String(attemptData.status || 'in_progress').toLowerCase(),
            title: String(examData.title || 'Coding Lab Assessment'),
            subject: String(examData.subject || 'Creative Coding'),
            instructions: String(examData.instructions || ''),
            maxScore: Number(examData.maxScore || attemptData.maxScore || 20),
            durationMinutes:
              examData.durationMinutes != null ? Number(examData.durationMinutes) : null,
            deadlineAt,
            attemptNumber:
              attemptData.attemptNumber != null ? Number(attemptData.attemptNumber) : undefined,
            maxAttempts:
              examData.maxAttempts != null ? Number(examData.maxAttempts) : undefined,
            releaseGradesPolicy: examData.releaseGradesPolicy,
            codingConfig: examData.codingLabConfig as CodingLabAssessmentConfig | undefined,
            score: attemptData.score != null ? Number(attemptData.score) : undefined,
            percentage:
              attemptData.percentage != null ? Number(attemptData.percentage) : undefined,
            resultReleased: Boolean(attemptData.resultReleased),
            submittedAt:
              typeof attemptData.submittedAt === 'string' ? attemptData.submittedAt : undefined,
          });
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load Coding Lab assessment. Please try again.'
          );
          setLoading(false);
        }
      }
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      const uid = user?.uid || sessionStorage.getItem('userId') || '';
      if (!uid) {
        navigate('/portal', { replace: true });
        return;
      }
      void loadAttempt(uid);
    });

    return () => {
      active = false;
      unsub();
    };
  }, [attemptId, navigate]);

  const handleDownloadBackup = async () => {
    if (!loaded || downloadingSb3) return;
    setDownloadingSb3(true);
    try {
      const projectId = buildAssessmentProjectId(loaded.examId, loaded.attemptId);
      const projectData = await loadAssessmentProjectFromFirestore(projectId);
      if (projectData?.sb3Buffer) {
        downloadSubmittedCodingLabSb3({
          sb3Buffer: projectData.sb3Buffer,
          learnerName: loaded.learnerName,
          assessmentTitle: loaded.title,
        });
      }
    } catch {
      // Non-fatal
    } finally {
      setDownloadingSb3(false);
    }
  };

  if (!CODING_LAB_CONFIG.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-bold text-slate-900">Coding Lab Unavailable</h1>
          <p className="text-sm text-slate-600">
            Coding Lab is currently disabled by platform configuration.
          </p>
          <button
            type="button"
            onClick={() => navigate('/portal/student/exams')}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold cursor-pointer"
          >
            Back to Assessments
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-slate-50 text-slate-700 gap-3">
        <Loader2 size={28} className="animate-spin text-[#B91C1C]" />
        <div className="text-sm font-semibold">Preparing Coding Lab Assessment Workspace...</div>
      </div>
    );
  }

  if (error || !loaded) {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full rounded-2xl bg-white border border-slate-200 p-6 shadow-sm space-y-4 text-center">
          <div className="mx-auto w-11 h-11 rounded-xl bg-red-50 text-[#B91C1C] flex items-center justify-center">
            <AlertCircle size={22} />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Unable to Open Assessment</h1>
          <p className="text-sm text-slate-600">{error || 'Assessment session not found.'}</p>
          <button
            type="button"
            onClick={() => navigate('/portal/student/exams')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer"
          >
            <ArrowLeft size={15} />
            Return to Assessments
          </button>
        </div>
      </div>
    );
  }

  const isClosed = loaded.status !== 'in_progress' || Boolean(submittedRecord);

  if (isClosed) {
    const finalScore =
      submittedRecord?.finalScore ?? submittedRecord?.automaticScore ?? loaded.score;
    const finalPercentage = submittedRecord?.percentage ?? loaded.percentage;
    const isReleased = Boolean(submittedRecord?.resultReleased ?? loaded.resultReleased);

    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-slate-50 p-6">
        <SEO
          title={`${loaded.title} | Coding Lab Assessment`}
          description="Your Coding Lab assessment submission has been saved and locked."
        />
        <div className="max-w-lg w-full rounded-2xl bg-white border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                <Lock size={12} />
                Submitted &amp; Locked
              </div>
              <h1 className="text-xl font-bold text-slate-900 mt-1">{loaded.title}</h1>
              <p className="text-xs text-slate-500 mt-0.5">{loaded.subject}</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            Your Coding Lab project has been securely saved to the LMS as an immutable submission.
          </p>

          {isReleased && finalScore !== undefined && finalScore !== null ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Released Score
                </div>
                <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">
                  {finalScore} / {loaded.maxScore}
                </div>
              </div>
              {finalPercentage !== undefined && finalPercentage !== null && (
                <div className="text-right">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Percentage
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-700 tabular-nums mt-0.5">
                    {Math.round(finalPercentage)}%
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600">
              Your project is locked and awaiting tutor review / result release.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => navigate(`/portal/student/exams/${encodeURIComponent(loaded.attemptId)}`)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1E293B] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
            >
              <FileText size={14} />
              View Submission Report
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadBackup()}
              disabled={downloadingSb3}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {downloadingSb3 ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Download .sb3
            </button>
            <button
              type="button"
              onClick={() => navigate('/portal/student/exams')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              <ArrowLeft size={14} />
              Back to Assessments
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-slate-100">
      <SEO
        title={`${loaded.title} | Coding Lab Assessment`}
        description="Dedicated full-screen Coding Lab assessment workspace."
      />
      <CodingLabEditorHost
        mode="assessment"
        fullViewport
        assessmentContext={{
          assessmentId: loaded.examId,
          attemptId: loaded.attemptId,
          ownerUid: loaded.ownerUid,
          learnerName: loaded.learnerName,
          schoolId: loaded.schoolId,
          tutorId: loaded.tutorId,
          title: loaded.title,
          subject: loaded.subject,
          instructions: loaded.instructions,
          maxScore: loaded.maxScore,
          durationMinutes: loaded.durationMinutes,
          deadlineAt: loaded.deadlineAt,
          attemptNumber: loaded.attemptNumber,
          maxAttempts: loaded.maxAttempts,
          releaseGradesPolicy: loaded.releaseGradesPolicy,
          codingConfig: loaded.codingConfig,
        }}
        exitLabel="Back to Assessments"
        onExit={() => navigate('/portal/student/exams')}
        onSubmitted={(submission) => {
          setSubmittedRecord(submission);
          setLoaded((prev) =>
            prev
              ? {
                  ...prev,
                  status: submission.gradingStatus === 'graded' ? 'graded' : 'submitted',
                  score: (submission.finalScore ?? submission.automaticScore) ?? prev.score,
                  percentage: submission.percentage ?? prev.percentage,
                  resultReleased: submission.resultReleased,
                  submittedAt: submission.submittedAt,
                }
              : prev
          );
        }}
      />
    </div>
  );
};

export default CodingLabAssessmentPage;
