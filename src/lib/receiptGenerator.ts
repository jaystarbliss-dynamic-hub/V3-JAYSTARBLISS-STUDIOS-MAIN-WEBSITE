import jsPDF from 'jspdf';

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
  paymentMethod?: string;
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

/**
 * Normalizes and formats the full receipt details
 * ensuring: "PROGRAMME FEE NAME" - "USERNAME"
 * and extracting detailed user role, payer name, beneficiary, and multi-student details.
 */
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
      isParentPaidForStudent: false
    };
  }

  // 1. Resolve Programme Name
  let rawProg = String(
    data.programName || 
    data.programmeName || 
    data.plan || 
    data.paymentPlanName || 
    data.description || 
    ''
  ).trim();

  // Clean out legacy generic prefixes if a dash is present
  if (rawProg.startsWith('Tuition Payment - ') || rawProg.startsWith('Tuition - ') || rawProg.startsWith('Partner School - ')) {
    const parts = rawProg.split(' - ');
    if (parts.length > 1) rawProg = parts.slice(1).join(' - ');
  }
  if (rawProg.toLowerCase() === 'institutional lab fee' && data.schoolName) {
    rawProg = 'Digital Literacy (Entry Level)';
  }
  const programName = rawProg || 'Digital Literacy & Technology Track';

  // 2. Resolve Role
  const rawRole = String(data.payerRole || data.userRole || data.role || '').toLowerCase();
  let payerRole = 'Student';
  let roleLabel = 'Cadet / Student';

  if (rawRole.includes('school') || Boolean(data.schoolId) || Boolean(data.schoolName && !data.parentId)) {
    payerRole = 'School';
    roleLabel = 'School / Partner Institution';
  } else if (rawRole.includes('parent') || Boolean(data.parentId) || (data.studentName && data.payerName && data.studentName !== data.payerName)) {
    payerRole = 'Parent';
    roleLabel = 'Parent / Guardian';
  } else if (rawRole.includes('tutor') || rawRole.includes('staff') || rawRole.includes('instructor')) {
    payerRole = 'Staff';
    roleLabel = 'Staff / Faculty Member';
  } else if (rawRole.includes('admin')) {
    payerRole = 'Admin';
    roleLabel = 'Platform Administrator';
  }

  // 3. Resolve Payer Name (who actually paid)
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

  // 4. Resolve Student(s) & Beneficiary
  let studentNames: string[] = [];
  if (Array.isArray(data.studentNames)) {
    studentNames = data.studentNames.filter(Boolean);
  } else if (typeof data.studentNames === 'string' && data.studentNames.trim()) {
    studentNames = data.studentNames.split(',').map((s: string) => s.trim()).filter(Boolean);
  } else if (data.studentName) {
    studentNames = [data.studentName.trim()];
  }

  const studentCount = Number(data.studentCount || data.studentsCount || (studentNames.length > 0 ? studentNames.length : 1));
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

  // 5. Construct Canonical Display Title: "PROGRAMME FEE NAME" - "USERNAME"
  // E.g. "Digital Literacy (Entry Level) - South Gold Montessori School"
  // OR "Pre Developers phase I - Eno Torru"
  let targetEntity = '';
  if (payerRole === 'School') {
    targetEntity = data.schoolName || payerName;
  } else if (isParentPaidForStudent) {
    targetEntity = isMultipleStudents ? `${studentNames.join(' & ')} (Parent: ${payerName})` : primaryStudentName;
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
    isParentPaidForStudent
  };
};

export const generatePdfReceipt = (data: TransactionReceiptData) => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const date = parseDate(data.paidAt || data.createdAt);
  const formattedDate = formatReceiptDate(date);
  const reference = data.reference || data.id || 'JST-TXN-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  const transactionNo = data.transactionNo || '26' + Date.now().toString() + Math.floor(Math.random() * 1000);
  const sessionId = data.sessionId || '1000' + Date.now().toString() + Math.floor(Math.random() * 10000);
  const rawAmount = Number(data.customerTotal || data.amount || data.baseAmount || 0);
  const amountStr = formatCurrency(rawAmount);

  const details = getReceiptDetails(data);
  const statusUpper = String(data.status || 'UNKNOWN').trim().toUpperCase();
  const isPaid = ['SUCCESS', 'SUCCESSFUL', 'PAID', 'COMPLETED', 'APPROVED', 'CONFIRMED', 'VERIFIED'].includes(statusUpper);
  const isPartial = ['PARTIALLY_PAID', 'PARTIAL'].includes(statusUpper);
  const isPending = ['PENDING', 'PROCESSING'].includes(statusUpper);

  // Background Header Accent
  pdf.setFillColor(15, 23, 42); // #0f172a
  pdf.rect(0, 0, 210, 48, 'F');

  // Brand Name & Subtitle
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text('JAYSTARBLISS DIGITAL ACADEMY', 15, 19);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Empowering Young African Innovators • Official Electronic Payment Receipt', 15, 26);
  pdf.text('Portal: jaystarbliss-studios.name.ng/portal | Billing Support: jaystarblissstudios@gmail.com', 15, 32);

  // Status Badge in Header
  if (isPaid) {
    pdf.setFillColor(16, 185, 129); // Emerald
  } else if (isPartial || isPending) {
    pdf.setFillColor(245, 158, 11); // Amber
  } else {
    pdf.setFillColor(225, 29, 72); // Rose
  }
  pdf.roundedRect(150, 14, 45, 10, 3, 3, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text(statusUpper.replace('_', ' '), 172.5, 20.5, { align: 'center' });

  // Main Card Wrapper
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(15, 52, 180, 42, 4, 4, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(15, 52, 180, 42, 4, 4, 'S');

  // Hero Section
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RECEIPT FOR: ' + details.displayTitle.toUpperCase(), 22, 63);

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text(amountStr, 22, 75);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  if (isPaid) {
    pdf.setTextColor(16, 185, 129);
    pdf.text('✓ Verified & Reconciled on Jaystarbliss Ledger', 22, 85);
  } else if (isPartial) {
    pdf.setTextColor(217, 119, 6);
    pdf.text('• Partially Settled — Remaining Balance Tracked on Ledger', 22, 85);
  } else {
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Status: ${statusUpper}`, 22, 85);
  }

  // Table Details
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('Official Transaction Breakdown', 15, 104);

  let y = 112;
  const rowHeight = 8.8;

  const rows: [string, string][] = [
    ['Transaction No.', transactionNo],
    ['Session ID', sessionId],
    ['Payment Reference', reference],
    ['Transaction Date', formattedDate],
    ['Programme / Fee Name', details.programName],
    ...(data.selectedPrograms ? [
      ['Selected Program Tracks', String(data.selectedPrograms)] as [string, string]
    ] : []),
    ...((data.paymentPercentage && Number(data.paymentPercentage) < 100) || Number(data.remainingBalance || 0) > 0 ? [
      ['Payment Mode / Percentage', data.paymentPercentage ? `${data.paymentPercentage}% Installment Settlement` : 'Partial Settlement'] as [string, string],
      ['Full Invoice Amount', formatCurrency(data.fullProgramFee || data.amount)] as [string, string],
      ['Remaining Balance Due', formatCurrency(data.remainingBalance || 0)] as [string, string],
    ] : []),
    ['Paid By (Payer Name)', details.payerName],
    ['Payer Portal Role', `${details.roleLabel} (${details.payerRole})`],
    ['Beneficiary / Cadet(s)', details.beneficiary],
    ...(details.isMultipleStudents && details.studentList.length > 0 ? [
      ['Enrolled Student List', `${details.studentCount} Cadets: ${details.studentList.join(', ')}`] as [string, string]
    ] : []),
    ['Payment Method', data.paymentMethod || 'Paystack Direct Bank / Card'],
    ['Teaching Delivery Mode', data.teachingMode || 'Standard Practical Coding Delivery'],
    ['Duration / Coverage', data.durationWeeks ? `${data.durationWeeks} Weeks` : 'Termly Track'],
    ['Settlement Status', statusUpper],
  ];

  rows.forEach(([label, val], idx) => {
    if (idx % 2 === 0) {
      pdf.setFillColor(241, 245, 249);
      pdf.rect(15, y - 5.5, 180, rowHeight, 'F');
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(label, 19, y);

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    const textVal = String(val);
    const displayVal = textVal.length > 58 ? textVal.substring(0, 55) + '...' : textVal;
    pdf.text(displayVal, 78, y);

    y += rowHeight;
  });

  // Security Note & Watermark
  y += 6;
  pdf.setFillColor(236, 253, 245);
  pdf.roundedRect(15, y, 180, 22, 3, 3, 'F');
  pdf.setDrawColor(167, 243, 208);
  pdf.roundedRect(15, y, 180, 24, 3, 3, 'S');

  pdf.setTextColor(6, 95, 70);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.text('OFFICIAL VERIFIED DIGITAL STATEMENT', 22, y + 7);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(4, 120, 87);
  pdf.text('This receipt was electronically generated by Jaystarbliss Academy and serves as official proof', 22, y + 13);
  pdf.text('of payment for academic enrollment, curriculum licensing, and student access verification.', 22, y + 18);

  // Footer
  pdf.setFontSize(7.5);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Jaystarbliss Studios • Coding, Robotics, AI & Technology Excellence for Africa', 105, 285, { align: 'center' });

  // Save the PDF
  const filename = `receipt-${reference}.pdf`;
  pdf.save(filename);
};

export interface StatementExportOptions {
  title?: string;
  periodLabel?: string;
  accountLabel?: string;
}

/**
 * Generates a complete multi-page PDF statement containing EVERY selected/filtered transaction.
 */
export const generatePdfStatement = (
  transactions: TransactionReceiptData[],
  options?: StatementExportOptions
): { exportedCount: number; totalInflow: number; totalOutflow: number } => {
  const list = Array.isArray(transactions) ? transactions : [];
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const isConfirmedSuccess = (st: unknown) => {
    const norm = String(st ?? '').trim().toUpperCase();
    return ['SUCCESS', 'SUCCESSFUL', 'PAID', 'COMPLETED', 'APPROVED', 'CONFIRMED', 'VERIFIED', 'PARTIALLY_PAID', 'PARTIAL'].includes(norm);
  };

  let totalInflow = 0;
  let totalOutflow = 0;
  list.forEach(t => {
    if (!isConfirmedSuccess(t.status)) return;
    const amt = Number(t.customerTotal || t.amount || t.baseAmount || 0);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const isOut = t.type === 'outflow' || t.type === 'payout' || t.type === 'transfer';
    if (isOut) totalOutflow += amt;
    else totalInflow += amt;
  });

  const drawPageHeader = (pageNumber: number) => {
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, 210, 38, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text('JAYSTARBLISS DIGITAL ACADEMY', 14, 16);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(148, 163, 184);
    pdf.text(options?.title || 'Official Account Statement & Transaction Ledger', 14, 23);
    pdf.text(
      `Generated: ${formatReceiptDate(new Date())}${options?.periodLabel ? ` • Period: ${options.periodLabel}` : ''}`,
      14,
      29
    );

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.text(`Page ${pageNumber}`, 196, 16, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(148, 163, 184);
    pdf.text(`${list.length} Record${list.length === 1 ? '' : 's'}`, 196, 23, { align: 'right' });
  };

  const drawTableColumnsHeader = (startY: number) => {
    pdf.setFillColor(241, 245, 249);
    pdf.rect(14, startY - 5, 182, 8, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text('#', 16, startY);
    pdf.text('DATE', 24, startY);
    pdf.text('REFERENCE', 52, startY);
    pdf.text('DESCRIPTION / BENEFICIARY', 85, startY);
    pdf.text('STATUS', 148, startY);
    pdf.text('AMOUNT (NGN)', 194, startY, { align: 'right' });
    return startY + 7;
  };

  let pageNumber = 1;
  drawPageHeader(pageNumber);

  // Summary Box on Page 1
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(14, 43, 182, 22, 3, 3, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(14, 43, 182, 22, 3, 3, 'S');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text('TOTAL RECORDS', 20, 50);
  pdf.text('VERIFIED INFLOW', 65, 50);
  pdf.text('VERIFIED OUTFLOW', 120, 50);

  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`${list.length}`, 20, 58);
  pdf.setTextColor(16, 185, 129);
  pdf.text(formatCurrency(totalInflow), 65, 58);
  pdf.setTextColor(15, 23, 42);
  pdf.text(formatCurrency(totalOutflow), 120, 58);

  let y = drawTableColumnsHeader(74);

  list.forEach((item, index) => {
    if (y > 268) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(148, 163, 184);
      pdf.text('Jaystarbliss Studios • Official Multi-Record Financial Statement', 105, 286, { align: 'center' });

      pdf.addPage();
      pageNumber += 1;
      drawPageHeader(pageNumber);
      y = drawTableColumnsHeader(48);
    }

    if (index % 2 === 1) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(14, y - 4.5, 182, 7.5, 'F');
    }

    const d = parseDate(item.paidAt || item.createdAt);
    const shortDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ref = String(item.reference || item.id || '—').slice(0, 16);
    const details = getReceiptDetails(item);
    const desc = details.displayTitle.length > 35 ? details.displayTitle.slice(0, 32) + '...' : details.displayTitle;
    const statusText = String(item.status || 'UNKNOWN').trim().toUpperCase().slice(0, 14);
    const rawAmt = Number(item.customerTotal || item.amount || item.baseAmount || 0);
    const isOut = item.type === 'outflow' || item.type === 'payout' || item.type === 'transfer';
    const amtFormatted = `${isOut ? '-' : '+'}${formatCurrency(rawAmt)}`;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(String(index + 1), 16, y);
    pdf.text(shortDate, 24, y);
    pdf.text(ref, 52, y);

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(desc, 85, y);

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(isConfirmedSuccess(item.status) ? 16 : 100, isConfirmedSuccess(item.status) ? 185 : 116, isConfirmedSuccess(item.status) ? 129 : 139);
    pdf.text(statusText, 148, y);

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(isOut ? 15 : 16, isOut ? 23 : 185, isOut ? 42 : 129);
    pdf.text(amtFormatted, 194, y, { align: 'right' });

    y += 7.5;
  });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Jaystarbliss Studios • Official Multi-Record Financial Statement', 105, 286, { align: 'center' });

  const dateSlug = new Date().toISOString().slice(0, 10);
  pdf.save(`jaystarbliss-statement-${dateSlug}-${list.length}-records.pdf`);

  return {
    exportedCount: list.length,
    totalInflow: Number(totalInflow.toFixed(2)),
    totalOutflow: Number(totalOutflow.toFixed(2))
  };
};


