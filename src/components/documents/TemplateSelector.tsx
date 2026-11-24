import React, { useMemo, useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Award,
  FileCheck,
  Briefcase,
  GraduationCap,
  Calendar,
  FileSignature,
  Mail,
  X,
  Megaphone,
  Lightbulb,
  Bell,
  ShieldAlert,
  Users,
  ClipboardList,
  Search,
} from 'lucide-react';
import {
  buildPerformanceReportTemplate,
  buildTemplateForCategory,
  sanitizeDocumentHtml,
  type DocumentTemplateContext,
  type OfficialDocumentCategory,
} from '../../lib/documents/documentTemplates';

export interface HubMindTemplateItem {
  id: string;
  name: string;
  description: string;
  category: 'General' | 'Education' | 'Communication' | 'Business' | 'Management' | 'Finance';
  mappedPortalCategory?: OfficialDocumentCategory;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  buildContent: (ctx: DocumentTemplateContext) => string;
}

interface TemplateSelectorProps {
  isOpen: boolean;
  onSelect: (contentHtml: string, templateName: string, mappedCategory?: OfficialDocumentCategory) => void;
  onClose: () => void;
  templateContext?: DocumentTemplateContext;
  currentCategory?: OfficialDocumentCategory;
}

export const HUBMIND_DOCUMENT_TEMPLATES: HubMindTemplateItem[] = [
  {
    id: 'blank',
    name: 'Blank Official Document',
    description: 'Start from a clean A4 sheet with the official Jaystarbliss institutional letterhead and footer.',
    category: 'General',
    icon: FileText,
    buildContent: () => '<p></p>',
  },
  {
    id: 'tutor-performance-report',
    name: 'Student Performance & Progress Report',
    description: 'Comprehensive 10-section learner evaluation report with verified assessment metrics and action plan.',
    category: 'Education',
    mappedPortalCategory: 'PERFORMANCE_REPORT',
    icon: GraduationCap,
    buildContent: (ctx) => buildPerformanceReportTemplate(ctx),
  },
  {
    id: 'communique',
    name: 'Official Communiqué',
    description: 'Formal institutional announcement or policy notice for partner schools, parents, and faculty.',
    category: 'Communication',
    mappedPortalCategory: 'COMMUNIQUE',
    icon: Megaphone,
    buildContent: (ctx) => buildTemplateForCategory('COMMUNIQUE', ctx),
  },
  {
    id: 'proposal',
    name: 'Institutional / Programme Proposal',
    description: 'Comprehensive project or school partnership proposal with objectives, scope, deliverables, and budget.',
    category: 'Business',
    mappedPortalCategory: 'PROPOSAL',
    icon: Lightbulb,
    buildContent: (ctx) => buildTemplateForCategory('PROPOSAL', ctx),
  },
  {
    id: 'contract',
    name: 'Contract & Partnership Agreement',
    description: 'Formal institutional memorandum of understanding and service agreement with Dual-Party sign-off.',
    category: 'Business',
    mappedPortalCategory: 'CONTRACT',
    icon: FileSignature,
    buildContent: (ctx) => buildTemplateForCategory('CONTRACT', ctx),
  },
  {
    id: 'report',
    name: 'Official Institutional Report',
    description: 'Executive summary, key findings, methodology, and strategic recommendations.',
    category: 'Business',
    mappedPortalCategory: 'PERFORMANCE_REPORT',
    icon: Briefcase,
    buildContent: (ctx) => {
      const dateStr =
        ctx.dateLabel ||
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      return sanitizeDocumentHtml(`
        <h1>OFFICIAL INSTITUTIONAL REPORT: [INSERT TITLE]</h1>
        <table>
          <tbody>
            <tr><th>Prepared For</th><td>${ctx.recipientName || ctx.schoolName || '[Recipient Name / Department]'}</td><th>Date</th><td>${dateStr}</td></tr>
            <tr><th>Prepared By</th><td>${ctx.tutorName || 'Jaystarbliss Dynamic Institute'}</td><th>Status</th><td>FINAL</td></tr>
          </tbody>
        </table>
        <h2>1.0 Executive Summary</h2>
        <p>This report provides a comprehensive analysis of [Topic/Project]. Key findings indicate significant progress in core areas, while highlighting opportunities for strategic optimization in upcoming quarters.</p>
        <h2>2.0 Introduction &amp; Objectives</h2>
        <p>The primary objective of this initiative was to evaluate and enhance [specific goal]. The scope encompassed the following deliverables:</p>
        <ul>
          <li>Comprehensive review of current operational metrics and learning outcomes.</li>
          <li>Identification of technical bottlenecks and resource constraints.</li>
          <li>Formulation of actionable, data-driven recommendations.</li>
        </ul>
        <h2>3.0 Key Findings &amp; Analysis</h2>
        <table>
          <thead>
            <tr><th>Metric / KPI</th><th>Previous Period</th><th>Current Period</th><th>Variance</th></tr>
          </thead>
          <tbody>
            <tr><td>Programme Efficiency</td><td>78%</td><td>92%</td><td><strong>+14%</strong></td></tr>
            <tr><td>Resource Utilization</td><td>65%</td><td>88%</td><td><strong>+23%</strong></td></tr>
            <tr><td>Learner Engagement Score</td><td>4.1 / 5.0</td><td>4.8 / 5.0</td><td><strong>+0.7</strong></td></tr>
          </tbody>
        </table>
        <h2>4.0 Strategic Recommendations</h2>
        <ol>
          <li><strong>Immediate Action:</strong> Deploy updated resources to high-priority classrooms.</li>
          <li><strong>Short-Term (30–60 Days):</strong> Conduct comprehensive training workshops for coordinators.</li>
          <li><strong>Long-Term (90+ Days):</strong> Establish automated monitoring for continuous tracking.</li>
        </ol>
      `);
    },
  },
  {
    id: 'performance',
    name: 'Academic Performance Analysis',
    description: 'Termly or cohort performance review with core competencies rubric and development plan.',
    category: 'Management',
    mappedPortalCategory: 'PERFORMANCE_REPORT',
    icon: FileCheck,
    buildContent: (ctx) => {
      const dateStr =
        ctx.dateLabel ||
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      return sanitizeDocumentHtml(`
        <h1>PERFORMANCE EVALUATION &amp; COMPETENCY ANALYSIS</h1>
        <table>
          <tbody>
            <tr><th>Name</th><td>${ctx.studentName || ctx.recipientName || '[Full Name]'}</td><th>Programme / Role</th><td>${ctx.programmeName || '[Programme / Title]'}</td></tr>
            <tr><th>School / Department</th><td>${ctx.schoolName || 'Jaystarbliss Dynamic Institute'}</td><th>Review Period</th><td>${ctx.reportingPeriod || '[e.g., Q1 2026 / Term 2]'}</td></tr>
            <tr><th>Evaluator</th><td>${ctx.tutorName || '[Evaluator Name]'}</td><th>Date</th><td>${dateStr}</td></tr>
          </tbody>
        </table>
        <h2>1. Core Competencies Assessment</h2>
        <p><em>Rating Scale: 1 = Needs Improvement | 2 = Developing | 3 = Competent | 4 = Exemplary</em></p>
        <table>
          <thead>
            <tr><th>Competency Area</th><th>Rating (1–4)</th><th>Specific Observations &amp; Examples</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Technical / Academic Mastery</strong></td><td>4</td><td>Consistently delivers high-quality practical work with minimal supervision.</td></tr>
            <tr><td><strong>Problem Solving &amp; Initiative</strong></td><td>3</td><td>Proactively identifies solutions and collaborates effectively during lab sessions.</td></tr>
            <tr><td><strong>Communication &amp; Teamwork</strong></td><td>4</td><td>Articulates ideas clearly and supports peers constructively.</td></tr>
            <tr><td><strong>Punctuality &amp; Reliability</strong></td><td>4</td><td>Maintains an excellent attendance record and meets all deadlines.</td></tr>
          </tbody>
        </table>
        <h2>2. Key Achievements</h2>
        <ul>
          <li>Successfully completed [Major Project/Milestone] ahead of schedule.</li>
          <li>Demonstrated strong leadership and creativity during practical exhibitions.</li>
        </ul>
        <h2>3. Goals for Next Review Period</h2>
        <ol>
          <li><strong>Objective 1:</strong> Complete advanced module certification by [Target Date].</li>
          <li><strong>Objective 2:</strong> Lead or present a capstone project during the upcoming showcase.</li>
        </ol>
      `);
    },
  },
  {
    id: 'school-circular',
    name: 'School Circular',
    description: 'Official circular for academic dates, school events, and institutional directives.',
    category: 'Communication',
    mappedPortalCategory: 'COMMUNIQUE',
    icon: Bell,
    buildContent: (ctx) => {
      const dateStr =
        ctx.dateLabel ||
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      return sanitizeDocumentHtml(`
        <h1>OFFICIAL SCHOOL CIRCULAR</h1>
        <p><strong>CIRCULAR NO:</strong> JDI/CIR/${new Date().getFullYear()}/01 &nbsp;|&nbsp; <strong>DATE:</strong> ${dateStr}</p>
        <p><strong>Dear Parents, Guardians, and Partner School Coordinators,</strong></p>
        <p>Warm greetings from the management of <strong>Jaystarbliss Dynamic Institute</strong>. We wish to bring the following important updates and upcoming schedule to your attention for the current academic session.</p>
        <h2>1. Important Dates &amp; Academic Schedule</h2>
        <table>
          <thead>
            <tr><th>Event / Activity</th><th>Date</th><th>Applicable To</th></tr>
          </thead>
          <tbody>
            <tr><td>Mid-Term Practical Assessment</td><td>[Insert Date]</td><td>All Enrolled Learners</td></tr>
            <tr><td>Mid-Term Break</td><td>[Insert Date]</td><td>Entire Institution</td></tr>
            <tr><td>Parent-Tutor Interactive Forum</td><td>[Insert Date]</td><td>Parents &amp; Faculty</td></tr>
            <tr><td>End of Term Showcase &amp; Exhibition</td><td>[Insert Date]</td><td>All Programmes</td></tr>
          </tbody>
        </table>
        <h2>2. General Directives</h2>
        <ul>
          <li><strong>Punctuality:</strong> Learners are expected to join practical lab sessions promptly.</li>
          <li><strong>Portal Updates:</strong> Parents are encouraged to review weekly progress reports on the portal.</li>
          <li><strong>Safety &amp; Equipment:</strong> All lab workstations and learning tablets must be handled with care.</li>
        </ul>
        <p>We appreciate your continued partnership in delivering excellence in technology and creative education.</p>
        <p>Yours faithfully,<br /><strong>${ctx.tutorName || 'Academic Directorate'}</strong><br />Jaystarbliss Dynamic Institute</p>
      `);
    },
  },
  {
    id: 'school-admin-support',
    name: 'School Administrator Support Notice',
    description: 'Formal operational update, resource readiness, and support escalation notice for partner school administrators.',
    category: 'Communication',
    mappedPortalCategory: 'COMMUNIQUE',
    icon: ShieldAlert,
    buildContent: (ctx) => {
      const dateStr =
        ctx.dateLabel ||
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      return sanitizeDocumentHtml(`
        <h1>PARTNER SCHOOL ADMINISTRATOR SUPPORT NOTICE</h1>
        <table>
          <tbody>
            <tr><th>Partner Institution</th><td>${ctx.schoolName || '[Partner School Name]'}</td><th>Date</th><td>${dateStr}</td></tr>
            <tr><th>Attention</th><td>${ctx.recipientName || 'School Administrator / ICT Coordinator'}</td><th>Priority</th><td>OPERATIONAL</td></tr>
          </tbody>
        </table>
        <h2>1. Purpose of Notice</h2>
        <p>This notice provides an official operational update regarding curriculum delivery, student assessment readiness, and technical support for <strong>${ctx.schoolName || 'your institution'}</strong>.</p>
        <h2>2. Current Delivery &amp; Portal Status</h2>
        <ul>
          <li><strong>Student Roster &amp; Portal Access:</strong> Verified and active for the current academic cycle.</li>
          <li><strong>Assigned Faculty:</strong> ${ctx.tutorName || 'Jaystarbliss Specialist Faculty'} is scheduled according to the approved timetable.</li>
          <li><strong>Assessment Window:</strong> Upcoming CBT and practical evaluations are configured on the portal.</li>
        </ul>
        <h2>3. Action Items Required from School Administration</h2>
        <ol>
          <li>Confirm computer lab / classroom readiness 15 minutes prior to scheduled practical sessions.</li>
          <li>Review any pending student roster additions or class level updates on the School Portal.</li>
          <li>Contact the Jaystarbliss Partnership Desk for immediate technical or billing assistance.</li>
        </ol>
      `);
    },
  },
  {
    id: 'parent-programme-update',
    name: 'Parent Programme Update',
    description: 'Structured programme milestone letter for parents covering curriculum modules, practicals, and home support.',
    category: 'Communication',
    mappedPortalCategory: 'COMMUNIQUE',
    icon: Users,
    buildContent: (ctx) => {
      const dateStr =
        ctx.dateLabel ||
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      return sanitizeDocumentHtml(`
        <h1>PARENT PROGRAMME &amp; CURRICULUM UPDATE</h1>
        <p><strong>Date:</strong> ${dateStr} &nbsp;|&nbsp; <strong>Programme:</strong> ${ctx.programmeName || 'Jaystarbliss Core Programme'}</p>
        <p>Dear <strong>${ctx.parentName || ctx.recipientName || 'Parent / Guardian'}</strong>,</p>
        <p>We are delighted to share an update on your child&rsquo;s learning journey at <strong>Jaystarbliss Dynamic Institute</strong>. Over the past weeks, learners have engaged in hands-on modules designed to build problem-solving, digital fluency, and creative confidence.</p>
        <h2>1. Modules Covered This Period</h2>
        <ul>
          <li><strong>Core Concept Mastery:</strong> Foundational principles and interactive demonstrations.</li>
          <li><strong>Hands-On Lab Project:</strong> Guided practical build completed during weekly studio sessions.</li>
          <li><strong>Collaborative Challenge:</strong> Peer review, debugging, and presentation skills.</li>
        </ul>
        <h2>2. Upcoming Milestones</h2>
        <table>
          <thead>
            <tr><th>Milestone</th><th>Target Week / Date</th><th>What Learners Will Do</th></tr>
          </thead>
          <tbody>
            <tr><td>Practical Project Sprint</td><td>[Insert Date]</td><td>Build and test their independent module project</td></tr>
            <tr><td>Continuous Assessment</td><td>[Insert Date]</td><td>Complete timed portal assessment &amp; practical check</td></tr>
            <tr><td>Portfolio Update</td><td>[Insert Date]</td><td>Publish completed work to their student profile</td></tr>
          </tbody>
        </table>
        <h2>3. How You Can Support at Home</h2>
        <p>Encourage your child to spend 20–30 minutes reviewing their portal practice links and sharing what they built in class each week.</p>
      `);
    },
  },
  {
    id: 'daily-assistant-report',
    name: 'Daily Assistant / Faculty Activity Report',
    description: 'Daily operational log covering completed tasks, lab sessions, escalations, and next-day priorities.',
    category: 'Management',
    mappedPortalCategory: 'PERFORMANCE_REPORT',
    icon: ClipboardList,
    buildContent: (ctx) => {
      const dateStr =
        ctx.dateLabel ||
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      return sanitizeDocumentHtml(`
        <h1>DAILY FACULTY &amp; OPERATIONS ACTIVITY REPORT</h1>
        <table>
          <tbody>
            <tr><th>Staff / Tutor Name</th><td>${ctx.tutorName || '[Staff Name]'}</td><th>Date</th><td>${dateStr}</td></tr>
            <tr><th>Campus / School</th><td>${ctx.schoolName || 'Jaystarbliss Dynamic Institute'}</td><th>Supervisor</th><td>${ctx.recipientName || 'Academic Director'}</td></tr>
          </tbody>
        </table>
        <h2>1. Sessions &amp; Tasks Completed Today</h2>
        <table>
          <thead>
            <tr><th>Time / Period</th><th>Class / Activity</th><th>Attendance</th><th>Completion Status</th></tr>
          </thead>
          <tbody>
            <tr><td>09:00 – 10:30</td><td>[Programme / Class Session 1]</td><td>[e.g., 24 / 25]</td><td>Completed</td></tr>
            <tr><td>11:00 – 12:30</td><td>[Programme / Class Session 2]</td><td>[e.g., 19 / 20]</td><td>Completed</td></tr>
            <tr><td>14:00 – 15:30</td><td>[Portal Grading &amp; Lesson Prep]</td><td>—</td><td>Completed</td></tr>
          </tbody>
        </table>
        <h2>2. Highlights &amp; Learner Observations</h2>
        <ul>
          <li>[Note key engagement highlights, practical breakthroughs, or top-performing learners.]</li>
        </ul>
        <h2>3. Challenges / Escalations Requiring Support</h2>
        <ul>
          <li>[List any equipment, connectivity, or student attendance issues requiring administrative follow-up.]</li>
        </ul>
        <h2>4. Priorities for Next Working Day</h2>
        <ol>
          <li>[Priority 1]</li>
          <li>[Priority 2]</li>
        </ol>
      `);
    },
  },
  {
    id: 'meeting',
    name: 'Meeting Minutes',
    description: 'Structured record of meeting attendees, agenda discussions, and assigned action items.',
    category: 'Management',
    mappedPortalCategory: 'COMMUNIQUE',
    icon: Calendar,
    buildContent: (ctx) => {
      const dateStr =
        ctx.dateLabel ||
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      return sanitizeDocumentHtml(`
        <h1>OFFICIAL MEETING MINUTES</h1>
        <table>
          <tbody>
            <tr><th>Meeting Title</th><td>[e.g., Q1 Academic &amp; Partnership Review]</td><th>Date &amp; Time</th><td>${dateStr}</td></tr>
            <tr><th>Location</th><td>[Conference Room / Virtual Meet]</td><th>Facilitator</th><td>${ctx.tutorName || '[Facilitator Name]'}</td></tr>
          </tbody>
        </table>
        <h2>1. Attendees</h2>
        <ul>
          <li><strong>Present:</strong> [List names and titles]</li>
          <li><strong>Apologies / Absent:</strong> [List names]</li>
        </ul>
        <h2>2. Key Discussion Points</h2>
        <h3>2.1 [Agenda Item 1]</h3>
        <p>[Summarize key points discussed and decisions reached.]</p>
        <h3>2.2 [Agenda Item 2]</h3>
        <p>[Summarize key points discussed and decisions reached.]</p>
        <h2>3. Action Items &amp; Deliverables</h2>
        <table>
          <thead>
            <tr><th>Action Item / Task</th><th>Owner</th><th>Deadline</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><td>[Describe specific task]</td><td>[Owner Name]</td><td>[Date]</td><td>In Progress</td></tr>
            <tr><td>[Describe specific task]</td><td>[Owner Name]</td><td>[Date]</td><td>Pending</td></tr>
          </tbody>
        </table>
      `);
    },
  },
  {
    id: 'lesson',
    name: 'Lesson Note & Curriculum Plan',
    description: 'Structured lesson plan for educators with learning objectives, instructional steps, and evaluation.',
    category: 'Education',
    mappedPortalCategory: 'PERFORMANCE_REPORT',
    icon: GraduationCap,
    buildContent: (ctx) => {
      const dateStr =
        ctx.dateLabel ||
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      return sanitizeDocumentHtml(`
        <h1>STRUCTURED LESSON NOTE</h1>
        <table>
          <tbody>
            <tr><th>Tutor Name</th><td>${ctx.tutorName || '[Tutor Name]'}</td><th>Programme / Subject</th><td>${ctx.programmeName || '[Programme Name]'}</td></tr>
            <tr><th>Class / Level</th><td>${ctx.studentClass || '[Grade / Class]'}</td><th>Date</th><td>${dateStr}</td></tr>
            <tr><th>Topic</th><td>[Insert Lesson Topic]</td><th>Duration</th><td>[e.g., 60 Minutes]</td></tr>
          </tbody>
        </table>
        <h2>1. Behavioural / Learning Objectives</h2>
        <p>By the end of the lesson, learners should be able to:</p>
        <ol>
          <li>Define and explain [core concept].</li>
          <li>Demonstrate how to build or apply [practical skill].</li>
          <li>Complete the hands-on lab challenge independently.</li>
        </ol>
        <h2>2. Instructional Materials &amp; Setup</h2>
        <p>Laptops/Tablets, Projector, Starter Code / Practice Assets, Interactive Portal Worksheet.</p>
        <h2>3. Lesson Presentation Steps</h2>
        <ul>
          <li><strong>Step 1 — Introduction (10 mins):</strong> Review prior knowledge and introduce today&rsquo;s real-world problem.</li>
          <li><strong>Step 2 — Guided Demonstration (20 mins):</strong> Live walkthrough of core techniques and tools.</li>
          <li><strong>Step 3 — Hands-On Practical Lab (20 mins):</strong> Learners build and test their projects with tutor guidance.</li>
          <li><strong>Step 4 — Evaluation &amp; Wrap-Up (10 mins):</strong> Quick quiz, peer showcase, and summary.</li>
        </ul>
      `);
    },
  },
  {
    id: 'exam',
    name: 'Examination Paper',
    description: 'Standard examination sheet with candidate instructions, Section A multiple choice, and Section B theory.',
    category: 'Education',
    mappedPortalCategory: 'PERFORMANCE_REPORT',
    icon: FileText,
    buildContent: (ctx) =>
      sanitizeDocumentHtml(`
        <h1>TERMINAL ASSESSMENT EXAMINATION</h1>
        <table>
          <tbody>
            <tr><th>Programme / Subject</th><td>${ctx.programmeName || '[Subject Name]'}</td><th>Class / Level</th><td>${ctx.studentClass || '[Class Level]'}</td></tr>
            <tr><th>Time Allowed</th><td>1 Hour 30 Minutes</td><th>Maximum Score</th><td>100 Marks</td></tr>
          </tbody>
        </table>
        <p><strong>CANDIDATE INSTRUCTIONS:</strong> Answer all questions in Section A and any three (3) questions from Section B. Write clearly and review your work before submission.</p>
        <h2>SECTION A: OBJECTIVE QUESTIONS (40 MARKS)</h2>
        <p><strong>1.</strong> Which of the following best describes an algorithm in programming?<br />A. A hardware monitor &nbsp;&nbsp; B. A step-by-step procedure for solving a problem &nbsp;&nbsp; C. A power cable &nbsp;&nbsp; D. An internet browser</p>
        <p><strong>2.</strong> [Insert Question 2 text here]<br />A. [Option A] &nbsp;&nbsp; B. [Option B] &nbsp;&nbsp; C. [Option C] &nbsp;&nbsp; D. [Option D]</p>
        <h2>SECTION B: PRACTICAL &amp; THEORY (60 MARKS)</h2>
        <p><strong>Question 1 (20 Marks):</strong><br />a) Explain the difference between input and output devices with two examples each. <em>(10 Marks)</em><br />b) Describe the steps required to debug a broken logic block in your project. <em>(10 Marks)</em></p>
      `),
  },
  {
    id: 'certificate',
    name: 'Certificate of Achievement',
    description: 'Formal recognition citation for programme completion or outstanding performance.',
    category: 'Education',
    mappedPortalCategory: 'COMMUNIQUE',
    icon: Award,
    buildContent: (ctx) => {
      const dateStr =
        ctx.dateLabel ||
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      return sanitizeDocumentHtml(`
        <h1 style="text-align: center;">CERTIFICATE OF ACHIEVEMENT</h1>
        <p style="text-align: center;"><em>PROUDLY PRESENTED TO</em></p>
        <h2 style="text-align: center;">${ctx.studentName || ctx.recipientName || '[RECIPIENT FULL NAME]'}</h2>
        <p style="text-align: center;">For successfully completing the prescribed curriculum and practical milestones in <strong>${ctx.programmeName || '[Programme Title]'}</strong> with distinction, demonstrating exceptional creativity, technical proficiency, and dedication at <strong>Jaystarbliss Dynamic Institute</strong>.</p>
        <table>
          <tbody>
            <tr><th>Date Conferred</th><td>${dateStr}</td><th>Issuing Authority</th><td>Jaystarbliss Dynamic Institute</td></tr>
            <tr><th>Lead Instructor</th><td>${ctx.tutorName || 'Academic Directorate'}</td><th>Verification Status</th><td>Verified Portal Record</td></tr>
          </tbody>
        </table>
      `);
    },
  },
  {
    id: 'invoice',
    name: 'Official Billing Invoice',
    description: 'Itemized institutional invoice for programme tuition, partnership fees, and services.',
    category: 'Finance',
    mappedPortalCategory: 'PROPOSAL',
    icon: FileSpreadsheet,
    buildContent: (ctx) => {
      const dateStr =
        ctx.dateLabel ||
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      return sanitizeDocumentHtml(`
        <h1>OFFICIAL INSTITUTIONAL INVOICE</h1>
        <table>
          <tbody>
            <tr><th>Billed To</th><td>${ctx.recipientName || ctx.schoolName || '[Client / Partner School Name]'}</td><th>Invoice Date</th><td>${dateStr}</td></tr>
            <tr><th>Programme / Scope</th><td>${ctx.programmeName || 'Institutional Partnership Programme'}</td><th>Payment Terms</th><td>Due within 14 Days</td></tr>
          </tbody>
        </table>
        <h2>Itemized Schedule of Fees</h2>
        <table>
          <thead>
            <tr><th>Description of Service / Programme</th><th>Qty / Learners</th><th>Unit Rate (NGN)</th><th>Total (NGN)</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Core Programme Delivery &amp; Practical Lab Tuition</strong></td><td>1</td><td>180,000.00</td><td>180,000.00</td></tr>
            <tr><td><strong>Portal LMS Access, CBT Assessments &amp; Certification</strong></td><td>1</td><td>45,000.00</td><td>45,000.00</td></tr>
            <tr><th colspan="3">TOTAL AMOUNT DUE (NGN)</th><th>₦225,000.00</th></tr>
          </tbody>
        </table>
        <h2>Payment &amp; Remittance Instructions</h2>
        <p>Payments may be completed directly via the <strong>Jaystarbliss Portal Billing Center</strong> (Paystack instant receipt) or via official institutional transfer quoting the reference number at the top of this document.</p>
      `);
    },
  },
  {
    id: 'letter',
    name: 'Official Institutional Letter',
    description: 'Standard formal business or academic correspondence with official letterhead.',
    category: 'General',
    mappedPortalCategory: 'COMMUNIQUE',
    icon: Mail,
    buildContent: (ctx) => {
      const dateStr =
        ctx.dateLabel ||
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      return sanitizeDocumentHtml(`
        <p><strong>Date:</strong> ${dateStr}</p>
        <p><strong>To:</strong><br /><strong>${ctx.recipientName || '[Recipient Name & Title]'}</strong><br />${ctx.schoolName || '[Institution / Organization Name]'}</p>
        <p>Dear ${ctx.recipientName || '[Recipient Name]'},</p>
        <h1>RE: [INSERT SUBJECT OF OFFICIAL CORRESPONDENCE]</h1>
        <p>I am writing on behalf of <strong>Jaystarbliss Dynamic Institute</strong> regarding [state the primary purpose of the letter clearly and concisely].</p>
        <p>[Provide supporting details, background context, key dates, or institutional commitments here.]</p>
        <p>Please let us know if you require any additional documentation or clarification. We look forward to your feedback and continued collaboration.</p>
        <p>Yours sincerely,<br /><strong>${ctx.tutorName || 'Authorized Signatory'}</strong><br />Jaystarbliss Dynamic Institute</p>
      `);
    },
  },
];

const CATEGORIES = ['All', 'Education', 'Communication', 'Business', 'Management', 'Finance', 'General'] as const;

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  isOpen,
  onSelect,
  onClose,
  templateContext = {},
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTemplates = useMemo(() => {
    return HUBMIND_DOCUMENT_TEMPLATES.filter((t) => {
      const matchesCat = selectedCategory === 'All' || t.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[85] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-selector-modal-title"
    >
      <div className="bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 bg-[#0C2340] text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white shrink-0">
              <FileText size={20} />
            </div>
            <div>
              <h2 id="template-selector-modal-title" className="text-base sm:text-lg font-bold">
                Choose an Official Document Template
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Every template renders inside the standard Jaystarbliss A4 geometric letterhead &amp; watermark frame
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            aria-label="Close template selector"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="px-6 py-3.5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-[#991B1B] text-white shadow-xs'
                    : 'bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:border-[#991B1B]/50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
            />
          </div>
        </div>

        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    const html = template.buildContent(templateContext);
                    onSelect(html, template.name, template.mappedPortalCategory);
                  }}
                  className="flex flex-col text-left p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 hover:border-[#991B1B] dark:hover:border-[#991B1B] hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0C2340]/10 dark:bg-white/10 text-[#0C2340] dark:text-white flex items-center justify-center group-hover:bg-[#991B1B] group-hover:text-white transition-colors">
                      <Icon size={20} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                      {template.category}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 group-hover:text-[#991B1B] dark:group-hover:text-red-400 transition-colors">
                    {template.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {template.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateSelector;
