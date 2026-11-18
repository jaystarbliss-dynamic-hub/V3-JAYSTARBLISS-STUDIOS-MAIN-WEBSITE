import { jsPDF } from 'jspdf';
import { ECOSYSTEM_STAGES, LEARNING_SCHOOLS } from '../data/learningEcosystem';
import {
  JDI_COLORS,
  JDI_CONTACTS,
  JDI_INSTITUTION_NAME,
  PDF_LAYOUT,
  formatDocumentRefNo,
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

export interface SyllabusProgramData {
  title: string;
  category?: string;
  categoryId?: string;
  schoolName?: string;
  shortDescription?: string;
  longDescription?: string;
  targetAudience?: string;
  deliveryFormat?: string;
  duration?: string;
  prerequisites?: string;
  learningOutcomes?: string[];
  stagesCustom?: {
    discover?: string[];
    build?: string[];
    apply?: string[];
    create?: string[];
    master?: string[];
  };
}

export async function createSyllabusPdfDocument(program: SyllabusProgramData): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = PDF_LAYOUT.MARGIN_X;
  const contentWidth = pageWidth - marginX * 2;
  const watermarkAsset = await loadOfficialWatermarkAsset();

  const matchedSchool =
    LEARNING_SCHOOLS.find(
      (s) =>
        s.id === program.categoryId ||
        s.name.toLowerCase() === (program.schoolName || '').toLowerCase()
    ) || LEARNING_SCHOOLS[0];

  const stagesData = {
    discover: program.stagesCustom?.discover ||
      matchedSchool?.stagesFramework?.discover || [
        'Foundational syntax, algorithmic logic & mental models',
        'Diagnostic assessment and personalized goal setting',
        'Development environment setup and safety best practices',
      ],
    build: program.stagesCustom?.build ||
      matchedSchool?.stagesFramework?.build || [
        'Hands-on interactive coding drills and guided exercises',
        'Data structures, functional logic, and interface construction',
        'Weekly mentor review and code quality checkpoints',
      ],
    apply: program.stagesCustom?.apply ||
      matchedSchool?.stagesFramework?.apply || [
        'Building real-world mini-applications and problem solving',
        'Cross-disciplinary integrations and interactive UI features',
        'Debugging methodologies, test suites, and collaborative sessions',
      ],
    create: program.stagesCustom?.create ||
      matchedSchool?.stagesFramework?.create || [
        'Independent capstone project ideation, wireframing & coding',
        'End-to-end deployment and portfolio-ready documentation',
        'Preparation for exhibition, competitions, and showcase portfolios',
      ],
    master: program.stagesCustom?.master ||
      matchedSchool?.stagesFramework?.master || [
        'Peer review leadership, advanced optimization and algorithms',
        'Termly Demo Day showcase presentation before parents & mentors',
        'Verifiable Jaystarbliss Certificate of Technical & Academic Mastery',
      ],
  };

  const refNo = formatDocumentRefNo('JDI-SYL', program.title || 'Curriculum');
  const shortDate = formatShortDateDDMMYY(new Date());
  const academyLabel = sanitizePdfText(
    program.category || program.schoolName || matchedSchool?.name || 'Academy Program'
  );

  preparePageBackgroundAndWatermark(doc, watermarkAsset);

  let y = drawInstitutionalDocumentHeader(doc, {
    institutionTitle: JDI_INSTITUTION_NAME,
    subtitleLine: `OFFICIAL PROGRAMME SYLLABUS  •  ${academyLabel.toUpperCase()}  |  DATE: ${shortDate}`,
    refNo,
  });

  // Course Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  const titleLines = doc.splitTextToSize(
    sanitizePdfText(program.title || 'Curriculum Syllabus'),
    contentWidth
  ) as string[];
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 6.8 + 1.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...JDI_COLORS.CRIMSON);
  doc.text(
    `${academyLabel.toUpperCase()}  •  5-STAGE DISCOVER-MASTER PATHWAY`,
    marginX,
    y
  );
  y += 6;

  // Metadata Summary Strip
  const metaH = 22;
  drawTranslucentRect(
    doc,
    marginX,
    y,
    contentWidth,
    metaH,
    JDI_COLORS.ICE_BG,
    0.84,
    JDI_COLORS.ICE_BORDER,
    2.2
  );

  const colW = contentWidth / 3;
  const drawMetaCell = (colIdx: number, label: string, val: string, isAccent = false) => {
    const cx = marginX + colW * colIdx + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...JDI_COLORS.INK_MUTED);
    doc.text(label, cx, y + 7.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(...(isAccent ? JDI_COLORS.CRIMSON : JDI_COLORS.INK_DARK));
    doc.text(sanitizePdfText(val), cx, y + 14.5, { maxWidth: colW - 9 });
  };

  drawMetaCell(0, 'TARGET AUDIENCE', program.targetAudience || 'Ages 7-18 / All Levels');
  drawMetaCell(1, 'DELIVERY FORMAT', program.deliveryFormat || 'In-Person & Live Online');
  drawMetaCell(2, 'CERTIFICATION', 'Verified Mastery Credential', true);

  y += metaH + 8;

  // Section 1: Overview
  y = ensurePdfSpace(doc, y, 28, refNo, watermarkAsset);
  y = drawSectionHeading(doc, '1. Curriculum Overview & Objectives', marginX, y, contentWidth);

  const overviewText = sanitizePdfText(
    program.shortDescription ||
      'This curriculum prepares students to transition from passive consumers of technology and media to active builders, thinkers, and creators. Through progressive hands-on projects, learners master technical fundamentals, problem-solving habits, and industry-standard creative workflows.'
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(...JDI_COLORS.INK_BODY);
  const descLines = doc.splitTextToSize(overviewText, contentWidth) as string[];
  doc.text(descLines, marginX, y);
  y += descLines.length * 4.5 + 8;

  // Section 2: 5-Stage Framework
  y = ensurePdfSpace(doc, y, 22, refNo, watermarkAsset);
  y = drawSectionHeading(
    doc,
    '2. The 5-Stage DISCOVER-MASTER Learning Framework',
    marginX,
    y,
    contentWidth
  );

  const stageKeys: (keyof typeof stagesData)[] = ['discover', 'build', 'apply', 'create', 'master'];

  ECOSYSTEM_STAGES.forEach((stage, idx) => {
    const key = stageKeys[idx];
    const bulletItems = stagesData[key] || [];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    const wrappedBullets = bulletItems.map((bullet) =>
      doc.splitTextToSize(sanitizePdfText(bullet), contentWidth - 18) as string[]
    );
    const totalBulletLines = wrappedBullets.reduce((acc, lines) => acc + lines.length, 0);
    const descWrapped = doc.splitTextToSize(
      sanitizePdfText(stage.description),
      contentWidth - 12
    ) as string[];
    const cardHeight = 16 + descWrapped.length * 4 + totalBulletLines * 4.1 + 3;

    y = ensurePdfSpace(doc, y, cardHeight + 4, refNo, watermarkAsset);

    drawTranslucentRect(
      doc,
      marginX,
      y,
      contentWidth,
      cardHeight,
      JDI_COLORS.SOFT_TINT,
      0.72,
      JDI_COLORS.BORDER_LIGHT,
      2
    );

    // Stage Number Pill in Navy
    doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.roundedRect(marginX + 4, y + 4, 20, 6, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...JDI_COLORS.WHITE);
    doc.text(`STAGE ${stage.stage}`, marginX + 14, y + 8.1, { align: 'center' });

    doc.setFontSize(9.2);
    doc.setTextColor(...JDI_COLORS.CRIMSON);
    doc.text(sanitizePdfText(stage.name), marginX + 27, y + 8.3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...JDI_COLORS.INK_MUTED);
    doc.text(sanitizePdfText(`•  ${stage.tagline}`), marginX + 52, y + 8.3, {
      maxWidth: contentWidth - 58,
    });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...JDI_COLORS.INK_BODY);
    doc.text(descWrapped, marginX + 5, y + 14.2);

    let bulletY = y + 14.2 + descWrapped.length * 4 + 1.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    wrappedBullets.forEach((lines) => {
      doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
      doc.circle(marginX + 7.5, bulletY - 1, 0.75, 'F');
      doc.setTextColor(...JDI_COLORS.INK_DARK);
      doc.text(lines, marginX + 11.5, bulletY);
      bulletY += lines.length * 4.1;
    });

    y += cardHeight + 4;
  });

  // Section 3: Learner Planning & Pacing Blueprint
  y = ensurePdfSpace(doc, y, 52, refNo, watermarkAsset);
  y += 2;
  y = drawSectionHeading(doc, '3. Learner Planning & Pacing Blueprint', marginX, y, contentWidth);

  const pacingH = 38;
  drawTranslucentRect(
    doc,
    marginX,
    y,
    contentWidth,
    pacingH,
    JDI_COLORS.ICE_BG,
    0.8,
    JDI_COLORS.ICE_BORDER,
    2.2
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.text('RECOMMENDED PACING & COMMITMENT:', marginX + 6, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...JDI_COLORS.INK_BODY);
  const pacingNotes = [
    '- Pacing: 1 to 2 sessions per week (90 to 120 minutes per session) for optimal retention.',
    '- Hands-on Practice: 30-45 minutes of practical project building between mentor sessions.',
    '- Diagnostic Onboarding: Every enrollee completes a diagnostic session to calibrate starting level.',
    '- Progress Portal: Regular milestone reports and verifiable code/design project artifacts.',
    '- Capstone Exhibition: Opportunity to present finished works at the termly Demo Day at Stage 5.',
  ];
  pacingNotes.forEach((note, idx) => {
    doc.text(note, marginX + 6, y + 13 + idx * 5);
  });

  y += pacingH + 6;

  // Inquiry Callout
  y = ensurePdfSpace(doc, y, 22, refNo, watermarkAsset);
  doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.roundedRect(marginX, y, contentWidth, 18, 2.2, 2.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...JDI_COLORS.WHITE);
  doc.text('Ready to Enroll or Customize a Learning Pathway?', marginX + 6, y + 7.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...JDI_COLORS.ICE_BORDER);
  doc.text(
    `Support / WhatsApp: +234 913 651 8194 | +234 913 052 9010  •  Email: ${JDI_CONTACTS.email}`,
    marginX + 6,
    y + 13
  );

  applyFooterAcrossAllPages(doc);
  return doc;
}

export async function generateSyllabusPdf(program: SyllabusProgramData): Promise<void> {
  const doc = await createSyllabusPdfDocument(program);
  const sanitizedTitle = (program.title || 'Course')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 30);
  doc.save(`Jaystarbliss_Syllabus_${sanitizedTitle}.pdf`);
}
