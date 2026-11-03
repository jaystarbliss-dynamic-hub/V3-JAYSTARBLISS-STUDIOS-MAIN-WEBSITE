# Jaystarbliss Studios — Master Design System
**Version:** 1.0 · **Status:** Proposed foundation for review · **Date:** 3 November 2026

## 1. Product identity

Jaystarbliss Studios is one connected digital ecosystem across education, technology, creative services and institutional partnerships.

- **Learn:** academic support, coding, programming, digital literacy, creative design, music, strategy games, young creators and private tutoring.
- **Build:** websites, web applications, software, institutional tools and digital transformation services.
- **Create and partner:** creative production, student showcases, school programmes and institutional collaborations.

**Brand promise:** Learn. Build. Create. Grow.

The design objective is to help every visitor understand the offer, identify the journey meant for them and reach the next useful action quickly.

### Experience principles
1. Clarity before decoration. Every screen has one obvious purpose and a clear next action.
2. Role-first architecture. Student, parent, tutor, school and administrator workflows are intentionally different.
3. Progress is visible. Learning, assessment, onboarding and payment states explain what happens next.
4. Trust is earned. Testimonials, metrics, ratings, client marks and outcomes must be supported by real records.
5. One system, not one template. Public pages feel expressive and editorial; workspaces feel calm, precise and efficient.
6. Motion has meaning. Animation confirms hierarchy, state and transitions; it must not delay work.
7. Mobile is a first-class layout, not a desktop layout shrunk to fit.

## 2. Brand art direction

### Premium Digital Institution

A confident editorial identity with a restrained technology character. Midnight navy establishes trust and technical depth. Studio red is the signature accent, used selectively. Warm-white surfaces keep public pages welcoming. Cool slate neutrals support data-rich workspaces. A controlled blue is reserved for informational states. Photography should show real people, learning, creative production and delivered work.

The existing Galaxy Orbit / orbital motif becomes a recognisable brand device, not a background effect repeated on every page.

Avoid excessive glassmorphism, neon accents competing with red, gradients on every card, oversized uppercase interface labels, irrelevant stock photography, invented testimonials and decorative statistics.

### Logo
Use the approved Jaystarbliss logo asset already in the repository. Preserve aspect ratio and clear space. Use the compact mark in workspace navigation and the full wordmark in public headers and footers. Do not redraw or stretch it.

## 3. Design tokens

These values are the source of truth for new interface work. Map them into the existing Tailwind configuration and CSS variables. Avoid undocumented one-off colours.

### Colour palette

| Token | Value | Usage |
|---|---|---|
| jb-ink-950 | #101B2B | Deep brand canvas / hero |
| jb-ink-900 | #14243A | Primary navy |
| jb-ink-800 | #1D344F | Raised navy surface |
| jb-red-700 | #B8322A | Primary brand action |
| jb-red-600 | #D14338 | Hover / active brand accent |
| jb-red-050 | #FFF1EF | Soft brand tint |
| jb-paper | #F8F8F5 | Public background |
| jb-white | #FFFFFF | Cards and content surfaces |
| jb-slate-050 | #F6F8FB | Workspace canvas |
| jb-slate-100 | #EDF1F5 | Muted surface |
| jb-slate-200 | #DDE4EC | Borders / dividers |
| jb-slate-400 | #94A3B8 | Quiet metadata |
| jb-slate-500 | #64748B | Secondary text |
| jb-slate-700 | #334155 | Body text |
| jb-slate-900 | #172334 | Headings |
| jb-blue-700 | #2457A6 | Informational state |
| jb-blue-050 | #EEF5FF | Informational background |
| jb-green-700 | #15805D | Success |
| jb-green-050 | #EAF7F0 | Success background |
| jb-amber-700 | #A65A13 | Pending / warning |
| jb-amber-050 | #FFF5E7 | Warning background |
| jb-danger | #B42318 | Error / destructive action |
| jb-danger-050 | #FFF0EF | Error background |

Dark theme:
- Canvas #0D1522; primary surface #121F30; raised surface #19283B.
- Border rgba(222,232,244,.11); heading #F5F7FA; body #D3DCE7; muted #9AAABD.
- Brand red #E06458.

Semantic rule: brand red is not the universal status colour. Use green for success, amber for pending/attention, red for errors/destructive actions and blue for information. Pair colour with a text label or icon.

### Typography
Preferred family: Plus Jakarta Sans for interface and headings, system sans-serif fallback. Use a restrained monospace face only for access codes, IDs and technical values.

| Role | Desktop | Mobile | Weight / line-height |
|---|---:|---:|---|
| Display | 56–68 px | 38–46 px | 750–800 / 1.03–1.10 |
| H1 | 44–52 px | 32–38 px | 750 / 1.08–1.15 |
| H2 | 32–40 px | 26–32 px | 700–750 / 1.15 |
| H3 | 22–26 px | 20–23 px | 700 / 1.25 |
| H4 | 18–20 px | 17–19 px | 650–700 / 1.3 |
| Body large | 18 px | 16–17 px | 400–500 / 1.65 |
| Body | 15–16 px | 14–16 px | 400–500 / 1.55 |
| Label | 12–13 px | 12–13 px | 600–700 / 1.35 |
| Caption | 12 px | 12 px | 450–500 / 1.45 |

Use sentence case for navigation and form labels. Use uppercase sparingly for short eyebrow labels. Body text should generally not exceed 65–75 characters per line.

### Spacing
Use a 4 px base scale:
- 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80 and 96 px.
- Public content max width: 1240 px; hero max width: 1320 px; text measure: 680 px.
- Dashboard content max width: 1480 px.
- Workspace sidebar: 248 px expanded, 72 px collapsed rail; mobile drawer max 288 px.
- Authenticated topbar: 64 px desktop, 56 px mobile.
- Dashboard padding: 32 px desktop, 24 px tablet, 16 px mobile.
- Public section spacing: 88–112 px desktop, 56–72 px mobile.
- Do not force long pages into fixed-height viewports.

### Radius, borders and elevation
- Small: 8 px for inputs and tags.
- Medium: 12 px for buttons and compact cards.
- Large: 18 px standard cards.
- XL: 24 px feature cards.
- 2XL: 32 px hero panels.
- Pill: 999 px.
- Default border: 1 px solid jb-slate-200.
- Default shadows are soft and low contrast. Use elevation to distinguish layers, not to make every card float.

### Motion
Use the existing Motion / Framer Motion dependencies and CSS for small transitions.

| Token | Duration | Use |
|---|---:|---|
| Instant | 100 ms | Press / active feedback |
| Fast | 160 ms | Hover, focus, compact state |
| Standard | 220 ms | Tabs, dropdowns, card movement |
| Emphasis | 360 ms | Modal / drawer entrance |
| Showcase | 600–900 ms | Public hero and section reveal only |

Use cubic-bezier(.2,.8,.2,1) for interface motion. Small groups may stagger by 40–70 ms. Ordinary reveals should move 6–12 px maximum. Respect prefers-reduced-motion: disable non-essential transforms, parallax, looping and stagger.

## 4. Shared component system

### Buttons
- Primary: filled brand red; one dominant primary action per local region.
- Secondary: neutral surface with border.
- Tertiary: quiet text action.
- Destructive: semantic danger treatment, separated from routine actions.
- Standard heights: 40 px compact, 44 px standard, 48 px prominent.
- Include loading, disabled, focus and pressed states.
- Icon-only controls require accessible labels and tooltips where useful.

### Cards
Default card: white surface, 1 px border, 18 px radius, 20–24 px padding.
Interactive cards get a subtle hover border/elevation and visible keyboard focus.
Metric cards show label, value, context and optional icon.
Feature cards use a clear image or colour block, readable copy and one primary action.
Do not place unrelated actions inside one clickable card.

### Forms
Always-visible labels; placeholders are examples, not labels. Helper text explains expected formats. Validation is inline and specific. Preserve entered values after recoverable errors. Group long forms into steps or named sections with progress and save/continue context. Mobile input text should be at least 16 px and target sizes at least 44 px.

### Tables and directories
Search, filters and the main action appear above data. Use semantic tables on desktop and structured record cards on mobile. Keep row actions in a context menu or inspector drawer. Design loading, empty, error and no-results states. Do not introduce pagination unless collection size warrants it.

### Status indicators
Use consistent labels across all roles: Active, Pending, Draft, Submitted, Awaiting release, Released, Paid, Overdue and Suspended. Pair labels with icons or text; colour alone is insufficient.

### Navigation
Public desktop navigation is compact and grouped by audience intent. Public mobile navigation uses a drawer with an obvious close action and primary CTA. Authenticated workspaces use role-specific left navigation, a compact route-aware topbar, profile and notifications. Active route must be obvious.

### Feedback and data visualisation
Use toasts for short confirmations, inline callouts for contextual errors, empty states for missing content and confirmation dialogs only for consequential actions. Charts require title, unit/period, labels and a useful text/table equivalent where practical. Never draw data that is not present in the database.

## 5. Public website

### Navigation architecture
- Learn: Academies, Programmes, Find a Tutor.
- Digital Studio: Technology Services, Creative Services, Project Request.
- For Schools: Partnership overview, school programmes, partner onboarding.
- Our Work: Client projects, case studies, Kids Corner / student work.
- Resources: News Corner, articles, learning resources, FAQ.
- About: Story, mission and contact.

Persistent actions: Portal Login (quiet / outline) and Explore Programmes (primary). On mobile, put the primary action at the bottom of the navigation drawer.

### Homepage narrative
1. Announcement strip only when there is a real announcement.
2. Header with logo, audience-based navigation and portal login.
3. Hero with a clear headline, concise positioning, two deliberate CTAs and one brand visual.
4. Four audience pathways: Learners & Parents, Schools, Businesses & Organisations, Creative Collaborators.
5. Learn / Build / Create / Partner ecosystem.
6. Featured academies with access to the full programme catalogue.
7. Services and capability cards with real output examples.
8. Selected work: client case studies and student projects clearly distinguished.
9. How it works / learning method.
10. Schools and organisations partnership section.
11. Verified testimonials, achievements or evidence only when available.
12. Resources / recent insights.
13. Final conversion section and complete footer.

Proposed hero direction: “Ideas become skills. Skills become possibilities.” Supporting message: “Practical education, creative development and digital technology solutions for people, schools and businesses.”

### Public templates
- Listings: clear intro, category filters, search when useful, composed cards and sensible pagination/progressive loading.
- Detail pages: context, benefits, who it is for, what is included, process, evidence, FAQs and one primary CTA.
- Project request: qualification flow for project type, context, goals, timeline/budget where appropriate and contact details.
- School partnership: benefits, delivery models, requirements, process, evidence and application.
- Contact: direct contact options, accessible form and clear expectations.
- Portfolio: problem, approach, deliverables and verified outcome; separate student creations from commissioned client work.

## 6. Five authenticated workspaces

Shared foundations: route guards remain authoritative; data is scoped to the signed-in user, assigned learner, institution or permission; every data-backed screen supports loading, error and empty states.

### 6.1 Student — My Learning
**Primary job:** know what to learn next and complete it with confidence.

Navigation: Overview, My Learning / Courses, Assignments, Assessments, Class Schedule, Live Classrooms, Resources, Achievements, eligible Billing, Support and Settings.

Dashboard hierarchy:
1. Welcome and current learning track.
2. Continue learning feature with next lesson and progress.
3. Upcoming class / Join class state.
4. Assignments due and assessment readiness.
5. Progress by subject or track.
6. Recent feedback and achievements.

The assessment hub separates Available now, Submitted / awaiting release and Released results. Passcode entry and eligibility errors must be specific. The timed runner is distraction-reduced, with visible remaining time, question progress, save state and submit confirmation. Preserve autosave and expiry finalisation. Keep language encouraging and age-aware.

### 6.2 Parent — Family Learning
**Primary job:** understand each linked child's learning, decisions and payments.

Navigation: Family Overview, My Children, Progress & Milestones, Assignments, Assessments & Results, Timetable, Resources, Payments & Receipts, Messages, Support and Settings.

A persistent child switcher appears across relevant pages. Family-wide totals must be distinguished from selected-child data.

Dashboard hierarchy:
1. Family summary and child switcher.
2. Selected child's progress and programme.
3. Upcoming classes and outstanding work.
4. Recent assessment outcomes and released reports.
5. Tuition status, payments and receipts.
6. Tutor communication.

Enrollment is guided with clear plan/subject selection, price summary, Paystack handoff, verification result and next steps. A client-side return from checkout is never proof of a verified payment.

### 6.3 Tutor / staff — Teaching Studio
**Primary job:** prepare, teach, review learner work and understand what needs attention.

Navigation: Overview, My Learners, Classes & Attendance, Assignments & Review, Assessment Studio, Milestones, Resources, Subjects, permission-scoped Credentials, eligible Earnings / Billing, Support and Settings.

Dashboard hierarchy:
1. Today's timetable and live class entry.
2. Learner totals and assignment review queue.
3. Upcoming classes and attendance.
4. Work awaiting grading / result release.
5. Recently active learners.

Learner directory uses All / School-assigned / Private segments, filters and a right-side learner inspector. Assignment review uses a split queue and grading pane on desktop and a stacked detail flow on mobile. Assessment Studio separates Library, Authoring, Live Responses / Grading and Settings into top-level modes. History must not be buried beneath a long editor.

### 6.4 School administrator — School Command
**Primary job:** manage the institution's learners, classes, staff coordination and academic outcomes.

Navigation: Overview, Learner Roster, Onboard Learners, Assessments, Assessment History, Learner Insights, Class Schedules, Class Links, Credentials, Resources, Programme & Billing, Support and Settings.

Dashboard hierarchy:
1. School identity, academic period and quick actions.
2. Learner / class / active programme overview.
3. Upcoming assessments and schedules.
4. Learner progress and attendance.
5. Recent activity and onboarding queue.

All school data is institution-scoped. Roster filters include canonical grade/class and learner status. Bulk CSV onboarding includes preview, validation, duplicate detection, import result and downloadable error report. Assessment overview and assessment history remain separate destinations.

### 6.5 Super administrator — Platform Command
**Primary job:** operate the whole platform, resolve exceptions and make safe changes.

Navigation groups:
- Command: Overview, Activity & Audit.
- People & Access: Users & Roles, Scholars, Parents, Faculty & Staff, Tutor Subjects.
- Institutions: Schools, School Onboarding, Schedules.
- Learning Operations: Assessments, Assessment History, Resources, Agreements.
- Website Studio: Pages CMS, Programmes, Services, Portfolio, Kids Projects, News & Blog.
- Finance: Billing, Paystack reconciliation, tutor wallets / withdrawals.
- Platform: Approvals, Notifications, Reports, Settings, Support.

Dashboard hierarchy:
1. Operational overview with real KPIs and date context.
2. Priority queue: approvals, payment exceptions and unresolved inquiries.
3. Learner / institution / staff trends.
4. Revenue and payment reconciliation.
5. Latest audit activity.
6. Permission-aware quick actions.

Use master-detail directories and right-side inspectors instead of rows crowded with buttons. Global search supports a keyboard shortcut. Dangerous changes require explicit confirmation and an audit event. Impersonation shows a persistent banner and safe exit. Effective permissions are authoritative; a selected tab or client state is never an authorisation source.

## 7. Responsive behaviour

Breakpoints: small 0–639 px; medium 640–767 px; tablet 768–1023 px; desktop 1024–1279 px; wide 1280 px+.

- Public navigation becomes a drawer on mobile. Hero artwork moves below or beside copy without clipping.
- Public card grids collapse to one column when needed, with intentional image ratios.
- Workspace sidebars become drawers with backdrop, route-change close and Escape support.
- Dashboard grids collapse to one column; important metrics remain near the top.
- Data tables become record cards on small screens, not horizontal page overflow.
- Sticky controls never cover form fields or mobile keyboard focus.
- Provide at least 44 × 44 px touch targets where practical and respect safe-area insets.

## 8. Accessibility and content integrity

Target WCAG 2.2 AA on all new and modified surfaces:
- Semantic landmarks, heading order and form labels.
- Full keyboard access and visible focus.
- Contrast checked against final colours.
- No colour-only state communication.
- Meaningful alt text for informative imagery; empty alt for decoration.
- Dialog focus management and Escape behaviour.
- Reduced motion and no flashing content.
- Clear error text and announced async feedback.
- Correct table headers and captions where needed.
- Plain language and actionable empty states.

Never invent users, schools, transactions, outcomes, testimonials or metrics in production. Prototype data must be marked as sample/demo. Distinguish client work from student work. Use Awaiting release and Released consistently. Explain payment, submission and application states.

## 9. UX state catalogue

Every data-backed page must account for: initial loading, loaded records, empty first-use, no results after filtering, recoverable error with retry, access denied, offline/network interruption where relevant, pending action, success confirmation and destructive confirmation/failure.

Design the error and empty paths as carefully as the happy path.

## 10. Engineering guardrails

This is a presentation and interaction redesign, not permission to rewrite domain logic.

Preserve:
- Firebase Authentication and Firestore identity/application data.
- Existing Netlify Functions and request/response contracts.
- Role-based route guards and server-side authorisation.
- Paystack initialization, verification and webhook reconciliation.
- Student onboarding, provisioning and credential compatibility.
- CBT authoring, timed attempts, autosave, scoring, result release and exports.
- School and tutor assignment boundaries.
- CMS and Cloudinary upload contracts.
- Deep links, query parameters, redirects, audit events and approvals.

Use existing correct components and services. Do not duplicate business logic in presentation components. Keep demo data out of production sources. Avoid broad Firestore schema changes as part of visual work. Make small commits on a feature branch. Run lint, TypeScript, build and relevant tests after each implementation slice.

## 11. Build sequence and acceptance criteria

| Stage | Deliverable | Acceptance |
|---|---|---|
| 0 | Tokens, typography, spacing and primitives | Consistent light/dark rendering |
| 1 | Public header, hero, footer and homepage | Visitors identify the offer and pathways immediately |
| 2 | Programme, service and portfolio templates | Dynamic content and empty states work |
| 3 | Enrolment, login, tutor and partnership flows | Existing auth and submission contracts pass |
| 4 | Student and parent workspaces | Correct data scope and payment workflow |
| 5 | Tutor and school workspaces | Assignment, assessment and institution scope |
| 6 | Super admin and CMS | Permissions, audit, approvals and editing pass |
| 7 | Responsive, accessibility and performance QA | No overflow, keyboard traps or critical regressions |

## 12. Design review checklist

Before accepting a screen:
- Is its purpose obvious in five seconds?
- Is there one clear primary action?
- Does the layout fit the user's role and task?
- Is the information hierarchy scannable?
- Are labels, statuses and amounts unambiguous?
- Are loading, empty and error states designed?
- Does it work at 360 px and desktop widths?
- Can it be used without a mouse?
- Does motion help rather than distract?
- Are route, permission and data contracts preserved?
- Is prototype data clearly labelled?

**Decision:** This document governs new interface work. Individual screens may extend it, but should not independently redefine colour, typography, spacing, motion or interaction patterns.


---

## 13. Figma design file and handoff

**Editable Figma file:** https://www.figma.com/design/gK1M6Dv3FGiNFxhbpKT1kk/Jaystarbliss-Studios-Product-Design-System-Experience

This Figma file is the visual companion to this master specification.

### File structure

The file uses three pages to fit the current Figma Starter plan:
1. `00 — Foundations`: editable brand palette specimen and typography samples.
2. `01 — Components`: reusable Button and Status component sets, plus a Metric Card component and instances.
3. `02 — Product Screens`: six editable, composed experiences:
   - Public website homepage
   - Student — My Learning
   - Parent — Family Learning
   - Tutor & Staff — Teaching Studio
   - School Admin — School Command
   - Super Admin — Platform Command

### Editable foundations

The file contains 79 Figma variables across four collections:
- `JB / Color / Light` — 28 colour variables.
- `JB / Color / Dark` — 28 colour variables.
- `JB / Spacing & Radius` — 18 numeric variables.
- `JB / Motion` — 5 timing variables.

It also contains 10 Plus Jakarta Sans text styles and 3 shadow/effect styles.

### Component inventory

- Button component set: Primary, Secondary and Tertiary.
- Status component set: Success, Warning, Info and Danger.
- Metric Card component: label, value and context text properties.

### Prototype data and design status

All dashboard names, figures, activity and learner records are illustrative. They are not connected to Firebase or live portal accounts. The compositions are intended for design review and iteration, not as evidence that the operational dashboards have already been implemented.

The Figma Starter plan currently limits this file to three pages and one mode per variable collection. Light and dark colour values are therefore kept in separate collections. This preserves both token sets without requiring an account upgrade.
