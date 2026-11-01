# Implementation Plan – Parent Billing & Assessment Quiz Player Format

## 1. Parent Billing Data Isolation & Flexible Payment Management
- **Strict Backend Data Isolation (`/netlify/functions/billing-data.ts`)**: Scoped `role === "parent"` queries strictly to the parent's verified identity (`parentUid`, `parentEmail`, and explicit child IDs). Records not matching the authenticated parent are discarded.
- **Robust Ownership Verification in Checkout (`/netlify/functions/paystack-initialize.ts`)**: Enhanced `findStudent` to verify parent-child links across `parentId`, `parentUid`, `parentEmail`, and parent document children arrays. Added dynamic sum calculation for `selectedItems`.
- **Targeted Payment Reconciliation (`/api/_lib/payment-reconciliation.ts`)**: Records `selectedItems` and `studentIds` on payment records, updating status only for paid child/program items and splitting tutor wallet credits accurately.
- **4-Level Progressive Hierarchical UI (`/src/pages/portal/BillingCenter.tsx`)**: Child -> Tutor -> Program -> Summary & Checkout hierarchy with tri-state selection, breakdown badges, Paystack checkout modal, and bulk action helpers.

## 2. Focused Single-Question Quiz Player ("🔥 Quiz Time 🔥")
Based on the reference design (`image_924beaec.png`), the student assessment interface in `/src/pages/portal/StudentExamAttempt.tsx` has been enhanced with:

1. **Focused Step-by-Step Quiz Player**:
   - **Header**: Centered glowing `🔥 Quiz Time 🔥` title with flame icons and instruction subtitle.
   - **Progress Tracking**: Top progress bar showing `Question X of Y`, `Z answered`, and smooth glowing red progress track.
   - **Tactile Option Cards**: Full-width card buttons for True/False and Single Choice MCQs. Crisp white selection outline when chosen, subtle dark border when unselected, without radio button clutter.
   - **Comprehensive Question Support**: Multiple choice (check-enabled cards), dropdowns, essays, short answers, and practical tasks with file attachments and link submissions.
   - **Navigation Controls**: Pill `Back` button (disabled on question 1) and vibrant red `Next >` button (`Review & Finish` on last question).
   - **Question Jump Strip (Pills)**: Circular numbered jump buttons (`1, 2, 3 ... N`):
     - Active question: Glowing bright red circle (`bg-red-600 ring-4 ring-red-500/20 scale-110 font-black`).
     - Answered questions: Muted red circle (`bg-red-950/70 border-red-800 text-red-300`).
     - Unanswered questions: Dark circle (`bg-white/5 border-white/10 text-slate-400`).
   - **Keyboard Navigation**: Pressing Left / Right arrow keys smoothly transitions between questions (bypassed when typing in text fields).

2. **View Mode Switcher**:
   - Integrated into the sticky header bar: toggle between "Quiz Player" (focused single-question view, active by default) and "All Questions" (classic scrolling list).

3. **Review & Submit Modal**:
   - Triggered when clicking `Review & Finish` or `Review Answers`. Displays answered vs. unanswered counts, a question jump grid, and submission confirmation.
   - Preserves all autosave, countdown timer, auto-grading, and link validation logic.
