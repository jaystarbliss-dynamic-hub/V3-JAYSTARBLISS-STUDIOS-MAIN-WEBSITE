import { useState, type ReactNode } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen, BriefcaseBusiness,
  CalendarDays, Check, ChevronDown, ChevronRight, CreditCard, FileCheck2, FileText,
  GraduationCap, LayoutDashboard, LifeBuoy, Menu, MoreHorizontal, Palette, Search,
  Settings2, ShieldCheck, Sparkles, Trophy, Users, Wallet, X, Zap
} from "lucide-react";
import "./DesignPreview.css";

type View = "public" | "student" | "parent" | "tutor" | "school" | "admin";
type IconType = typeof LayoutDashboard;
type NavItem = { label: string; icon: IconType };

const views: { id: View; label: string; subtitle: string }[] = [
  { id: "public", label: "Public website", subtitle: "The brand experience" },
  { id: "student", label: "Student", subtitle: "My Learning" },
  { id: "parent", label: "Parent", subtitle: "Family Learning" },
  { id: "tutor", label: "Tutor & staff", subtitle: "Teaching Studio" },
  { id: "school", label: "School admin", subtitle: "School Command" },
  { id: "admin", label: "Super admin", subtitle: "Platform Command" },
];

const roleConfig: Record<Exclude<View, "public">, {
  greeting: string; description: string; initials: string; profile: string;
  links: NavItem[]; metrics: { label: string; value: string; note: string; tone: string; icon: IconType }[];
}> = {
  student: {
    greeting: "Good morning, Alex", description: "A little progress each day adds up to big results. Here's your learning space.",
    initials: "AS", profile: "Alex Smith",
    links: [{label:"Overview",icon:LayoutDashboard},{label:"My learning",icon:BookOpen},{label:"Assignments",icon:FileText},{label:"Assessments",icon:FileCheck2},{label:"Class schedule",icon:CalendarDays},{label:"Achievements",icon:Trophy}],
    metrics: [{label:"Learning progress",value:"68%",note:"+8% this month",tone:"blue",icon:Activity},{label:"Active courses",value:"4",note:"Across 2 learning tracks",tone:"violet",icon:BookOpen},{label:"Tasks to complete",value:"3",note:"1 due tomorrow",tone:"amber",icon:FileText},{label:"Achievements",value:"12",note:"2 new this month",tone:"green",icon:Trophy}],
  },
  parent: {
    greeting: "Welcome back, Jordan", description: "Stay close to every milestone. Here's the latest from your family learning space.",
    initials: "JT", profile: "Jordan Taylor",
    links: [{label:"Family overview",icon:LayoutDashboard},{label:"My children",icon:Users},{label:"Progress & milestones",icon:Activity},{label:"Assessments & results",icon:FileCheck2},{label:"Timetable",icon:CalendarDays},{label:"Payments",icon:CreditCard},{label:"Messages",icon:Wallet}],
    metrics: [{label:"Children enrolled",value:"2",note:"Both actively learning",tone:"blue",icon:Users},{label:"Learning milestones",value:"14 / 18",note:"4 milestones in progress",tone:"violet",icon:Trophy},{label:"Upcoming classes",value:"3",note:"Next class today, 4:00 PM",tone:"amber",icon:CalendarDays},{label:"Tuition status",value:"Up to date",note:"Next review: 1 Dec",tone:"green",icon:Wallet}],
  },
  tutor: {
    greeting: "Good morning, Taylor", description: "Your teaching day, learner activity and review priorities in one focused workspace.",
    initials: "TM", profile: "Taylor Morgan",
    links: [{label:"Overview",icon:LayoutDashboard},{label:"My learners",icon:Users},{label:"Classes & attendance",icon:CalendarDays},{label:"Assignments & review",icon:FileText},{label:"Assessment studio",icon:FileCheck2},{label:"Resources",icon:BookOpen}],
    metrics: [{label:"Assigned learners",value:"28",note:"Across 3 groups",tone:"blue",icon:Users},{label:"Awaiting review",value:"7",note:"3 due for feedback today",tone:"amber",icon:FileCheck2},{label:"Classes today",value:"4",note:"Next session in 35 min",tone:"violet",icon:CalendarDays},{label:"Attendance",value:"94%",note:"This month",tone:"green",icon:Activity}],
  },
  school: {
    greeting: "Good morning, Administrator", description: "A clear picture of your learners, academic activity and what needs attention today.",
    initials: "SA", profile: "School Admin",
    links: [{label:"Overview",icon:LayoutDashboard},{label:"Learner roster",icon:Users},{label:"Onboard learners",icon:GraduationCap},{label:"Assessments",icon:FileCheck2},{label:"Learner insights",icon:Activity},{label:"Class schedules",icon:CalendarDays}],
    metrics: [{label:"Active learners",value:"486",note:"Across 12 grade groups",tone:"blue",icon:Users},{label:"Active classes",value:"18",note:"4 sessions scheduled today",tone:"violet",icon:BookOpen},{label:"Assessment activity",value:"6",note:"2 awaiting review",tone:"amber",icon:FileCheck2},{label:"Attendance rate",value:"96.2%",note:"+2.1% this term",tone:"green",icon:Activity}],
  },
  admin: {
    greeting: "Good morning, Administrator", description: "Your operational overview across learning, institutions, finance and platform activity.",
    initials: "AD", profile: "Platform Admin",
    links: [{label:"Command overview",icon:LayoutDashboard},{label:"Approvals & requests",icon:ShieldCheck},{label:"Scholars & students",icon:GraduationCap},{label:"Institutions",icon:BriefcaseBusiness},{label:"Website studio",icon:Palette},{label:"Finance & billing",icon:Wallet},{label:"Analytics & reports",icon:Activity},{label:"Audit activity",icon:FileText}],
    metrics: [{label:"Active learners",value:"1,284",note:"+6.8% this quarter",tone:"blue",icon:Users},{label:"Partner schools",value:"24",note:"3 applications in review",tone:"violet",icon:BriefcaseBusiness},{label:"Pending approvals",value:"12",note:"5 require attention",tone:"amber",icon:ShieldCheck},{label:"Reconciled revenue",value:"₦8.42m",note:"Sample reporting period",tone:"green",icon:Wallet}],
  },
};

function BrandMark({ light = false }: { light?: boolean }) {
  return <div className="jb-brand"><span className="jb-brand-mark">J</span><span className={light ? "jb-brand-name light" : "jb-brand-name"}>JAYSTARBLISS <small>STUDIOS</small></span></div>;
}
function ActionButton({ children, variant = "primary" }: { children: ReactNode; variant?: "primary" | "secondary" | "quiet" }) {
  return <button type="button" className={"jb-button " + variant}>{children}</button>;
}
function PublicSite() {
  return <div className="jb-public">
    <div className="jb-announcement"><Sparkles size={13}/> A connected ecosystem for learning, creativity and technology <ArrowRight size={13}/></div>
    <header className="jb-public-header">
      <BrandMark/>
      <nav aria-label="Main navigation" className="jb-public-nav"><a href="#learn">Learn <ChevronDown size={13}/></a><a href="#studio">Digital Studio <ChevronDown size={13}/></a><a href="#schools">For Schools</a><a href="#work">Our Work</a><a href="#about">About</a></nav>
      <div className="jb-public-actions"><button className="jb-login">Portal login</button><ActionButton>Explore programmes <ArrowUpRight size={15}/></ActionButton></div>
      <button className="jb-mobile-menu" aria-label="Open menu"><Menu size={21}/></button>
    </header>
    <main>
      <section className="jb-hero">
        <div className="jb-hero-glow one"/><div className="jb-hero-glow two"/>
        <div className="jb-hero-inner">
          <div className="jb-hero-copy">
            <div className="jb-eyebrow light"><span/> EDUCATION · TECHNOLOGY · CREATIVITY</div>
            <h1>Ideas become skills.<br/><em>Skills become</em><br/>possibilities.</h1>
            <p>Practical education, creative development and digital technology solutions for people, schools and businesses.</p>
            <div className="jb-hero-actions"><ActionButton>Explore learning pathways <ArrowRight size={16}/></ActionButton><button className="jb-hero-link">Discover our studio <ArrowUpRight size={15}/></button></div>
            <div className="jb-proof-row"><span><Check size={14}/> Learning built around doing</span><span><Check size={14}/> Solutions made for impact</span></div>
          </div>
          <div className="jb-orbit-art" aria-label="Decorative orbital illustration">
            <div className="jb-orbit-ring ring-a"/><div className="jb-orbit-ring ring-b"/><div className="jb-orbit-ring ring-c"/>
            <div className="jb-orbit-core"><span>JB</span><small>STUDIOS</small></div>
            <div className="jb-orbit-node node-a"><BookOpen size={18}/></div><div className="jb-orbit-node node-b"><Palette size={18}/></div><div className="jb-orbit-node node-c"><Zap size={18}/></div>
            <div className="jb-float-card card-top"><span className="jb-mini-icon red"><GraduationCap size={16}/></span><span><b>Learning pathways</b><small>Skills for the future</small></span></div>
            <div className="jb-float-card card-bottom"><span className="jb-mini-icon blue"><BriefcaseBusiness size={16}/></span><span><b>Digital solutions</b><small>Ideas, engineered</small></span></div>
          </div>
        </div>
        <div className="jb-hero-bottom"><span>ONE ECOSYSTEM. MANY POSSIBILITIES.</span><span>SCROLL TO EXPLORE <ArrowDownRight size={14}/></span></div>
      </section>
      <section className="jb-pathways" id="learn">
        <div className="jb-section-heading"><div><div className="jb-eyebrow"><span/> FIND YOUR PATH</div><h2>Where would you like<br/>to <em>go next?</em></h2></div><p>Start with what you want to achieve. We’ll help you find the right way into the Jaystarbliss ecosystem.</p></div>
        <div className="jb-path-grid">
          <article className="jb-path-card learner"><span className="jb-path-icon"><GraduationCap/></span><small>01 / LEARN</small><h3>Grow your skills.</h3><p>Explore practical learning pathways for children, teens and lifelong learners.</p><a href="#learn">Explore academies <ArrowUpRight size={15}/></a></article>
          <article className="jb-path-card business"><span className="jb-path-icon"><BriefcaseBusiness/></span><small>02 / BUILD</small><h3>Bring ideas to life.</h3><p>Build digital products, software and online experiences with our studio.</p><a href="#studio">Explore services <ArrowUpRight size={15}/></a></article>
          <article className="jb-path-card creative"><span className="jb-path-icon"><Palette/></span><small>03 / CREATE</small><h3>Make something matter.</h3><p>Turn ideas into distinctive visual identities and creative experiences.</p><a href="#studio">Explore creative work <ArrowUpRight size={15}/></a></article>
          <article className="jb-path-card school"><span className="jb-path-icon"><Users/></span><small>04 / PARTNER</small><h3>Move forward together.</h3><p>Bring structured technology and learning programmes into your school.</p><a href="#schools">Partner with us <ArrowUpRight size={15}/></a></article>
        </div>
      </section>
      <section className="jb-ecosystem" id="studio">
        <div className="jb-ecosystem-copy"><div className="jb-eyebrow light"><span/> THE JAYSTARBLISS ECOSYSTEM</div><h2>Different journeys.<br/><em>One connected vision.</em></h2><p>From a learner's first line of code to a school's digital transformation, we bring education, technology and creativity together.</p><ActionButton variant="secondary">Explore the ecosystem <ArrowRight size={15}/></ActionButton></div>
        <div className="jb-ecosystem-list"><div><span>01</span><b>Education & learning</b><small>Academies · Tutoring · Digital skills</small><ArrowUpRight/></div><div><span>02</span><b>Technology & engineering</b><small>Websites · Applications · Systems</small><ArrowUpRight/></div><div><span>03</span><b>Creative services</b><small>Branding · Design · Digital media</small><ArrowUpRight/></div><div><span>04</span><b>Schools & partnerships</b><small>Clubs · Institutional programmes · Support</small><ArrowUpRight/></div></div>
      </section>
      <section className="jb-final-cta" id="schools"><div><div className="jb-eyebrow"><span/> LET'S MAKE THE NEXT STEP COUNT</div><h2>Every great outcome<br/>starts with a <em>conversation.</em></h2></div><ActionButton>Talk to Jaystarbliss <ArrowUpRight size={16}/></ActionButton></section>
    </main>
    <footer className="jb-public-footer"><BrandMark light/><span>Learn. Build. Create. Grow.</span><small>© Jaystarbliss Studios · Design direction preview</small></footer>
  </div>;
}
function MetricCard({ metric }: { metric: (typeof roleConfig.student.metrics)[number] }) {
  const Icon = metric.icon;
  return <article className="jb-metric"><div className="jb-metric-top"><span>{metric.label}</span><i className={"jb-metric-icon " + metric.tone}><Icon size={17}/></i></div><strong>{metric.value}</strong><small><span className={metric.tone}>{metric.note}</span></small></article>;
}
function BarChart({ values, labels }: { values: number[]; labels: string[] }) {
  return <div className="jb-chart"><div className="jb-chart-y"><span>100</span><span>75</span><span>50</span><span>25</span></div><div className="jb-chart-bars">{values.map((value,i)=><div className="jb-chart-col" key={labels[i]}><div className="jb-chart-track"><i style={{height:value+"%"}}/></div><small>{labels[i]}</small></div>)}</div></div>;
}
function Dashboard({ view }: { view: Exclude<View,"public"> }) {
  const config = roleConfig[view];
  const [selectedNav,setSelectedNav] = useState(config.links[0].label);
  const [sidebarOpen,setSidebarOpen] = useState(false);
  return <div className="jb-workspace">
    {sidebarOpen && <button aria-label="Close navigation" className="jb-drawer-backdrop" onClick={()=>setSidebarOpen(false)}/>}
    <aside className={"jb-sidebar "+(sidebarOpen?"open":"")}>
      <div className="jb-sidebar-brand"><BrandMark light/><button className="jb-close-drawer" aria-label="Close menu" onClick={()=>setSidebarOpen(false)}><X size={18}/></button></div>
      <div className="jb-sidebar-label">WORKSPACE</div>
      <nav className="jb-side-nav" aria-label="Workspace navigation">
        {config.links.map(item=>{const Icon=item.icon;return <button type="button" key={item.label} className={selectedNav===item.label?"active":""} onClick={()=>{setSelectedNav(item.label);setSidebarOpen(false);}}><Icon size={17}/><span>{item.label}</span>{item.label==="Approvals & requests"&&<i className="jb-nav-count">12</i>}</button>;})}
      </nav>
      <div className="jb-sidebar-spacer"/>
      <div className="jb-help-card"><span><LifeBuoy size={17}/></span><b>Need a hand?</b><small>Our support team is here to help.</small><button type="button">Visit help centre <ArrowUpRight size={13}/></button></div>
      <button className="jb-side-settings" type="button"><Settings2 size={16}/> Settings</button>
      <div className="jb-sidebar-profile"><span className="jb-avatar">{config.initials}</span><span><b>{config.profile}</b><small>{views.find(v=>v.id===view)?.label}</small></span><MoreHorizontal size={17}/></div>
    </aside>
    <div className="jb-dashboard-main">
      <header className="jb-work-topbar"><button className="jb-open-drawer" aria-label="Open navigation" onClick={()=>setSidebarOpen(true)}><Menu size={19}/></button><div className="jb-breadcrumb"><span>Workspace</span><ChevronRight size={13}/><b>{selectedNav}</b></div><div className="jb-topbar-actions"><label className="jb-search"><Search size={15}/><input aria-label="Search workspace" placeholder="Search anything..."/><kbd>⌘ K</kbd></label><button aria-label="Notifications" className="jb-icon-button"><Bell size={18}/><i/></button><span className="jb-avatar small">{config.initials}</span></div></header>
      <main className="jb-dashboard-content">
        <div className="jb-greeting"><div><div className="jb-eyebrow"><span/> {views.find(v=>v.id===view)?.subtitle.toUpperCase()}</div><h1>{config.greeting}</h1><p>{config.description}</p></div><div className="jb-date-chip"><CalendarDays size={15}/> Tuesday, 3 November</div></div>
        {view==="parent"&&<div className="jb-child-switcher"><span className="jb-child-avatar">AS</span><span><b>Alex Smith</b><small>Grade 6 · Coding & Robotics</small></span><ChevronDown size={16}/><span className="jb-child-divider"/><span className="jb-child-avatar second">MS</span><span><b>Mia Smith</b><small>Grade 3 · Digital Creators</small></span><button type="button">Switch child <ChevronDown size={13}/></button></div>}
        <div className="jb-metric-grid">{config.metrics.map(metric=><MetricCard key={metric.label} metric={metric}/>)}</div>

        {view==="student"&&<div className="jb-content-grid">
          <section className="jb-panel jb-continue"><div className="jb-panel-head"><div><small>KEEP YOUR MOMENTUM</small><h2>Continue learning</h2></div><button type="button">View all <ArrowUpRight size={14}/></button></div><div className="jb-course-feature"><div className="jb-course-art"><div className="jb-code-window"><span/><span/><span/><code>&lt; / &gt;</code></div></div><div className="jb-course-body"><span className="jb-tag blue">CODING & TECHNOLOGY</span><h3>Creative Web Development</h3><p>Module 04 · Building your first interactive page</p><div className="jb-progress-meta"><span>Course progress</span><b>68%</b></div><div className="jb-progress"><i style={{width:"68%"}}/></div><ActionButton>Continue lesson <ArrowRight size={15}/></ActionButton></div></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>COMING UP</small><h2>Your next class</h2></div><CalendarDays size={18}/></div><div className="jb-class-date"><b>04</b><span>NOV<br/>WED</span><i/></div><h3 className="jb-card-title">Creative Coding Lab</h3><p className="jb-muted">4:00 PM – 5:00 PM · Online classroom</p><div className="jb-class-footer"><span><span className="jb-live-dot"/> Starts tomorrow</span><button type="button">View schedule <ArrowRight size={14}/></button></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>YOUR NEXT STEPS</small><h2>Tasks to complete</h2></div><button type="button">See all <ArrowUpRight size={14}/></button></div><div className="jb-task"><span className="jb-task-icon amber"><FileText/></span><span><b>Design challenge</b><small>Creative Design · Due tomorrow</small></span><span className="jb-status pending">Due soon</span></div><div className="jb-task"><span className="jb-task-icon blue"><FileCheck2/></span><span><b>Digital literacy quiz</b><small>Digital Skills · 6 Nov</small></span><span className="jb-status info">Upcoming</span></div><div className="jb-task"><span className="jb-task-icon violet"><BookOpen/></span><span><b>Read module 4</b><small>Web Development · 8 Nov</small></span><span className="jb-status neutral">In progress</span></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>YOUR GROWTH</small><h2>Learning activity</h2></div><span className="jb-period">This week <ChevronDown size={13}/></span></div><BarChart values={[36,58,48,74,62,88,68]} labels={["Wed","Thu","Fri","Sat","Sun","Mon","Tue"]}/><div className="jb-chart-foot"><span><i/> Learning hours</span><b>6h 25m <small>this week</small></b></div></section>
        </div>}

        {view==="parent"&&<div className="jb-content-grid">
          <section className="jb-panel"><div className="jb-panel-head"><div><small>LEARNING AT A GLANCE</small><h2>Alex's learning journey</h2></div><button type="button">Full progress report <ArrowUpRight size={14}/></button></div><div className="jb-parent-progress"><div className="jb-progress-ring"><strong>76%</strong><small>overall</small></div><div className="jb-subject-progress"><div><span>Coding & Robotics</span><b>82%</b><i><em style={{width:"82%"}}/></i></div><div><span>Mathematics</span><b>74%</b><i><em style={{width:"74%"}}/></i></div><div><span>Digital Literacy</span><b>68%</b><i><em style={{width:"68%"}}/></i></div></div></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>UP NEXT</small><h2>Family timetable</h2></div><CalendarDays size={18}/></div><div className="jb-agenda-item"><span className="jb-agenda-time">4:00 PM</span><i className="agenda-blue"/><span><b>Creative Coding Lab</b><small>Alex · Online class</small></span></div><div className="jb-agenda-item"><span className="jb-agenda-time">5:30 PM</span><i className="agenda-red"/><span><b>Digital Creators</b><small>Mia · Studio session</small></span></div><button type="button" className="jb-panel-link">Open full calendar <ArrowRight size={14}/></button></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>RECENT UPDATE</small><h2>Assessment results</h2></div><button type="button">All results <ArrowUpRight size={14}/></button></div><div className="jb-result-row"><span className="jb-result-grade">A</span><span><b>Creative Computing</b><small>Alex · Released 2 Nov</small></span><strong>88%</strong></div><div className="jb-result-row"><span className="jb-result-grade second">B+</span><span><b>Digital Skills Check</b><small>Mia · Released 30 Oct</small></span><strong>81%</strong></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>ACCOUNT OVERVIEW</small><h2>Tuition & payments</h2></div><CreditCard size={18}/></div><div className="jb-payment-state"><span className="jb-payment-check"><Check size={17}/></span><span><b>Everything is up to date</b><small>No outstanding tuition payments</small></span></div><button type="button" className="jb-panel-link">View payment history <ArrowRight size={14}/></button></section>
        </div>}

        {view==="tutor"&&<div className="jb-content-grid">
          <section className="jb-panel"><div className="jb-panel-head"><div><small>YOUR TEACHING DAY</small><h2>Today's schedule</h2></div><button type="button">Open calendar <ArrowUpRight size={14}/></button></div><div className="jb-schedule-row"><span className="jb-schedule-time">09:00</span><i className="schedule-line blue-line"/><span className="jb-schedule-event"><b>Digital Literacy · Grade 5</b><small>Partner school · 18 learners</small><span className="jb-status success">Completed</span></span><span className="jb-schedule-time end">10:00</span></div><div className="jb-schedule-row"><span className="jb-schedule-time">14:00</span><i className="schedule-line red-line"/><span className="jb-schedule-event"><b>Creative Web Development</b><small>Private learners · 6 learners</small><span className="jb-status info">Upcoming</span></span><span className="jb-schedule-time end">15:00</span></div><div className="jb-schedule-row"><span className="jb-schedule-time">16:00</span><i className="schedule-line violet-line"/><span className="jb-schedule-event"><b>Creative Coding Lab</b><small>Online classroom · 12 learners</small><span className="jb-status pending">Starts soon</span></span><span className="jb-schedule-time end">17:00</span></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>NEEDS YOUR ATTENTION</small><h2>Review queue</h2></div><span className="jb-count-badge">7</span></div><div className="jb-review-item"><span className="jb-review-avatar">JT</span><span><b>Jayden T.</b><small>Design challenge · Grade 5</small></span><span className="jb-status pending">Review</span></div><div className="jb-review-item"><span className="jb-review-avatar lavender">MS</span><span><b>Mia S.</b><small>Digital skills quiz</small></span><span className="jb-status pending">Review</span></div><div className="jb-review-item"><span className="jb-review-avatar peach">AK</span><span><b>Amara K.</b><small>Module 3 assignment</small></span><span className="jb-status pending">Review</span></div><button type="button" className="jb-panel-link">Open grading queue <ArrowRight size={14}/></button></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>LEARNER ACTIVITY</small><h2>Recent learner progress</h2></div><button type="button">All learners <ArrowUpRight size={14}/></button></div><div className="jb-learner-row"><span className="jb-review-avatar">JT</span><span><b>Jayden Torru</b><small>Completed module 4</small></span><span className="jb-growth">+12%</span></div><div className="jb-learner-row"><span className="jb-review-avatar lavender">MS</span><span><b>Mia Smith</b><small>Submitted an assignment</small></span><span className="jb-growth">+8%</span></div><div className="jb-learner-row"><span className="jb-review-avatar peach">AK</span><span><b>Amara King</b><small>Achieved a new milestone</small></span><span className="jb-growth">+6%</span></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>CLASS ENGAGEMENT</small><h2>Attendance trend</h2></div><span className="jb-period">This month <ChevronDown size={13}/></span></div><BarChart values={[78,84,80,92,88,95,94]} labels={["W1","W2","W3","W4","W5","W6","W7"]}/><div className="jb-chart-foot"><span><i/> Attendance</span><b>94% <small>average</small></b></div></section>
        </div>}

        {view==="school"&&<div className="jb-content-grid">
          <section className="jb-panel"><div className="jb-panel-head"><div><small>ACADEMIC OVERVIEW</small><h2>Learner engagement</h2></div><span className="jb-period">This term <ChevronDown size={13}/></span></div><BarChart values={[68,76,71,82,88,84,93]} labels={["W1","W2","W3","W4","W5","W6","W7"]}/><div className="jb-chart-foot"><span><i/> Learning activity</span><b>+11.4% <small>this term</small></b></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>QUICK ACTIONS</small><h2>School operations</h2></div><MoreHorizontal size={18}/></div><div className="jb-quick-grid"><button type="button"><GraduationCap/>Onboard learners</button><button type="button"><FileCheck2/>Schedule assessment</button><button type="button"><CalendarDays/>Manage classes</button><button type="button"><FileText/>Export reports</button></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>RECENTLY ACTIVE</small><h2>Learner roster</h2></div><button type="button">View all learners <ArrowUpRight size={14}/></button></div><div className="jb-table-wrap"><table><thead><tr><th>Learner</th><th>Grade</th><th>Learning track</th><th>Activity</th><th>Status</th></tr></thead><tbody><tr><td><span className="jb-table-person"><i>JT</i><b>Jayden Torru</b></span></td><td>Grade 5</td><td>Coding & Robotics</td><td>Today</td><td><span className="jb-status success">Active</span></td></tr><tr><td><span className="jb-table-person"><i className="lavender">MS</i><b>Mia Smith</b></span></td><td>Grade 3</td><td>Digital Creators</td><td>Yesterday</td><td><span className="jb-status success">Active</span></td></tr><tr><td><span className="jb-table-person"><i className="peach">AK</i><b>Amara King</b></span></td><td>Grade 6</td><td>Digital Literacy</td><td>30 Oct</td><td><span className="jb-status neutral">On track</span></td></tr></tbody></table></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>UPCOMING</small><h2>Academic calendar</h2></div><CalendarDays size={18}/></div><div className="jb-agenda-item"><span className="jb-agenda-time">06 NOV</span><i className="agenda-red"/><span><b>Digital literacy assessment</b><small>Grade 5 · 09:00 AM</small></span></div><div className="jb-agenda-item"><span className="jb-agenda-time">09 NOV</span><i className="agenda-blue"/><span><b>Learning progress review</b><small>All grade groups</small></span></div></section>
        </div>}

        {view==="admin"&&<div className="jb-content-grid">
          <section className="jb-panel"><div className="jb-panel-head"><div><small>PLATFORM PERFORMANCE</small><h2>Operational activity</h2></div><span className="jb-period">Last 30 days <ChevronDown size={13}/></span></div><BarChart values={[48,56,52,68,64,78,86]} labels={["W1","W2","W3","W4","W5","W6","W7"]}/><div className="jb-chart-foot"><span><i/> Platform activity</span><b>+18.6% <small>sample trend</small></b></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>PRIORITY QUEUE</small><h2>Needs attention</h2></div><span className="jb-count-badge">12</span></div><div className="jb-priority-row"><i className="priority-amber"/><span><b>School applications</b><small>3 awaiting review</small></span><ChevronRight/></div><div className="jb-priority-row"><i className="priority-red"/><span><b>Payment reconciliation</b><small>2 require investigation</small></span><ChevronRight/></div><div className="jb-priority-row"><i className="priority-blue"/><span><b>Tutor applications</b><small>7 awaiting approval</small></span><ChevronRight/></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>PLATFORM OPERATIONS</small><h2>Recent activity</h2></div><button type="button">Open audit log <ArrowUpRight size={14}/></button></div><div className="jb-activity-row"><span className="activity-dot green"/><span><b>School partnership approved</b><small>Institution workspace provisioned · 12 min ago</small></span><span className="jb-activity-type">Institution</span></div><div className="jb-activity-row"><span className="activity-dot blue"/><span><b>Payment successfully reconciled</b><small>Enrollment payment verified · 36 min ago</small></span><span className="jb-activity-type">Finance</span></div><div className="jb-activity-row"><span className="activity-dot red"/><span><b>New programme published</b><small>Digital Creators programme · 1 hr ago</small></span><span className="jb-activity-type">CMS</span></div></section>
          <section className="jb-panel"><div className="jb-panel-head"><div><small>ECOSYSTEM REACH</small><h2>Growth overview</h2></div><Activity size={18}/></div><div className="jb-growth-stat"><strong>1,284</strong><span>Active learners</span></div><div className="jb-growth-stat"><strong>24</strong><span>Partner institutions</span></div><div className="jb-growth-stat"><strong>36</strong><span>Active tutors & staff</span></div></section>
        </div>}
        <div className="jb-demo-note"><ShieldCheck size={15}/> Design prototype only — displayed records and metrics are sample data, not live platform information.</div>
      </main>
    </div>
  </div>;
}

export default function DesignPreview() {
  const [activeView,setActiveView] = useState<View>("public");
  const active = views.find(view=>view.id===activeView)!;
  return <div className="jb-preview">
    <header className="jb-review-bar"><div className="jb-review-brand"><BrandMark/><span className="jb-review-divider"/><span className="jb-review-label">DESIGN SYSTEM PREVIEW</span></div><div className="jb-review-status"><i/> PROPOSED DIRECTION · V1.0</div></header>
    <div className="jb-view-tabs" role="tablist" aria-label="Preview a product experience">
      {views.map(view=><button type="button" key={view.id} role="tab" aria-selected={activeView===view.id} className={activeView===view.id?"active":""} onClick={()=>setActiveView(view.id)}><span>{view.label}</span><small>{view.subtitle}</small></button>)}
    </div>
    <div className="jb-preview-caption"><div><span>JAYSTARBLISS STUDIOS</span><ChevronRight size={13}/><b>{active.label}</b></div><small>Explore the proposed {active.subtitle.toLowerCase()} visual direction</small></div>
    {activeView==="public"?<PublicSite/>:<Dashboard key={activeView} view={activeView}/>}
  </div>;
}
