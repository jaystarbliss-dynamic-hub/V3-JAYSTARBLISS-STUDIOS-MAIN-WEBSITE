import React, { useState } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  UserCheck,
  Briefcase,
  Building2,
  BarChart3,
  Settings,
  HelpCircle,
  LogOut,
  Search,
  Bell,
  Plus,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  RotateCcw,
} from 'lucide-react';
import type { WorkspaceSectionId } from './types';

interface PreviewAdminShellProps {
  activeSection: WorkspaceSectionId;
  onSelectSection: (section: WorkspaceSectionId) => void;
  counts: {
    activeTotal: number;
    rootsCount: number;
    pendingProposals: number;
    unassignedCount: number;
    archivedCount: number;
  };
  onCreateProgramme: () => void;
  onOpenQuickCreateModal?: () => void;
  onResetDemoData?: () => void;
  breadcrumbs?: Array<{ label: string; onClick?: () => void }>;
  headerTitle?: string;
  headerSubtitle?: string;
  headerActions?: React.ReactNode;
  globalSearchQuery?: string;
  onGlobalSearchChange?: (q: string) => void;
  embeddedInAdminLayout?: boolean;
  children: React.ReactNode;
}

const PRIMARY_SIDEBAR_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, active: false },
  { id: 'programs', label: 'Programs & Courses', icon: BookOpen, active: true },
  { id: 'students', label: 'Students', icon: Users, active: false },
  { id: 'parents', label: 'Parents', icon: UserCheck, active: false },
  { id: 'staff', label: 'Staff & Tutors', icon: Briefcase, active: false },
  { id: 'schools', label: 'Schools', icon: Building2, active: false },
  { id: 'reports', label: 'Reports', icon: BarChart3, active: false },
  { id: 'settings', label: 'Settings', icon: Settings, active: false },
  { id: 'support', label: 'Support', icon: HelpCircle, active: false },
];

export const PreviewAdminShell: React.FC<PreviewAdminShellProps> = ({
  activeSection,
  onSelectSection,
  counts,
  onCreateProgramme,
  onOpenQuickCreateModal,
  onResetDemoData,
  breadcrumbs,
  headerTitle,
  headerSubtitle,
  headerActions,
  globalSearchQuery = '',
  onGlobalSearchChange,
  embeddedInAdminLayout = false,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const WORKSPACE_TABS: Array<{
    id: WorkspaceSectionId;
    label: string;
    badge?: number;
  }> = [
    { id: 'catalogue', label: 'Catalogue' },
    { id: 'hierarchy', label: 'Hierarchy' },
    { id: 'curriculum', label: 'Curriculum' },
    {
      id: 'proposals',
      label: 'Tutor Proposals',
      badge: counts.pendingProposals > 0 ? counts.pendingProposals : undefined,
    },
    {
      id: 'archive-tools',
      label: 'Archive & Tools',
      badge: counts.unassignedCount > 0 ? counts.unassignedCount : undefined,
    },
    { id: 'overview', label: 'Programs Overview' },
  ];

  const mainWorkspaceContent = (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Top Search & Utility Bar (Only shown when standalone preview, since AdminLayout has its own topbar) */}
      {!embeddedInAdminLayout && (
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation drawer"
            >
              <Menu size={20} />
            </button>
            <div className="relative flex-1">
              <Search
                size={16}
                className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={globalSearchQuery}
                onChange={(e) => onGlobalSearchChange?.(e.target.value)}
                placeholder="Search anything..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-100/90 border border-transparent text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {onResetDemoData && (
              <button
                type="button"
                onClick={onResetDemoData}
                title="Reset demo data"
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw size={13} />
                <span>Reset Demo</span>
              </button>
            )}
            <button
              type="button"
              className="relative p-2 rounded-full text-slate-500 hover:bg-slate-100 transition-colors"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {counts.pendingProposals > 0 && (
                <span className="w-2 h-2 rounded-full bg-[#B91C1C] absolute top-1.5 right-1.5" />
              )}
            </button>

            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-900 font-bold text-xs flex items-center justify-center">
                SA
              </div>
              <span className="hidden sm:inline text-xs font-semibold text-slate-800">
                Super Admin
              </span>
              <ChevronDown size={14} className="text-slate-400 hidden sm:inline" />
            </div>
          </div>
        </header>
      )}

      {/* Workspace Body */}
      <div
        className={`flex-1 ${
          embeddedInAdminLayout
            ? 'space-y-5'
            : 'p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-6'
        }`}
      >
        {/* Top Breadcrumbs (shown on sub-screens like Hierarchy Manager, Curriculum Builder, etc.) */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex items-center flex-wrap gap-1.5 text-xs font-medium text-slate-500"
          >
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight size={13} className="text-slate-400 shrink-0" />}
                  {crumb.onClick && !isLast ? (
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      className="text-slate-500 hover:text-slate-900 transition-colors"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className={isLast ? 'text-slate-900 font-bold' : 'text-slate-500'}>
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        )}

        {/* Title Row + Primary Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {headerTitle || 'Programs & Courses'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {headerSubtitle || 'Manage all learning programmes, courses and curriculum'}
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            {headerActions ? (
              headerActions
            ) : (
              <>
                {onOpenQuickCreateModal && (
                  <button
                    type="button"
                    onClick={onOpenQuickCreateModal}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>Create Programme</span>
                  </button>
                )}
                {!onOpenQuickCreateModal && (
                  <button
                    type="button"
                    onClick={onCreateProgramme}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>Create Programme</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Horizontal Underline Navigation Tabs (Exactly matching Image 3 Top-Left) */}
        <div className="border-b border-slate-200 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
          <nav aria-label="Programs and courses views" className="flex items-center gap-6 sm:gap-8">
            {WORKSPACE_TABS.map((tab) => {
              const isActive =
                activeSection === tab.id ||
                (tab.id === 'archive-tools' && activeSection === 'unassigned') ||
                (tab.id === 'catalogue' && activeSection === 'editor');
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectSection(tab.id)}
                  className={`relative py-3 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? 'text-[#B91C1C] font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  {typeof tab.badge === 'number' && tab.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                        isActive
                          ? 'bg-red-100 text-[#B91C1C]'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#B91C1C] rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {activeSection === 'editor' && (
            <span className="text-xs font-semibold text-[#B91C1C] bg-red-50 px-2.5 py-1 rounded-md shrink-0">
              Full Programme Editor Active
            </span>
          )}
        </div>

        {/* Active View Content */}
        <div>{children}</div>
      </div>
    </div>
  );

  if (embeddedInAdminLayout) {
    return <div className="w-full">{mainWorkspaceContent}</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex font-sans">
      {/* Desktop Left Dark Navy Sidebar (Matches Image 2 & Image 3) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 bg-[#141C2E] text-white shrink-0 select-none">
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-[#B91C1C] flex items-center justify-center font-black text-white text-sm shadow-xs shrink-0">
            J
          </div>
          <div className="leading-tight">
            <div className="font-bold text-sm text-white tracking-tight">Jaystarbliss</div>
            <div className="font-semibold text-xs text-slate-300">Studios</div>
          </div>
        </div>

        {/* Primary Nav Items */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          {PRIMARY_SIDEBAR_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'programs') onSelectSection('catalogue');
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                  item.active
                    ? 'bg-[#B91C1C] text-white font-semibold shadow-xs'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={17} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Logout */}
        <div className="p-4 border-t border-white/10">
          <a
            href="/admin"
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut size={17} />
            <span>Logout</span>
          </a>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-[#141C2E] text-white flex flex-col h-full z-10 shadow-2xl">
            <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#B91C1C] flex items-center justify-center font-black text-white text-xs">
                  J
                </div>
                <span className="font-bold text-sm">Jaystarbliss Studios</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {PRIMARY_SIDEBAR_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'programs') onSelectSection('catalogue');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium ${
                      item.active
                        ? 'bg-[#B91C1C] text-white font-semibold'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      {mainWorkspaceContent}
    </div>
  );
};
