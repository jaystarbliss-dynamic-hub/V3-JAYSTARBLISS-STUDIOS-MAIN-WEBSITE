import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Download,
  History,
  CheckCircle2,
  MessageSquare,
  Calendar,
  Building2,
  UserCheck,
  Users,
  Search,
  Edit3,
  Eye,
  Clock,
  ShieldCheck,
  ExternalLink,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { auth, db } from '../../lib/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { TableSkeleton } from '../../components/ui/Skeleton';
import {
  AGREEMENT_CATEGORIES,
  AGREEMENT_STATUSES,
  type AgreementCategory,
  type AgreementStatus,
  canAccessAgreement,
  createAgreementVersionSnapshot,
  resolvePartnerSchoolName,
} from '../../lib/classes';

interface AgreementsCenterProps {
  role?: 'admin' | 'staff' | 'parent' | 'school';
}

interface AgreementVersion {
  versionNumber: number;
  title: string;
  category: AgreementCategory;
  status: AgreementStatus;
  contentHtml: string;
  effectiveDate?: string;
  expiryDate?: string;
  attachmentUrl?: string;
  summary?: string;
  createdAt: string;
  createdBy?: string;
  createdByName?: string;
}

interface AgreementRecord {
  id: string;
  title: string;
  category: AgreementCategory;
  status: AgreementStatus;
  recipientType: 'SCHOOL' | 'TUTOR' | 'PARENT';
  recipientId: string;
  recipientSchoolId?: string;
  recipientName: string;
  contentHtml: string;
  effectiveDate?: string;
  expiryDate?: string;
  attachmentUrl?: string;
  recipientNotes?: string;
  acknowledgedAt?: string;
  acknowledgedByName?: string;
  currentVersion?: number;
  versions?: AgreementVersion[];
  auditLog?: Array<{
    action: string;
    actorName?: string;
    actorRole?: string;
    note?: string;
    timestamp: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

interface RecipientOption {
  id: string;
  schoolId?: string;
  name: string;
  type: 'SCHOOL' | 'TUTOR' | 'PARENT';
  subtitle: string;
}

const CATEGORY_TABS: Array<{ id: 'ALL' | AgreementCategory; label: string }> = [
  { id: 'ALL', label: 'All documents' },
  { id: 'PROPOSAL', label: 'Proposals' },
  { id: 'COMMUNICATION', label: 'Communications' },
  { id: 'CONTRACT', label: 'Contracts / Agreements' },
];

function stripHtmlForPdf(raw: string): string {
  return String(raw || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function statusBadgeStyle(status: string): string {
  const s = String(status || '').toUpperCase();
  if (s === 'ACTIVE' || s === 'SIGNED' || s === 'AGREED') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
  }
  if (s === 'SHARED' || s === 'UNDER_DISCUSSION') {
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60';
  }
  if (s === 'REVISION_REQUESTED' || s === 'EXPIRED') {
    return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
}

const AgreementsCenter: React.FC<AgreementsCenterProps> = ({ role = 'staff' }) => {
  const { toast } = useToast();
  const isAdmin = role === 'admin';

  const [records, setRecords] = useState<AgreementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'ALL' | AgreementCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [selectedAgreement, setSelectedAgreement] = useState<AgreementRecord | null>(null);
  const [selectedVersionNum, setSelectedVersionNum] = useState<number | null>(null);
  const [responseNote, setResponseNote] = useState('');
  const [responding, setResponding] = useState(false);

  // Admin authoring state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<AgreementCategory>('PROPOSAL');
  const [status, setStatus] = useState<AgreementStatus>('SHARED');
  const [recipientType, setRecipientType] = useState<'SCHOOL' | 'TUTOR' | 'PARENT'>('SCHOOL');
  const [recipientId, setRecipientId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [versionSummary, setVersionSummary] = useState('');
  const [saving, setSaving] = useState(false);

  const [recipientOptions, setRecipientOptions] = useState<RecipientOption[]>([]);

  const actor = useMemo(() => {
    const uid = sessionStorage.getItem('userId') || auth.currentUser?.uid || '';
    const schoolId = sessionStorage.getItem('schoolId') || '';
    const name =
      sessionStorage.getItem('schoolName') ||
      sessionStorage.getItem('userName') ||
      auth.currentUser?.displayName ||
      auth.currentUser?.email ||
      'Portal User';
    const mappedRole =
      role === 'admin'
        ? 'SUPER_ADMIN'
        : role === 'school'
        ? 'SCHOOL'
        : role === 'parent'
        ? 'PARENT'
        : 'TUTOR';
    return { uid, schoolId, name, role: mappedRole };
  }, [role]);

  const loadAgreements = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => '');
      if (token) {
        const res = await fetch('/.netlify/functions/agreements', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.records) && !data.fallback) {
            setRecords(data.records);
            setLoading(false);
            return;
          }
        }
      }
    } catch {
      // Fallback to scoped Firestore query
    }

    try {
      const snap = await getDocs(collection(db, 'agreements'));
      const list = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) } as AgreementRecord))
        .filter(item => canAccessAgreement(item, actor))
        .sort((a, b) =>
          String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
        );
      setRecords(list);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRecipientsForAdmin = async () => {
    if (!isAdmin) return;
    try {
      const [schoolsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'schools')),
        getDocs(collection(db, 'users')),
      ]);

      const options: RecipientOption[] = [];
      const seenIds = new Set<string>();

      schoolsSnap.docs.forEach(d => {
        const data = d.data() as any;
        const name = resolvePartnerSchoolName(data.schoolName, data.name, data.institutionName);
        if (!name) return;
        const id = String(data.adminUid || d.id);
        seenIds.add(d.id);
        options.push({
          id,
          schoolId: d.id,
          name,
          type: 'SCHOOL',
          subtitle: `Partner School • ${data.email || d.id}`,
        });
      });

      usersSnap.docs.forEach(d => {
        const data = d.data() as any;
        const uRole = String(data.role || '').toUpperCase();
        const name = String(data.fullName || data.name || data.displayName || data.email || '').trim();
        if (!name) return;

        if (['TUTOR', 'STAFF', 'INSTRUCTOR', 'MNO_TUTOR'].includes(uRole)) {
          options.push({
            id: d.id,
            name,
            type: 'TUTOR',
            subtitle: `Tutor • ${data.email || d.id}`,
          });
        } else if (uRole === 'PARENT') {
          options.push({
            id: d.id,
            name,
            type: 'PARENT',
            subtitle: `Parent • ${data.email || d.id}`,
          });
        } else if (['SCHOOL', 'SCHOOL_ADMIN'].includes(uRole) && !seenIds.has(data.schoolId || d.id)) {
          const sName = resolvePartnerSchoolName(data.schoolName, data.institutionName, name) || name;
          options.push({
            id: d.id,
            schoolId: String(data.schoolId || d.id),
            name: sName,
            type: 'SCHOOL',
            subtitle: `Partner School • ${data.email || d.id}`,
          });
        }
      });

      setRecipientOptions(options);
    } catch {
      // Ignore recipient load error in restricted mode
    }
  };

  useEffect(() => {
    void loadAgreements();
    void loadRecipientsForAdmin();
  }, [role]);

  const filteredRecords = useMemo(() => {
    return records.filter(item => {
      if (activeCategory !== 'ALL' && item.category !== activeCategory) return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = String(item.title || '').toLowerCase().includes(q);
        const matchRecipient = String(item.recipientName || '').toLowerCase().includes(q);
        const matchContent = String(item.contentHtml || '').toLowerCase().includes(q);
        if (!matchTitle && !matchRecipient && !matchContent) return false;
      }
      return true;
    });
  }, [records, activeCategory, statusFilter, searchQuery]);

  const activeVersion = useMemo(() => {
    if (!selectedAgreement) return null;
    const versions = Array.isArray(selectedAgreement.versions) ? selectedAgreement.versions : [];
    if (selectedVersionNum !== null) {
      const found = versions.find(v => v.versionNumber === selectedVersionNum);
      if (found) return found;
    }
    if (versions.length > 0) {
      return versions[versions.length - 1];
    }
    return {
      versionNumber: 1,
      title: selectedAgreement.title,
      category: selectedAgreement.category,
      status: selectedAgreement.status,
      contentHtml: selectedAgreement.contentHtml,
      effectiveDate: selectedAgreement.effectiveDate,
      expiryDate: selectedAgreement.expiryDate,
      attachmentUrl: selectedAgreement.attachmentUrl,
      summary: 'Initial version',
      createdAt: selectedAgreement.updatedAt || selectedAgreement.createdAt || new Date().toISOString(),
    };
  }, [selectedAgreement, selectedVersionNum]);

  const handleDownloadPdf = (agreement: AgreementRecord, versionOverride?: AgreementVersion | null) => {
    const ver = versionOverride || activeVersion;
    const docPdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = docPdf.internal.pageSize.getWidth();
    const margin = 48;
    let y = 56;

    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(10);
    docPdf.setTextColor(185, 28, 28);
    docPdf.text(
      `JAYSTARBLISS DYNAMIC INSTITUTE • OFFICIAL ${String(ver?.category || agreement.category)}`,
      margin,
      y
    );
    y += 22;

    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(16);
    docPdf.setTextColor(20, 40, 75);
    const titleLines = docPdf.splitTextToSize(String(ver?.title || agreement.title), pageWidth - margin * 2);
    docPdf.text(titleLines, margin, y);
    y += titleLines.length * 20 + 8;

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(10);
    docPdf.setTextColor(100, 116, 139);
    docPdf.text(
      `Recipient: ${agreement.recipientName || agreement.recipientType}   |   Status: ${ver?.status || agreement.status}   |   Version: v${ver?.versionNumber || 1}`,
      margin,
      y
    );
    y += 16;

    if (ver?.effectiveDate || ver?.expiryDate) {
      docPdf.text(
        `Effective Date: ${ver?.effectiveDate || 'Not specified'}   |   Expiry Date: ${ver?.expiryDate || 'Ongoing'}`,
        margin,
        y
      );
      y += 18;
    }

    docPdf.setDrawColor(226, 232, 240);
    docPdf.line(margin, y, pageWidth - margin, y);
    y += 22;

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(11);
    docPdf.setTextColor(30, 41, 59);
    const bodyText = stripHtmlForPdf(ver?.contentHtml || agreement.contentHtml || '');
    const bodyLines = docPdf.splitTextToSize(bodyText || 'No content provided.', pageWidth - margin * 2);

    for (const line of bodyLines) {
      if (y > 760) {
        docPdf.addPage();
        y = 56;
      }
      docPdf.text(line, margin, y);
      y += 16;
    }

    if (agreement.acknowledgedAt) {
      if (y > 720) {
        docPdf.addPage();
        y = 56;
      }
      y += 20;
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(10);
      docPdf.setTextColor(16, 185, 129);
      docPdf.text(
        `Acknowledged by ${agreement.acknowledgedByName || agreement.recipientName} on ${new Date(
          agreement.acknowledgedAt
        ).toLocaleString()}`,
        margin,
        y
      );
    }

    const safeFile = String(ver?.title || agreement.title || 'agreement')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    docPdf.save(`${safeFile}-v${ver?.versionNumber || 1}.pdf`);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setTitle('');
    setCategory(activeCategory === 'ALL' ? 'PROPOSAL' : activeCategory);
    setStatus('SHARED');
    setRecipientType('SCHOOL');
    setRecipientId('');
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setExpiryDate('');
    setAttachmentUrl('');
    setContentHtml('');
    setVersionSummary('Initial release');
    setEditorOpen(true);
  };

  const openEditModal = (rec: AgreementRecord) => {
    setEditingId(rec.id);
    setTitle(rec.title);
    setCategory(rec.category);
    setStatus(rec.status);
    setRecipientType(rec.recipientType);
    setRecipientId(rec.recipientId || rec.recipientSchoolId || '');
    setEffectiveDate(rec.effectiveDate || '');
    setExpiryDate(rec.expiryDate || '');
    setAttachmentUrl(rec.attachmentUrl || '');
    setContentHtml(rec.contentHtml || '');
    setVersionSummary(`Updated to ${rec.status}`);
    setEditorOpen(true);
  };

  const handleSaveAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Enter an agreement title.');
      return;
    }
    if (!recipientId.trim()) {
      toast.error('Select a recipient.');
      return;
    }

    const matchedOption = recipientOptions.find(
      o => o.id === recipientId || (o.schoolId && o.schoolId === recipientId)
    );
    const resolvedRecipientName = matchedOption?.name || recipientId;
    const resolvedSchoolId =
      recipientType === 'SCHOOL' ? matchedOption?.schoolId || recipientId : '';

    setSaving(true);
    try {
      const payload = {
        id: editingId || undefined,
        title: title.trim(),
        category,
        status,
        recipientType,
        recipientId: matchedOption?.id || recipientId,
        recipientSchoolId: resolvedSchoolId,
        recipientName: resolvedRecipientName,
        contentHtml: contentHtml.trim(),
        effectiveDate,
        expiryDate,
        attachmentUrl: attachmentUrl.trim(),
        versionSummary: versionSummary.trim() || `Saved as ${status}`,
        createNewVersion: true,
      };

      const token = await auth.currentUser?.getIdToken().catch(() => '');
      let savedViaApi = false;
      if (token) {
        const res = await fetch('/.netlify/functions/agreements', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.agreement) {
            savedViaApi = true;
          }
        }
      }

      if (!savedViaApi) {
        const existingRec = records.find(r => r.id === editingId);
        const nowIso = new Date().toISOString();
        const existingVersions = Array.isArray(existingRec?.versions) ? existingRec!.versions! : [];
        const snapshot = createAgreementVersionSnapshot(
          { ...existingRec, ...payload },
          { uid: actor.uid, name: actor.name }
        );
        const docRef = editingId
          ? doc(db, 'agreements', editingId)
          : doc(collection(db, 'agreements'));

        const firestorePayload = {
          title: payload.title,
          category: payload.category,
          status: payload.status,
          recipientType: payload.recipientType,
          recipientId: payload.recipientId,
          recipientSchoolId: payload.recipientSchoolId,
          recipientName: payload.recipientName,
          contentHtml: payload.contentHtml,
          effectiveDate: payload.effectiveDate,
          expiryDate: payload.expiryDate,
          attachmentUrl: payload.attachmentUrl,
          versions: [...existingVersions, snapshot],
          currentVersion: existingVersions.length + 1,
          auditLog: [
            ...(Array.isArray(existingRec?.auditLog) ? existingRec!.auditLog! : []),
            {
              action: editingId ? `UPDATED_${status}` : `CREATED_${status}`,
              actorName: actor.name,
              actorRole: actor.role,
              note: payload.versionSummary,
              timestamp: nowIso,
            },
          ],
          createdAt: existingRec?.createdAt || nowIso,
          updatedAt: nowIso,
        };

        await setDoc(docRef, firestorePayload, { merge: true });

        if (status !== 'DRAFT' && payload.recipientId) {
          await addDoc(collection(db, 'notifications'), {
            recipientId: payload.recipientId,
            type: 'agreement_published',
            title: `New ${category.toLowerCase()}: ${payload.title}`,
            message: `An official ${category.toLowerCase()} has been shared with you in the Agreements Centre.`,
            link:
              recipientType === 'SCHOOL'
                ? '/portal/school/agreements'
                : recipientType === 'PARENT'
                ? '/portal/parent/agreements'
                : '/portal/staff/agreements',
            timestamp: serverTimestamp(),
            read: false,
          }).catch(() => undefined);
        }
      }

      toast.success(editingId ? 'Agreement updated with new version snapshot.' : 'Agreement published.');
      setEditorOpen(false);
      await loadAgreements();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to save agreement.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecipientAction = async (
    agreement: AgreementRecord,
    nextStatus: 'UNDER_DISCUSSION' | 'REVISION_REQUESTED' | 'AGREED' | 'SIGNED'
  ) => {
    setResponding(true);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => '');
      let updatedRecord: AgreementRecord | null = null;

      if (token) {
        const res = await fetch('/.netlify/functions/agreements', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'RECIPIENT_RESPONSE',
            id: agreement.id,
            status: nextStatus,
            note: responseNote.trim(),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.agreement) updatedRecord = data.agreement;
        }
      }

      if (!updatedRecord) {
        const nowIso = new Date().toISOString();
        const auditEntry = {
          action: `RECIPIENT_${nextStatus}`,
          actorName: actor.name,
          actorRole: actor.role,
          note: responseNote.trim(),
          timestamp: nowIso,
        };
        const updateData: Record<string, any> = {
          status: nextStatus,
          recipientNotes: responseNote.trim() || agreement.recipientNotes || '',
          updatedAt: nowIso,
          auditLog: [...(Array.isArray(agreement.auditLog) ? agreement.auditLog : []), auditEntry],
        };
        if (nextStatus === 'AGREED' || nextStatus === 'SIGNED') {
          updateData.acknowledgedAt = nowIso;
          updateData.acknowledgedBy = actor.uid;
          updateData.acknowledgedByName = actor.name;
        }
        await setDoc(doc(db, 'agreements', agreement.id), updateData, { merge: true });
        updatedRecord = { ...agreement, ...updateData };
      }

      toast.success(
        nextStatus === 'AGREED' || nextStatus === 'SIGNED'
          ? 'Agreement formally acknowledged and recorded.'
          : 'Your response has been recorded on this agreement.'
      );
      setResponseNote('');
      setSelectedAgreement(updatedRecord);
      await loadAgreements();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to submit response.');
    } finally {
      setResponding(false);
    }
  };

  const filteredRecipientOptions = useMemo(() => {
    return recipientOptions.filter(o => o.type === recipientType);
  }, [recipientOptions, recipientType]);

  return (
    <div className="space-y-6">
      {/* Top Action & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAdmin
              ? 'Author, version, and manage proposals, recorded communications, and active contracts for partner schools, tutors, and families.'
              : 'Review official proposals, recorded communications, and active agreements applicable to your account.'}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-bold transition-colors shrink-0 cursor-pointer"
          >
            <Plus size={15} /> Create Agreement / Proposal
          </button>
        )}
      </div>

      {/* Clean Programs-page style horizontal category tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800">
        <div
          role="tablist"
          aria-label="Agreement categories"
          className="flex items-center gap-6 overflow-x-auto no-scrollbar touch-pan-x"
        >
          {CATEGORY_TABS.map(tab => {
            const active = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={`relative pb-3 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'text-[#14284B] dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pb-2 sm:pb-0">
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search title or recipient..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="ALL">All statuses</option>
            {AGREEMENT_STATUSES.map(s => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content Split: List Table + Document Reader */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Agreements List */}
        <div className={selectedAgreement ? 'lg:col-span-5' : 'lg:col-span-12'}>
          {loading ? (
            <TableSkeleton rows={4} columns={3} />
          ) : filteredRecords.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
              <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                No agreements or proposals found
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isAdmin
                  ? 'Use "Create Agreement / Proposal" above to publish a proposal, communication record, or contract.'
                  : 'When Jaystarbliss shares a proposal, communication summary, or contract with your account, it will appear here.'}
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
              {filteredRecords.map(rec => {
                const isSelected = selectedAgreement?.id === rec.id;
                const vCount = Array.isArray(rec.versions) ? rec.versions.length : rec.currentVersion || 1;
                return (
                  <div
                    key={rec.id}
                    onClick={() => {
                      setSelectedAgreement(rec);
                      setSelectedVersionNum(null);
                    }}
                    className={`p-4 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#B91C1C] dark:text-red-400">
                            {rec.category}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${statusBadgeStyle(
                              rec.status
                            )}`}
                          >
                            {rec.status.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">v{vCount}</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1 truncate">
                          {rec.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          Recipient: <span className="font-medium text-slate-700 dark:text-slate-300">{rec.recipientName || rec.recipientId}</span> ({rec.recipientType})
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(rec)}
                          title="Download PDF"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Download size={15} />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => openEditModal(rec)}
                            title="Edit / Publish New Version"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Edit3 size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-2.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                      {rec.effectiveDate && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={12} /> Effective: {rec.effectiveDate}
                        </span>
                      )}
                      {rec.expiryDate && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} /> Expires: {rec.expiryDate}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Document Reader & Version History */}
        {selectedAgreement && (
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#B91C1C] dark:text-red-400">
                    {activeVersion?.category || selectedAgreement.category}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${statusBadgeStyle(
                      activeVersion?.status || selectedAgreement.status
                    )}`}
                  >
                    {(activeVersion?.status || selectedAgreement.status).replace(/_/g, ' ')}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {activeVersion?.title || selectedAgreement.title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Recipient: <strong className="text-slate-700 dark:text-slate-200">{selectedAgreement.recipientName}</strong> • Effective:{' '}
                  {activeVersion?.effectiveDate || selectedAgreement.effectiveDate || 'Upon publication'}
                  {(activeVersion?.expiryDate || selectedAgreement.expiryDate)
                    ? ` → ${activeVersion?.expiryDate || selectedAgreement.expiryDate}`
                    : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(selectedAgreement, activeVersion)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold cursor-pointer"
                >
                  <Download size={14} /> Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAgreement(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                  aria-label="Close document reader"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Immutable Version Selector */}
            {Array.isArray(selectedAgreement.versions) && selectedAgreement.versions.length > 1 && (
              <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700">
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <History size={14} className="text-blue-600 dark:text-blue-400" />
                  <span className="font-semibold">Immutable Version History:</span>
                </div>
                <select
                  aria-label="Select agreement version"
                  value={activeVersion?.versionNumber || selectedAgreement.versions.length}
                  onChange={e => setSelectedVersionNum(Number(e.target.value))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100"
                >
                  {selectedAgreement.versions.map(v => (
                    <option key={v.versionNumber} value={v.versionNumber}>
                      Version {v.versionNumber} ({v.status}) — {new Date(v.createdAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Authoritative Agreement Body */}
            <div className="prose prose-sm dark:prose-invert max-w-none bg-slate-50/60 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 sm:p-5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {stripHtmlForPdf(activeVersion?.contentHtml || selectedAgreement.contentHtml) ||
                'No text content recorded for this version.'}
            </div>

            {activeVersion?.attachmentUrl && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/50 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  Supporting Attachment Included
                </span>
                <a
                  href={activeVersion.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Open Attachment <ExternalLink size={13} />
                </a>
              </div>
            )}

            {/* Recipient Formal Acknowledgement & Discussion Box */}
            {!isAdmin && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Recipient Acknowledgement & Discussion
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Opening or downloading this document does not automatically mark it as accepted. Use the controls below to record discussion notes or formally acknowledge the terms.
                </p>
                <textarea
                  rows={2}
                  value={responseNote}
                  onChange={e => setResponseNote(e.target.value)}
                  placeholder="Optional discussion note, clarification, or revision request..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => handleRecipientAction(selectedAgreement, 'AGREED')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} /> Acknowledge & Agree
                  </button>
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => handleRecipientAction(selectedAgreement, 'UNDER_DISCUSSION')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
                  >
                    <MessageSquare size={14} /> Mark Under Discussion
                  </button>
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => handleRecipientAction(selectedAgreement, 'REVISION_REQUESTED')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Request Revision
                  </button>
                </div>
              </div>
            )}

            {/* Audit Trail */}
            {Array.isArray(selectedAgreement.auditLog) && selectedAgreement.auditLog.length > 0 && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Audit & Lifecycle History
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto text-[11px] text-slate-600 dark:text-slate-400">
                  {selectedAgreement.auditLog.map((entry, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                      <span>
                        <strong className="text-slate-800 dark:text-slate-200">{entry.action.replace(/_/g, ' ')}</strong> by {entry.actorName || 'User'}
                        {entry.note ? ` — "${entry.note}"` : ''}
                      </span>
                      <span className="text-slate-400 shrink-0">
                        {new Date(entry.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin Authoring Modal */}
      {isAdmin && editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {editingId ? 'Update Agreement (Creates Immutable Version)' : 'Create Agreement, Proposal or Communication'}
              </h2>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAgreement} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as AgreementCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {AGREEMENT_CATEGORIES.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Lifecycle Status
                  </label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as AgreementStatus)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {AGREEMENT_STATUSES.map(s => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Recipient Type
                  </label>
                  <select
                    value={recipientType}
                    onChange={e => {
                      setRecipientType(e.target.value as 'SCHOOL' | 'TUTOR' | 'PARENT');
                      setRecipientId('');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="SCHOOL">Partner School</option>
                    <option value="TUTOR">Tutor / Staff</option>
                    <option value="PARENT">Parent / Family</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Select Authorised Recipient
                </label>
                {filteredRecipientOptions.length > 0 ? (
                  <select
                    value={recipientId}
                    onChange={e => setRecipientId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="">-- Choose {recipientType.toLowerCase()} --</option>
                    {filteredRecipientOptions.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.subtitle})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={recipientId}
                    onChange={e => setRecipientId(e.target.value)}
                    placeholder="Enter recipient ID or school ID"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g., 2026/2027 Partner School STEM & Robotics Delivery Agreement"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Effective / Start Date
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={e => setEffectiveDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Expiry / End Date
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={e => setExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Supporting File URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={attachmentUrl}
                    onChange={e => setAttachmentUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Agreement / Proposal / Communication Content
                </label>
                <textarea
                  rows={8}
                  required
                  value={contentHtml}
                  onChange={e => setContentHtml(e.target.value)}
                  placeholder="Paste or author the full proposal, recorded communication outcomes, or contract terms here..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-sans leading-relaxed"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Version Change Summary
                </label>
                <input
                  type="text"
                  value={versionSummary}
                  onChange={e => setVersionSummary(e.target.value)}
                  placeholder="e.g., Added Term 2 schedule clauses and updated tuition split"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving Version…' : editingId ? 'Publish New Version' : 'Publish Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgreementsCenter;
