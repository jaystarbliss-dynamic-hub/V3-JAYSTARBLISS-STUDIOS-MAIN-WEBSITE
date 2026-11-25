import DOMPurify from 'dompurify';

export type OfficialDocumentCategory =
  | 'PERFORMANCE_REPORT'
  | 'COMMUNIQUE'
  | 'PROPOSAL'
  | 'CONTRACT';

export interface DocumentVersionSnapshot {
  versionNumber: number;
  savedAt: string;
  savedByUid: string;
  savedByName: string;
  title: string;
  contentHtml: string;
  note?: string;
}

export interface PerformanceReportStructuredSections {
  subjectOrProgramme?: string;
  reportDate?: string;
  performanceIndicatorsSummary?: string;
  learningObjectivesCovered?: string;
  keyStrengths?: string;
  areasForImprovement?: string;
  tutorObservations?: string;
  recommendationsAndNextSteps?: string;
}

export interface DocumentTemplateContext {
  studentName?: string;
  studentClass?: string;
  programmeName?: string;
  schoolName?: string;
  tutorName?: string;
  parentName?: string;
  recipientName?: string;
  reportingPeriod?: string;
  effectiveDate?: string;
  dateLabel?: string;
  verifiedMetrics?: {
    averageScore?: number | null;
    completedAssessments?: number | null;
    attendanceRate?: number | null;
    assignmentCount?: number | null;
  };
  structuredSections?: PerformanceReportStructuredSections;
}

export const DOCUMENT_CATEGORY_META: Record<
  OfficialDocumentCategory,
  {
    label: string;
    shortLabel: string;
    pdfSubtitle: string;
    refPrefix: string;
    agreementEnum?: 'COMMUNICATION' | 'PROPOSAL' | 'CONTRACT';
  }
> = {
  PERFORMANCE_REPORT: {
    label: 'Performance & Progress Report',
    shortLabel: 'Performance Report',
    pdfSubtitle: 'OFFICIAL STUDENT PERFORMANCE & PROGRESS REPORT',
    refPrefix: 'JDI-RPT',
  },
  COMMUNIQUE: {
    label: 'Official Communiqué',
    shortLabel: 'Communiqué',
    pdfSubtitle: 'OFFICIAL INSTITUTIONAL COMMUNIQUE',
    refPrefix: 'JDI-CMQ',
    agreementEnum: 'COMMUNICATION',
  },
  PROPOSAL: {
    label: 'Partnership / Programme Proposal',
    shortLabel: 'Proposal',
    pdfSubtitle: 'OFFICIAL INSTITUTIONAL PROPOSAL',
    refPrefix: 'JDI-PRP',
    agreementEnum: 'PROPOSAL',
  },
  CONTRACT: {
    label: 'Contract / Partnership Agreement',
    shortLabel: 'Contract / Agreement',
    pdfSubtitle: 'OFFICIAL CONTRACT & PARTNERSHIP AGREEMENT',
    refPrefix: 'JDI-AGR',
    agreementEnum: 'CONTRACT',
  },
};

function stripAccidentalWhiteInlineTextColor(rawHtml: string): string {
  return rawHtml.replace(
    /(style\s*=\s*["'][^"']*?)color\s*:\s*(?:#fff(?:fff)?|white|#f8fafc|#f1f5f9|#fafafa|rgb\(\s*25[0-5]\s*,\s*25[0-5]\s*,\s*25[0-5]\s*\))\s*;?/gi,
    '$1'
  );
}

export function sanitizeDocumentHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  const normalizedHtml = stripAccidentalWhiteInlineTextColor(html);
  if (typeof DOMPurify?.sanitize !== 'function') {
    return normalizedHtml
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '');
  }
  return DOMPurify.sanitize(normalizedHtml, {
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'strike',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'blockquote',
      'hr',
      'span',
      'div',
      'mark',
      'img',
      'a',
    ],
    ALLOWED_ATTR: [
      'style',
      'class',
      'colspan',
      'rowspan',
      'src',
      'alt',
      'width',
      'height',
      'href',
      'target',
      'rel',
      'data-page-break',
      'data-jdi-page-start',
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['data-page-break', 'data-jdi-page-start'],
  });
}

export function extractPlainTextFromHtml(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|tr|blockquote|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<th[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const esc = (value?: string | null, fallback = ''): string => {
  const str = String(value || fallback).trim();
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

function formatLinesToHtmlList(text: string | undefined, ordered: boolean, defaultItems: string[]): string {
  const tag = ordered ? 'ol' : 'ul';
  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•\-*\d.)]+/, '').trim())
    .filter(Boolean);
  const items = rawLines.length > 0 ? rawLines.map((line) => esc(line)) : defaultItems;
  return `<${tag}>${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`;
}

export function buildPerformanceReportTemplate(ctx: DocumentTemplateContext): string {
  const structured = ctx.structuredSections;
  const dateLabel =
    structured?.reportDate ||
    ctx.dateLabel ||
    new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  const studentName = esc(ctx.studentName, '[Learner Full Name]');
  const studentClass = esc(ctx.studentClass, '[Class / Level]');
  const programmeName = esc(structured?.subjectOrProgramme || ctx.programmeName, '[Enrolled Programme]');
  const schoolName = esc(ctx.schoolName, 'Jaystarbliss Dynamic Institute');
  const tutorName = esc(ctx.tutorName, '[Tutor Name]');
  const parentName = esc(ctx.recipientName || ctx.parentName, 'Parent / Guardian');
  const reportingPeriod = esc(ctx.reportingPeriod, 'Current Learning Period');

  const avgText =
    ctx.verifiedMetrics?.averageScore != null
      ? `${Math.round(ctx.verifiedMetrics.averageScore)}% (Verified Portal Record)`
      : '[Enter score or leave blank]';
  const assessmentsText =
    ctx.verifiedMetrics?.completedAssessments != null
      ? `${ctx.verifiedMetrics.completedAssessments} Completed`
      : '[Enter count or leave blank]';
  const attendanceText =
    ctx.verifiedMetrics?.attendanceRate != null
      ? `${Math.round(ctx.verifiedMetrics.attendanceRate)}%`
      : '[Enter attendance observation]';
  const assignmentsText =
    ctx.verifiedMetrics?.assignmentCount != null
      ? `${ctx.verifiedMetrics.assignmentCount} Recorded`
      : '[Enter assignment summary]';

  const executiveSummaryText = structured?.performanceIndicatorsSummary?.trim()
    ? esc(structured.performanceIndicatorsSummary)
    : `Provide a concise overview of ${studentName}&rsquo;s learning trajectory, engagement, and readiness during ${reportingPeriod}.`;

  const learningObjectivesText = structured?.learningObjectivesCovered?.trim()
    ? esc(structured.learningObjectivesCovered)
    : `Outline core skills covered this period and the learner&rsquo;s current mastery level across practical exercises and guided sessions.`;

  const tutorObservationsText = structured?.tutorObservations?.trim()
    ? esc(structured.tutorObservations)
    : `Summarize classroom focus, teamwork, communication, and consistency in completing practical exercises and projects.`;

  const strengthsListHtml = formatLinesToHtmlList(structured?.keyStrengths, false, [
    '[Highlight technical, creative, or collaborative milestones achieved.]',
    '[Note standout project work, curiosity, or leadership in class.]',
  ]);

  const improvementListHtml = formatLinesToHtmlList(structured?.areasForImprovement, false, [
    '[Identify specific concepts or habits needing targeted reinforcement.]',
    '[Explain how upcoming classes will address these focus areas.]',
  ]);

  const recommendationsListHtml = formatLinesToHtmlList(structured?.recommendationsAndNextSteps, true, [
    '[Recommended weekly practice routine or revision activity.]',
    '[How parents/guardians or school coordinators can encourage continued momentum.]',
  ]);

  return sanitizeDocumentHtml(`
    <h1>Student Performance &amp; Progress Report</h1>
    <p>Dear ${parentName}, please find below an official progress update prepared by ${tutorName} on behalf of <strong>Jaystarbliss Dynamic Institute</strong> for <strong>${studentName}</strong>.</p>

    <h2>1. Learner &amp; Programme Details</h2>
    <table>
      <tbody>
        <tr><th>Learner Name</th><td>${studentName}</td><th>Date Issued</th><td>${esc(dateLabel)}</td></tr>
        <tr><th>Class / Level</th><td>${studentClass}</td><th>Reporting Period</th><td>${reportingPeriod}</td></tr>
        <tr><th>Subject / Programme</th><td>${programmeName}</td><th>School / Campus</th><td>${schoolName}</td></tr>
        <tr><th>Prepared By</th><td>${tutorName}</td><th>Authorized Recipient</th><td>${parentName}</td></tr>
      </tbody>
    </table>

    <h2>2. Executive Summary &amp; Performance Indicators</h2>
    <p>${executiveSummaryText}</p>

    <h2>3. Recorded Performance Snapshot</h2>
    <table>
      <thead>
        <tr><th>Indicator</th><th>Current Record / Observation</th><th>Tutor Remarks</th></tr>
      </thead>
      <tbody>
        <tr><td>Assessment Average</td><td>${esc(avgText)}</td><td>Verified academic progress record</td></tr>
        <tr><td>Assessments Completed</td><td>${esc(assessmentsText)}</td><td>Recorded portal assessments</td></tr>
        <tr><td>Assignments &amp; Practicals</td><td>${esc(assignmentsText)}</td><td>Hands-on tasks &amp; classwork</td></tr>
        <tr><td>Attendance &amp; Punctuality</td><td>${esc(attendanceText)}</td><td>Session attendance consistency</td></tr>
      </tbody>
    </table>

    <h2>4. Learning Objectives &amp; Competencies Covered</h2>
    <p>${learningObjectivesText}</p>

    <h2>5. Key Strengths &amp; Achievements</h2>
    ${strengthsListHtml}

    <h2>6. Areas for Growth &amp; Targeted Improvement</h2>
    ${improvementListHtml}

    <h2>7. Tutor Observations, Conduct &amp; Practical Engagement</h2>
    <p>${tutorObservationsText}</p>

    <h2>8. Action Plan &amp; Support Recommendations</h2>
    ${recommendationsListHtml}

    <h2>9. Tutor Sign-Off</h2>
    <p><strong>${tutorName}</strong><br/>Faculty Tutor, Jaystarbliss Dynamic Institute<br/>Date: ${esc(dateLabel)}</p>
  `);
}

export function buildCommuniqueTemplate(ctx: DocumentTemplateContext): string {
  const dateLabel =
    ctx.dateLabel ||
    new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  const recipient = esc(ctx.recipientName || ctx.schoolName, 'Valued Partner / Parent Community');
  const sender = esc(ctx.tutorName, 'Office of the Academic Director');

  return sanitizeDocumentHtml(`
    <h1>Official Institutional Communiqué</h1>
    <p><strong>Date:</strong> ${esc(dateLabel)}<br/><strong>To:</strong> ${recipient}<br/><strong>From:</strong> ${sender}, Jaystarbliss Dynamic Institute</p>
    <h2>Subject Overview</h2>
    <p>We write to share an important update regarding our academic programmes, schedule adjustments, and upcoming institutional milestones.</p>
    <h2>Key Highlights &amp; Action Items</h2>
    <ul>
      <li>[Key point 1 — date, requirement, or operational update]</li>
      <li>[Key point 2 — support contact or deadline]</li>
      <li>[Key point 3 — next steps for recipients]</li>
    </ul>
    <h2>Schedule / Reference Details</h2>
    <table>
      <thead>
        <tr><th>Item</th><th>Effective Date</th><th>Responsible Party</th></tr>
      </thead>
      <tbody>
        <tr><td>[Activity / Notice Item]</td><td>${esc(ctx.effectiveDate || dateLabel)}</td><td>Jaystarbliss Dynamic Institute</td></tr>
      </tbody>
    </table>
    <p>Thank you for your continued partnership and commitment to excellence.</p>
    <p><strong>${sender}</strong><br/>Jaystarbliss Dynamic Institute</p>
  `);
}

export function buildProposalTemplate(ctx: DocumentTemplateContext): string {
  const recipient = esc(ctx.recipientName || ctx.schoolName, '[Partner Institution Name]');
  const dateLabel =
    ctx.dateLabel ||
    new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

  return sanitizeDocumentHtml(`
    <h1>Institutional Programme Partnership Proposal</h1>
    <p><strong>Prepared For:</strong> ${recipient}<br/><strong>Prepared By:</strong> Jaystarbliss Dynamic Institute<br/><strong>Date:</strong> ${esc(dateLabel)}</p>
    <h2>1. Executive Overview</h2>
    <p>Jaystarbliss Dynamic Institute proposes a structured academic partnership designed to deliver future-ready instruction across our four core schools: Technology &amp; Programming, Digital Literacy, Creative Design, and Music &amp; Performing Arts.</p>
    <h2>2. Proposed Core Programmes &amp; Delivery Model</h2>
    <table>
      <thead>
        <tr><th>Core Programme</th><th>Target Classes</th><th>Delivery Schedule</th></tr>
      </thead>
      <tbody>
        <tr><td>School of Technology &amp; Programming</td><td>[Specify classes]</td><td>[Weekly sessions]</td></tr>
        <tr><td>School of Digital Literacy</td><td>[Specify classes]</td><td>[Weekly sessions]</td></tr>
      </tbody>
    </table>
    <h2>3. Institutional Support &amp; Assessment Framework</h2>
    <ul>
      <li>Dedicated JDI faculty tutors and structured curriculum resources.</li>
      <li>Digital portal tracking for assessments, attendance, and parent progress reports.</li>
      <li>Termly showcase projects and verifiable performance reporting.</li>
    </ul>
    <h2>4. Commercial Terms &amp; Next Steps</h2>
    <p>[Outline fee structure, billing cycle, onboarding timeline, and sign-off instructions.]</p>
  `);
}

export function buildContractTemplate(ctx: DocumentTemplateContext): string {
  const recipient = esc(ctx.recipientName || ctx.schoolName, '[Counterparty / Partner School Name]');
  const effectiveDate = esc(
    ctx.effectiveDate ||
      new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
  );

  return sanitizeDocumentHtml(`
    <h1>Memorandum of Understanding &amp; Partnership Agreement</h1>
    <p>This Agreement is entered into effective <strong>${effectiveDate}</strong> between <strong>Jaystarbliss Dynamic Institute</strong> (&ldquo;Provider&rdquo;) and <strong>${recipient}</strong> (&ldquo;Partner&rdquo;).</p>
    <h2>1. Scope of Academic Services</h2>
    <p>The Provider agrees to deliver structured curriculum instruction, faculty deployment, digital assessment tools, and official learner performance reporting for agreed cohorts.</p>
    <h2>2. Partner Responsibilities</h2>
    <ul>
      <li>Provide scheduled instructional periods and safe classroom/lab access.</li>
      <li>Maintain accurate enrolled learner rosters inside the JDI Partner Portal.</li>
      <li>Honor agreed termly or monthly billing invoices within stated payment windows.</li>
    </ul>
    <h2>3. Term, Fees &amp; Renewal</h2>
    <table>
      <thead>
        <tr><th>Clause</th><th>Agreed Specification</th></tr>
      </thead>
      <tbody>
        <tr><td>Effective Date</td><td>${effectiveDate}</td></tr>
        <tr><td>Billing Cycle</td><td>[Termly / Monthly]</td></tr>
        <tr><td>Notice Period</td><td>[30 Days Written Notice]</td></tr>
      </tbody>
    </table>
    <h2>4. Confidentiality &amp; Data Protection</h2>
    <p>Both parties shall safeguard learner records, credentials, and financial data in accordance with institutional privacy standards.</p>
    <h2>5. Electronic Execution</h2>
    <p>Acknowledgment of this document inside the Jaystarbliss Agreements Center constitutes binding institutional acceptance by authorized representatives.</p>
  `);
}

export function buildTemplateForCategory(
  category: OfficialDocumentCategory,
  ctx: DocumentTemplateContext
): string {
  switch (category) {
    case 'PERFORMANCE_REPORT':
      return buildPerformanceReportTemplate(ctx);
    case 'COMMUNIQUE':
      return buildCommuniqueTemplate(ctx);
    case 'PROPOSAL':
      return buildProposalTemplate(ctx);
    case 'CONTRACT':
      return buildContractTemplate(ctx);
  }
}
