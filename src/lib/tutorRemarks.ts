export interface TutorRemarkPreset {
  id: string;
  category: 'Distinction' | 'Commendable' | 'Satisfactory' | 'Support Needed' | 'General';
  label: string;
  text: string;
}

export const TUTOR_REMARK_PRESETS: TutorRemarkPreset[] = [
  {
    id: 'distinction-1',
    category: 'Distinction',
    label: 'Outstanding Mastery (Distinction)',
    text: 'Outstanding performance! Demonstrated exceptional mastery of core concepts, analytical reasoning, and accuracy throughout this assessment.',
  },
  {
    id: 'distinction-2',
    category: 'Distinction',
    label: 'Exemplary Problem Solving',
    text: 'Excellent result! Keep up this high standard of technical understanding, attention to detail, and problem-solving confidence.',
  },
  {
    id: 'commendable-1',
    category: 'Commendable',
    label: 'Strong & Commendable Effort',
    text: 'Very good performance. Shows a strong grasp of the curriculum with minor areas to refine in order to achieve full distinction.',
  },
  {
    id: 'commendable-2',
    category: 'Commendable',
    label: 'Consistent Progress',
    text: 'Commendable effort and solid progress. Reviewing the missed questions will help consolidate mastery ahead of the next evaluation.',
  },
  {
    id: 'satisfactory-1',
    category: 'Satisfactory',
    label: 'Satisfactory Pass — More Practice',
    text: 'Good effort and a satisfactory pass. Additional hands-on practice on the highlighted topics will strengthen future performance.',
  },
  {
    id: 'satisfactory-2',
    category: 'Satisfactory',
    label: 'Fair Understanding — Revise Key Topics',
    text: 'Fair performance. Please revise the areas where marks were lost and participate actively during upcoming revision sessions.',
  },
  {
    id: 'support-1',
    category: 'Support Needed',
    label: 'Needs Focused Revision & Support',
    text: 'Needs improvement. Please review the class notes and practice exercises carefully, and ask questions during remedial sessions.',
  },
  {
    id: 'support-2',
    category: 'Support Needed',
    label: 'Foundational Reinforcement Required',
    text: 'More consistent study and guided practice are required. We will focus on reinforcing foundational concepts in upcoming lessons.',
  },
  {
    id: 'general-1',
    category: 'General',
    label: 'Well Done on Completing Assessment',
    text: 'Well done on completing this assessment. Please review the question breakdown and expected answers for continuous improvement.',
  },
  {
    id: 'general-2',
    category: 'General',
    label: 'Verified by Subject Tutor',
    text: 'Assessment reviewed and verified by the subject tutor. Keep practicing regularly to build greater speed and accuracy.',
  },
];

export function getSuggestedTutorRemark(percentage?: number | null): string {
  if (typeof percentage !== 'number' || Number.isNaN(percentage)) {
    return TUTOR_REMARK_PRESETS[8].text;
  }
  if (percentage >= 80) return TUTOR_REMARK_PRESETS[0].text;
  if (percentage >= 65) return TUTOR_REMARK_PRESETS[2].text;
  if (percentage >= 50) return TUTOR_REMARK_PRESETS[4].text;
  return TUTOR_REMARK_PRESETS[6].text;
}

export function getCurrentAcademicSessionLabel(referenceDate: Date = new Date()): string {
  const validDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const year = validDate.getFullYear();
  const month = validDate.getMonth();
  if (month >= 8) {
    return `${year}/${year + 1} ACADEMIC SESSION`;
  }
  return `${year - 1}/${year} ACADEMIC SESSION`;
}
