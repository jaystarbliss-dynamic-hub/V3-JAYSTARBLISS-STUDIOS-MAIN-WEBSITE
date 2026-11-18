import { jsPDF } from 'jspdf';
import {
  JDI_COLORS,
  JDI_INSTITUTION_NAME,
  PDF_LAYOUT,
  formatDocumentRefNo,
  formatPdfCurrency,
  formatShortDateDDMMYY,
  sanitizePdfText,
  loadOfficialWatermarkAsset,
  drawInstitutionalDocumentHeader,
  preparePageBackgroundAndWatermark,
  ensurePdfSpace,
  applyFooterAcrossAllPages,
  drawTranslucentRect,
  drawSectionHeading,
} from './pdf';
import { extractPaymentAmountNaira } from './billing';

export interface TransactionReceiptData {
  id: string;
  reference?: string;
  transactionNo?: string;
  sessionId?: string;
  amount?: number | string;
  baseAmount?: number | string;
  transactionFee?: number | string;
  customerTotal?: number | string;
  fullProgramFee?: number | string;
  paymentPercentage?: number | string;
  remainingBalance?: number | string;
  selectedPrograms?: string;
  plan?: string;
  description?: string;
  paymentPlanName?: string;
  programName?: string;
  programmeName?: string;
  studentName?: string;
  studentId?: string;
  studentNames?: string[] | string;
  studentCount?: number;
  studentsCount?: number;
  payerName?: string;
  userName?: string;
  payerRole?: string;
  userRole?: string;
  payerEmail?: string;
  schoolName?: string;
  schoolId?: string;
  tutorName?: string;
  tutorId?: string;
  channel?: string | null;
  paymentMethod?: string | null;
  status?: string;
  category?: string;
  teachingMode?: string;
  durationWeeks?: number | string;
  paidAt?: Date | string | number | null;
  createdAt?: Date | string | number | { toDate?: () => Date } | null;
  paidThrough?: Date | string | number | null;
  paymentSource?: string;
  type?: 'inflow' | 'outflow' | 'transfer' | 'deposit' | 'payout' | 'tuition';
}

export const formatCurrency = (val: number | string | undefined): string => {
  const num = typeof val === 'number' ? val : Number(val || 0);
  return `₦${num.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const parseDate = (val: any): Date => {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val?.toDate === 'function') return val.toDate();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

export const formatReceiptDate = (date: Date): string => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  const suffix = (d: number) => {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  return `${month} ${day}${suffix(day)}, ${year} ${hours}:${minutes}:${seconds}`;
};

export const getReceiptDetails = (data: Partial<TransactionReceiptData> | any) => {
  if (!data) {
    return {
      displayTitle: 'Tuition Fee - Cadet',
      programName: 'Coding & Technology Programme',
      payerName: 'Customer',
      payerRole: 'Student',
      roleLabel: 'Cadet / Student',
      studentName: '',
      studentList: [] as string[],
      studentCount: 1,
      beneficiary: 'Registered Cadet',
      schoolName: '',
      isMultipleStudents: false,
      isParentPaidForStudent: false,
    };
  }

  let rawProg = String(
    data.programName ||
      data.programmeName ||
      data.plan ||
      data.paymentPlanName ||
      data.description ||
      ''
  ).trim();

  if (
    rawProg.startsWith('Tuition Payment - ') ||
    rawProg.startsWith('Tuition - ') ||
    rawProg.startsWith('Partner School - ')
  ) {
    const parts = rawProg.split(' - ');
    if (parts.length > 1) rawProg = parts.slice(1).join(' - ');
  }
  if (rawProg.toLowerCase() === 'institutional lab fee' && data.schoolName) {
    rawProg = 'Digital Literacy (Entry Level)';
  }
  const programName = rawProg || 'Digital Literacy & Technology Track';

  const rawRole = String(data.payerRole || data.userRole || data.role || '').toLowerCase();
  let payerRole = 'Student';
  let roleLabel = 'Cadet / Student';

  if (
    rawRole.includes('school') ||
    Boolean(data.schoolId) ||
    Boolean(data.schoolName && !data.parentId)
  ) {
    payerRole = 'School';
    roleLabel = 'School / Partner Institution';
  } else if (
    rawRole.includes('parent') ||
    Boolean(data.parentId) ||
    (data.studentName && data.payerName && data.studentName !== data.payerName)
  ) {
    payerRole = 'Parent';
    roleLabel = 'Parent / Guardian';
  } else if (
    rawRole.includes('tutor') ||
    rawRole.includes('staff') ||
    rawRole.includes('instructor')
  ) {
    payerRole = 'Staff';
    roleLabel = 'Staff / Faculty Member';
  } else if (rawRole.includes('admin')) {
    payerRole = 'Admin';
    roleLabel = 'Platform Administrator';
  }

  let payerName = String(
    data.payerName ||
      data.userName ||
      (payerRole === 'School' ? data.schoolName : '') ||
      data.customerName ||
      data.userEmail ||
      data.email ||
      ''
  ).trim();

  if (!payerName) {
    if (payerRole === 'School') payerName = data.schoolName || 'Partner School';
    else if (payerRole === 'Parent') payerName = 'Parent / Guardian';
    else if (data.studentName) payerName = data.studentName;
    else payerName = 'Registered Student';
  }

  let studentNames: string[] = [];
  if (Array.isArray(data.studentNames)) {
    studentNames = data.studentNames.filter(Boolean);
  } else if (typeof data.studentNames === 'string' && data.studentNames.trim()) {
    studentNames = data.studentNames
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
  } else if (data.studentName) {
    studentNames = [data.studentName.trim()];
  }

  const studentCount = Number(
    data.studentCount || data.studentsCount || (studentNames.length > 0 ? studentNames.length : 1)
  );
  const isMultipleStudents = studentCount > 1 || studentNames.length > 1;
  const primaryStudentName = studentNames[0] || data.studentName || '';
  const isParentPaidForStudent = payerRole === 'Parent' && Boolean(primaryStudentName);

  let beneficiary = '';
  if (payerRole === 'School') {
    const sName = data.schoolName || payerName;
    beneficiary = isMultipleStudents
      ? `${sName} (${studentCount} Enrolled Cadets)`
      : `${sName} (Institutional Lab Cohort)`;
  } else if (isParentPaidForStudent) {
    if (isMultipleStudents) {
      beneficiary = `${studentNames.join(', ')} (${studentCount} Cadets) • Paid by Parent: ${payerName}`;
    } else {
      beneficiary = `${primaryStudentName} (Cadet) • Paid by Parent: ${payerName}`;
    }
  } else if (primaryStudentName) {
    beneficiary = `${primaryStudentName} (Direct Cadet Enrollment)`;
  } else {
    beneficiary = `${payerName} (${roleLabel})`;
  }

  let targetEntity = '';
  if (payerRole === 'School') {
    targetEntity = data.schoolName || payerName;
  } else if (isParentPaidForStudent) {
    targetEntity = isMultipleStudents
      ? `${studentNames.join(' & ')} (Parent: ${payerName})`
      : primaryStudentName;
  } else {
    targetEntity = primaryStudentName || payerName;
  }

  const displayTitle = `${programName} - ${targetEntity}`;

  return {
    displayTitle,
    programName,
    payerName,
    payerRole,
    roleLabel,
    studentName: primaryStudentName,
    studentList: studentNames,
    studentCount,
    beneficiary,
    schoolName: data.schoolName || (payerRole === 'School' ? payerName : ''),
    isMultipleStudents,
    isParentPaidForStudent,
  };
};

export async function createPdfReceiptDocument(data: TransactionReceiptData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = PDF_LAYOUT.MARGIN_X;
  const contentWidth = pageWidth - marginX * 2;
  const watermarkAsset = await loadOfficialWatermarkAsset();

  const date = parseDate(data.paidAt || data.createdAt);
  const formattedDate = formatReceiptDate(date);
  const shortDate = formatShortDateDDMMYY(date);
  const reference = sanitizePdfText(
    data.reference || data.id || formatDocumentRefNo('JDI-TXN', String(Date.now()))
  );
  const refNo = formatDocumentRefNo('JDI-RCP', data.reference || data.id);
  const transactionNo = sanitizePdfText(
    data.transactionNo || `TXN-${reference.replace(/[^A-Z0-9]/gi, '').slice(0, 12)}`
  );
  const sessionId = sanitizePdfText(
    data.sessionId || `SES-${refNo.replace(/[^A-Z0-9]/gi, '').slice(-10)}`
  );

  const rawAmount = extractPaymentAmountNaira(data);
  const amountStr = formatPdfCurrency(rawAmount);
  const details = getReceiptDetails(data);
  const statusUpper = String(data.status || 'UNKNOWN').trim().toUpperCase();
  const isPaid = [
    'SUCCESS',
    'SUCCESSFUL',
    'PAID',
    'COMPLETED',
    'APPROVED',
    'CONFIRMED',
    'VERIFIED',
  ].includes(statusUpper);
  const isPartial = ['PARTIALLY_PAID', 'PARTIAL'].includes(statusUpper);
  const isPending = ['PENDING', 'PROCESSING'].includes(statusUpper);

  preparePageBackgroundAndWatermark(doc, watermarkAsset);

  let cursorY = drawInstitutionalDocumentHeader(doc, {
    institutionTitle: JDI_INSTITUTION_NAME,
    subtitleLine: `OFFICIAL ELECTRONIC PAYMENT RECEIPT  |  DATE: ${shortDate}`,
    refNo,
  });

  // Hero Amount Summary Card
  const heroHeight = 36;
  drawTranslucentRect(
    doc,
    marginX,
    cursorY,
    contentWidth,
    heroHeight,
    JDI_COLORS.ICE_BG,
    0.85,
    JDI_COLORS.ICE_BORDER,
    2.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text('RECEIPT FOR:', marginX + 6, cursorY + 7.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.8);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  const titleLines = doc.splitTextToSize(
    sanitizePdfText(details.displayTitle).toUpperCase(),
    contentWidth - 56
  ) as string[];
  doc.text(titleLines.slice(0, 2), marginX + 6, cursorY + 13);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.text(amountStr, marginX + 6, cursorY + 25.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  if (isPaid) {
    doc.setTextColor(...JDI_COLORS.EMERALD_TEXT);
    doc.text('Verified & Reconciled on Jaystarbliss Financial Ledger', marginX + 6, cursorY + 31.8);
  } else if (isPartial) {
    doc.setTextColor(...JDI_COLORS.AMBER_BADGE);
    doc.text('Partially Settled — Remaining Balance Tracked on Ledger', marginX + 6, cursorY + 31.8);
  } else {
    doc.setTextColor(...JDI_COLORS.INK_MUTED);
    doc.text(`Settlement Status: ${statusUpper}`, marginX + 6, cursorY + 31.8);
  }

  // Right Status Badge inside Hero Card
  const badgeColor = isPaid
    ? JDI_COLORS.EMERALD_BADGE
    : isPartial || isPending
    ? JDI_COLORS.AMBER_BADGE
    : JDI_COLORS.CRIMSON_BADGE;
  doc.setFillColor(...badgeColor);
  doc.roundedRect(pageWidth - marginX - 44, cursorY + 8, 38, 9, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...JDI_COLORS.WHITE);
  doc.text(statusUpper.replace(/_/g, ' '), pageWidth - marginX - 25, cursorY + 13.8, {
    align: 'center',
  });

  cursorY += heroHeight + 9;

  cursorY = drawSectionHeading(doc, 'Official Transaction Breakdown', marginX, cursorY, contentWidth);

  const rows: [string, string][] = [
    ['Transaction No.', transactionNo],
    ['Session ID', sessionId],
    ['Payment Reference', reference],
    ['Transaction Date', formattedDate],
    ['Programme / Fee Name', details.programName],
    ...(data.selectedPrograms
      ? [['Selected Program Tracks', String(data.selectedPrograms)] as [string, string]]
      : []),
    ...((data.paymentPercentage && Number(data.paymentPercentage) < 100) ||
    Number(data.remainingBalance || 0) > 0
      ? [
          [
            'Payment Mode / Percentage',
            data.paymentPercentage
              ? `${data.paymentPercentage}% Installment Settlement`
              : 'Partial Settlement',
          ] as [string, string],
          ['Full Invoice Amount', formatPdfCurrency(data.fullProgramFee || data.amount)] as [
            string,
            string,
          ],
          ['Remaining Balance Due', formatPdfCurrency(data.remainingBalance || 0)] as [
            string,
            string,
          ],
        ]
      : []),
    ['Paid By (Payer Name)', details.payerName],
    ['Payer Portal Role', `${details.roleLabel} (${details.payerRole})`],
    ['Beneficiary / Cadet(s)', details.beneficiary],
    ...(details.isMultipleStudents && details.studentList.length > 0
      ? [
          [
            'Enrolled Student List',
            `${details.studentCount} Cadets: ${details.studentList.join(', ')}`,
          ] as [string, string],
        ]
      : []),
    ['Payment Method', (() => {
      const ch = String(data.channel || '').trim();
      const pm = String(data.paymentMethod || '').trim();
      const chosen = ch || pm;
      if (!chosen) return 'Not Recorded';
      if (chosen.toLowerCase() === 'paystack') return 'Paystack Hosted Checkout (Channel Not Recorded)';
      return chosen.replace(/_/g, ' ');
    })()],
    ['Teaching Delivery Mode', data.teachingMode || 'Standard Practical Coding Delivery'],
    ['Duration / Coverage', data.durationWeeks ? `${data.durationWeeks} Weeks` : 'Termly Track'],
    ['Settlement Status', statusUpper],
  ];

  const labelColW = 58;
  const valColW = contentWidth - labelColW - 8;

  rows.forEach(([label, rawVal], idx) => {
    const cleanVal = sanitizePdfText(rawVal || '—');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    const wrappedVal = doc.splitTextToSize(cleanVal, valColW) as string[];
    const rowH = Math.max(8, wrappedVal.length * 4.2 + 3.8);

    cursorY = ensurePdfSpace(doc, cursorY, rowH, refNo, watermarkAsset);

    if (idx % 2 === 1) {
      drawTranslucentRect(doc, marginX, cursorY, contentWidth, rowH, JDI_COLORS.SOFT_TINT, 0.58);
    }
    doc.setDrawColor(...JDI_COLORS.BORDER_LIGHT);
    doc.setLineWidth(0.2);
    doc.line(marginX, cursorY + rowH, marginX + contentWidth, cursorY + rowH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    doc.setTextColor(...JDI_COLORS.INK_MUTED);
    doc.text(sanitizePdfText(label), marginX + 3, cursorY + 5.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...JDI_COLORS.INK_DARK);
    doc.text(wrappedVal, marginX + labelColW, cursorY + 5.2);

    cursorY += rowH;
  });

  cursorY += 7;
  cursorY = ensurePdfSpace(doc, cursorY, 24, refNo, watermarkAsset);

  drawTranslucentRect(
    doc,
    marginX,
    cursorY,
    contentWidth,
    21,
    JDI_COLORS.EMERALD_BG,
    0.84,
    JDI_COLORS.EMERALD_BORDER,
    2.2
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...JDI_COLORS.EMERALD_TEXT);
  doc.text('OFFICIAL VERIFIED DIGITAL STATEMENT', marginX + 5, cursorY + 6.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...JDI_COLORS.INK_BODY);
  doc.text(
    'This receipt was electronically generated by Jaystarbliss Dynamic Institute and serves as official proof',
    marginX + 5,
    cursorY + 12.2
  );
  doc.text(
    'of payment for academic enrollment, curriculum licensing, and student portal verification.',
    marginX + 5,
    cursorY + 16.8
  );

  applyFooterAcrossAllPages(doc);
  return doc;
}

export const generatePdfReceipt = async (data: TransactionReceiptData): Promise<void> => {
  const doc = await createPdfReceiptDocument(data);
  const reference = data.reference || data.id || 'JST-TXN';
  doc.save(`receipt-${reference}.pdf`);
};

export interface StatementExportOptions {
  title?: string;
  periodLabel?: string;
  accountLabel?: string;
  statementId?: string;
}

export async function createPdfStatementDocument(
  transactions: TransactionReceiptData[],
  options?: StatementExportOptions
): Promise<{ doc: jsPDF; exportedCount: number; totalInflow: number; totalOutflow: number }> {
  const list = Array.isArray(transactions) ? transactions : [];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = PDF_LAYOUT.MARGIN_X;
  const contentWidth = pageWidth - marginX * 2;
  const watermarkAsset = await loadOfficialWatermarkAsset();

  const isConfirmedSuccess = (st: unknown) => {
    const norm = String(st ?? '').trim().toUpperCase();
    return [
      'SUCCESS',
      'SUCCESSFUL',
      'PAID',
      'COMPLETED',
      'APPROVED',
      'CONFIRMED',
      'VERIFIED',
      'PARTIALLY_PAID',
      'PARTIAL',
    ].includes(norm);
  };

  let totalInflow = 0;
  let totalOutflow = 0;
  list.forEach((t) => {
    if (!isConfirmedSuccess(t.status)) return;
    const amt = extractPaymentAmountNaira(t);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const isOut = t.type === 'outflow' || t.type === 'payout' || t.type === 'transfer';
    if (isOut) totalOutflow += amt;
    else totalInflow += amt;
  });

  const refNo = formatDocumentRefNo(
    'JDI-STMT',
    options?.statementId || `${options?.periodLabel || ''}:${list.length}`
  );
  const shortDate = formatShortDateDDMMYY(new Date());
  const periodSegment = options?.periodLabel ? `PERIOD: ${options.periodLabel}` : `DATE: ${shortDate}`;
  const docTitleLabel = sanitizePdfText(
    options?.title || 'OFFICIAL ACCOUNT STATEMENT & TRANSACTION LEDGER'
  ).toUpperCase();

  preparePageBackgroundAndWatermark(doc, watermarkAsset);

  let cursorY = drawInstitutionalDocumentHeader(doc, {
    institutionTitle: JDI_INSTITUTION_NAME,
    subtitleLine: `${docTitleLabel}  |  ${periodSegment}`,
    refNo,
  });

  // Summary Cards Row
  const summaryH = 22;
  drawTranslucentRect(
    doc,
    marginX,
    cursorY,
    contentWidth,
    summaryH,
    JDI_COLORS.ICE_BG,
    0.85,
    JDI_COLORS.ICE_BORDER,
    2.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text('TOTAL RECORDS', marginX + 6, cursorY + 7);
  doc.text('VERIFIED INFLOW', marginX + 52, cursorY + 7);
  doc.text('VERIFIED OUTFLOW', marginX + 114, cursorY + 7);

  doc.setFontSize(11.5);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text(String(list.length), marginX + 6, cursorY + 15.5);
  doc.setTextColor(...JDI_COLORS.EMERALD_TEXT);
  doc.text(formatPdfCurrency(totalInflow), marginX + 52, cursorY + 15.5);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.text(formatPdfCurrency(totalOutflow), marginX + 114, cursorY + 15.5);

  cursorY += summaryH + 8;

  const colWidths = [9, 22, 31, 61, 24, 33]; // sum = 180 mm
  const drawTableColumnsHeader = (y: number): number => {
    doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.rect(marginX, y, contentWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(...JDI_COLORS.WHITE);

    let x = marginX;
    doc.text('#', x + 2.2, y + 5.2);
    x += colWidths[0];
    doc.text('DATE', x + 2, y + 5.2);
    x += colWidths[1];
    doc.text('REFERENCE', x + 2, y + 5.2);
    x += colWidths[2];
    doc.text('DESCRIPTION / BENEFICIARY', x + 2, y + 5.2);
    x += colWidths[3];
    doc.text('STATUS', x + 2, y + 5.2);
    doc.text('AMOUNT (NGN)', marginX + contentWidth - 2.5, y + 5.2, { align: 'right' });

    return y + 8;
  };

  cursorY = drawTableColumnsHeader(cursorY);

  list.forEach((item, index) => {
    const d = parseDate(item.paidAt || item.createdAt);
    const shortIsoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    const ref = sanitizePdfText(String(item.reference || item.id || '—')).slice(0, 18);
    const details = getReceiptDetails(item);
    const descClean = sanitizePdfText(details.displayTitle);
    const statusText = sanitizePdfText(String(item.status || 'UNKNOWN').trim().toUpperCase()).slice(
      0,
      16
    );
    const rawAmt = extractPaymentAmountNaira(item);
    const isOut = item.type === 'outflow' || item.type === 'payout' || item.type === 'transfer';
    const amtFormatted = `${isOut ? '-' : '+'}${formatPdfCurrency(rawAmt)}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.3);
    const descLines = doc.splitTextToSize(descClean, colWidths[3] - 4) as string[];
    const rowH = Math.max(7.2, descLines.length * 3.7 + 3.4);

    cursorY = ensurePdfSpace(doc, cursorY, rowH, refNo, watermarkAsset, (freshY) =>
      drawTableColumnsHeader(freshY)
    );

    if (index % 2 === 1) {
      drawTranslucentRect(doc, marginX, cursorY, contentWidth, rowH, JDI_COLORS.SOFT_TINT, 0.55);
    }

    doc.setDrawColor(...JDI_COLORS.BORDER_LIGHT);
    doc.setLineWidth(0.2);
    doc.line(marginX, cursorY + rowH, marginX + contentWidth, cursorY + rowH);

    let x = marginX;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(...JDI_COLORS.INK_MUTED);
    doc.text(String(index + 1), x + 2.2, cursorY + 4.4);
    x += colWidths[0];

    doc.setFont('helvetica', 'normal');
    doc.text(shortIsoDate, x + 2, cursorY + 4.4);
    x += colWidths[1];

    doc.text(ref, x + 2, cursorY + 4.4, { maxWidth: colWidths[2] - 3 });
    x += colWidths[2];

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...JDI_COLORS.INK_DARK);
    doc.text(descLines, x + 2, cursorY + 4.4);
    x += colWidths[3];

    const ok = isConfirmedSuccess(item.status);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(ok ? JDI_COLORS.EMERALD_TEXT : JDI_COLORS.INK_MUTED));
    doc.text(statusText, x + 2, cursorY + 4.4, { maxWidth: colWidths[4] - 3 });

    doc.setTextColor(...(isOut ? JDI_COLORS.NAVY_PRIMARY : JDI_COLORS.EMERALD_TEXT));
    doc.text(amtFormatted, marginX + contentWidth - 2.5, cursorY + 4.4, { align: 'right' });

    cursorY += rowH;
  });

  applyFooterAcrossAllPages(doc);

  return {
    doc,
    exportedCount: list.length,
    totalInflow: Number(totalInflow.toFixed(2)),
    totalOutflow: Number(totalOutflow.toFixed(2)),
  };
}

export const generatePdfStatement = async (
  transactions: TransactionReceiptData[],
  options?: StatementExportOptions
): Promise<{ exportedCount: number; totalInflow: number; totalOutflow: number }> => {
  const { doc, exportedCount, totalInflow, totalOutflow } = await createPdfStatementDocument(
    transactions,
    options
  );
  const dateSlug = new Date().toISOString().slice(0, 10);
  doc.save(`jaystarbliss-statement-${dateSlug}-${exportedCount}-records.pdf`);
  return { exportedCount, totalInflow, totalOutflow };
};
