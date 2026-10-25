import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { JaystarblissIcon } from '../common/JaystarblissLogo';
import { 
  Menu, 
  X, 
  ChevronDown,
  Sun, 
  Moon, 
  Search
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useSearch } from '../../contexts/SearchContext';

const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { openSearch } = useSearch();
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>({
    programs: false,
    portfolio: false,
    resources: false
  });
  
  const dropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menus on route change & manage body scroll lock
  useEffect(() => {
    setMobileMenuOpen(false);
    setActiveDropdown(null);
    document.body.style.overflow = '';
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const handleMouseEnter = (menuKey: string) => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
    }
    setActiveDropdown(menuKey);
  };

  const handleMouseLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 180);
  };

  const toggleMobileSubmenu = (key: string) => {
    setMobileExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Nav link base class to ensure 100% identical height, baseline, padding and font sizing across all items
  const navLinkClass = (isActive: boolean) => `
    h-9 inline-flex items-center gap-1 px-2.5 xl:px-3 rounded-lg text-xs xl:text-sm font-bold whitespace-nowrap transition-all duration-150 select-none
    ${isActive 
      ? 'text-brand-red font-extrabold' 
      : isScrolled 
        ? 'text-slate-700 dark:text-slate-200 hover:text-brand-red hover:bg-black/5 dark:hover:bg-white/5' 
        : 'text-white/90 hover:text-white hover:bg-white/10'
    }
  `;

  return (
    <>
      <header 
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-200 ${
          isScrolled 
            ? 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-sm py-2.5 sm:py-3' 
            : 'bg-gradient-to-b from-black/40 via-transparent to-transparent py-3 sm:py-4'
        }`}
      >
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 max-w-7xl">
          <div className="flex items-center justify-between gap-2 xl:gap-4 h-11">
            
            {/* Brand Logo & Title */}
            <Link 
              to="/" 
              className="flex items-center gap-2 sm:gap-2.5 shrink min-w-0 z-50 group select-none"
              aria-label="Jaystarbliss Studios Homepage"
            >
              <JaystarblissIcon className="w-7 h-7 sm:w-9 sm:h-9 group-hover:scale-105 transition-transform shrink-0" />
              <span className={`font-black text-xs sm:text-sm xl:text-base tracking-tight whitespace-nowrap truncate transition-colors ${
                isScrolled ? 'text-brand-slate dark:text-white' : 'text-white'
              }`}>
                JAYSTARBLISS STUDIOS
              </span>
            </Link>

            {/* Desktop Navigation Row */}
            <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1.5 shrink-0" aria-label="Main Navigation">
              
              {/* Home */}
              <Link 
                to="/"
                className={navLinkClass(location.pathname === '/')}
              >
                Home
              </Link>

              {/* Programs with Dropdown */}
              <div 
                className="relative flex items-center"
                onMouseEnter={() => handleMouseEnter('programs')}
                onMouseLeave={handleMouseLeave}
              >
                <Link 
                  to="/programs"
                  className={navLinkClass(location.pathname.startsWith('/programs'))}
                >
                  <span>Programs</span>
                  <ChevronDown 
                    size={13} 
                    className={`transition-transform duration-200 shrink-0 ${activeDropdown === 'programs' ? 'rotate-180 text-brand-red' : 'opacity-70'}`} 
                  />
                </Link>

                {/* Programs Dropdown Menu */}
                {activeDropdown === 'programs' && (
                  <div 
                    className="absolute top-full left-0 w-72 pt-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                  >
                    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 dark:border-white/10 p-3 space-y-1">
                      <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Explore Learning Tracks
                      </div>
                      
                      <Link 
                        to="/programs?school=academic-excellence#programs-content" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">Academics &amp; Tutoring</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Foundational sciences, math &amp; WAEC/JAMB</div>
                      </Link>

                      <Link 
                        to="/programs?school=technology-programming#programs-content" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">Tech, Coding &amp; AI</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Scratch, Python, Web Dev &amp; Artificial Intelligence</div>
                      </Link>

                      <Link 
                        to="/programs?school=digital-literacy#programs-content" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">Digital Literacy &amp; Tools</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Touch typing, Microsoft Office, Excel &amp; Smart Search</div>
                      </Link>

                      <Link 
                        to="/programs?school=creative-design#programs-content" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">Creative Arts &amp; Design</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Graphic design, branding &amp; digital illustrations</div>
                      </Link>

                      <Link 
                        to="/programs?school=music-performing-arts#programs-content" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">Music &amp; Performing Arts</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Keyboard, piano, recorder, violin &amp; music theory</div>
                      </Link>

                      <Link 
                        to="/school-partnership" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">School Coding &amp; Tech Clubs</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Custom coding and robotics labs for partner schools</div>
                      </Link>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                        <Link 
                          to="/programs?tab=roadmap#roadmap-section" 
                          className="block px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-xs font-bold text-brand-red hover:bg-brand-red/10 transition-colors"
                        >
                          Visual Learning Roadmap
                        </Link>
                        <Link 
                          to="/programs?tab=catalog#catalog-section" 
                          className="block px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-brand-red hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          View Full Program Catalog
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Services */}
              <Link 
                to="/services"
                className={navLinkClass(location.pathname.startsWith('/services'))}
              >
                Services
              </Link>

              {/* Portfolio with Dropdown */}
              <div 
                className="relative flex items-center"
                onMouseEnter={() => handleMouseEnter('portfolio')}
                onMouseLeave={handleMouseLeave}
              >
                <Link 
                  to="/portfolio"
                  className={navLinkClass(location.pathname.startsWith('/portfolio') || location.pathname.startsWith('/magic-particles'))}
                >
                  <span>Portfolio</span>
                  <ChevronDown 
                    size={13} 
                    className={`transition-transform duration-200 shrink-0 ${activeDropdown === 'portfolio' ? 'rotate-180 text-brand-red' : 'opacity-70'}`} 
                  />
                </Link>

                {/* Portfolio Dropdown Menu */}
                {activeDropdown === 'portfolio' && (
                  <div 
                    className="absolute top-full left-0 w-72 pt-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                  >
                    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 dark:border-white/10 p-3 space-y-1">
                      <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Showcase &amp; Playgrounds
                      </div>
                      
                      <Link 
                        to="/portfolio" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">Kids Corner &amp; Arcade</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Interactive games built by young student coders</div>
                      </Link>

                      <Link 
                        to="/portfolio" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">Organisation Solutions</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Enterprise platforms, LMS, and institutional tools</div>
                      </Link>

                      <Link 
                        to="/magic-particles" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">Magic 3D Particles Lab</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Real-time Three.js gesture &amp; particle simulation</div>
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Resources with Dropdown */}
              <div 
                className="relative flex items-center"
                onMouseEnter={() => handleMouseEnter('resources')}
                onMouseLeave={handleMouseLeave}
              >
                <Link 
                  to="/resources"
                  className={navLinkClass(
                    location.pathname.startsWith('/resources') || 
                    location.pathname.startsWith('/blog') || 
                    location.pathname.startsWith('/faq')
                  )}
                >
                  <span>Resources</span>
                  <ChevronDown 
                    size={13} 
                    className={`transition-transform duration-200 shrink-0 ${activeDropdown === 'resources' ? 'rotate-180 text-brand-red' : 'opacity-70'}`} 
                  />
                </Link>

                {/* Resources Dropdown Menu */}
                {activeDropdown === 'resources' && (
                  <div 
                    className="absolute top-full left-0 w-72 pt-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                  >
                    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 dark:border-white/10 p-3 space-y-1">
                      <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Insights &amp; Knowledge
                      </div>
                      
                      <Link 
                        to="/blog" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">News Corner &amp; Bulletins</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Live announcements, events, and awards</div>
                      </Link>

                      <Link 
                        to="/blog" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">Blog &amp; Coding Guides</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">In-depth technical tutorials &amp; education articles</div>
                      </Link>

                      <Link 
                        to="/faq" 
                        className="block px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-brand-red">FAQ &amp; Help Center</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Common questions about admissions and services</div>
                      </Link>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <Link 
                          to="/resources" 
                          className="block px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-brand-red hover:bg-brand-red/10 transition-colors"
                        >
                          Explore All Resources
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* About */}
              <Link 
                to="/about"
                className={navLinkClass(location.pathname === '/about')}
              >
                About
              </Link>
            </nav>

            {/* Desktop Right Actions */}
            <div className="hidden lg:flex items-center gap-2 xl:gap-3 shrink-0">
              <button 
                onClick={openSearch}
                className={`p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${
                  isScrolled ? 'text-slate-700 dark:text-slate-200' : 'text-white/90 hover:text-white'
                }`}
                aria-label="Search site (Press Ctrl+K or /)"
                title="Search site (Ctrl+K or /)"
              >
                <Search size={18} />
              </button>
              
              <button 
                onClick={toggleTheme} 
                className={`p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${
                  isScrolled ? 'text-slate-700 dark:text-slate-200' : 'text-white/90 hover:text-white'
                }`}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              <Link 
                to="/contact" 
                className={navLinkClass(location.pathname === '/contact')}
              >
                Contact
              </Link>

              {/* Action CTA */}
              <Link 
                to="/portal" 
                className="relative inline-flex items-center justify-center overflow-hidden rounded-xl p-[1.5px] focus:outline-none hover:-translate-y-0.5 transition-all shadow-md shadow-brand-red/20 group shrink-0"
              >
                <span className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#B91C1C_0%,#F8FAFC_50%,#B91C1C_100%)]" />
                <span className="inline-flex h-full w-full items-center justify-center rounded-[10px] bg-brand-slate dark:bg-slate-900 px-3.5 xl:px-4 py-1.5 xl:py-2 text-[11px] xl:text-xs font-black uppercase tracking-wider text-white backdrop-blur-3xl transition-colors group-hover:bg-brand-red/90 whitespace-nowrap">
                  LOGIN / SIGNUP
                </span>
              </Link>
            </div>

            {/* Mobile Header Controls */}
            <div className="flex items-center gap-1 sm:gap-1.5 lg:hidden relative z-50 shrink-0">
              <button 
                onClick={openSearch}
                className={`p-1.5 sm:p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${
                  isScrolled ? 'text-brand-slate dark:text-white' : 'text-white'
                }`}
                aria-label="Search"
              >
                <Search size={18} />
              </button>
              
              <button 
                onClick={toggleTheme}
                className={`p-1.5 sm:p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${
                  isScrolled ? 'text-brand-slate dark:text-white' : 'text-white'
                }`}
                aria-label="Toggle Theme"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              <button 
                className={`p-1.5 sm:p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${
                  isScrolled ? 'text-brand-slate dark:text-white' : 'text-white'
                }`}
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open Navigation Menu"
              >
                <Menu size={22} />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Full-Screen Mobile Drawer (Complete view with dedicated top bar & scroll containment) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col w-full max-w-full h-full bg-white dark:bg-slate-950 overflow-hidden animate-in fade-in duration-200">
          
          {/* Mobile Menu Top Header Bar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0">
            <Link 
              to="/" 
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2.5"
            >
              <JaystarblissIcon className="w-8 h-8" />
              <span className="font-black text-sm text-brand-slate dark:text-white tracking-tight">
                JAYSTARBLISS STUDIOS
              </span>
            </Link>

            <div className="flex items-center gap-2">
              <button 
                onClick={toggleTheme}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Toggle Theme"
              >
                {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
              </button>
              
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close Navigation Menu"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Scrollable Navigation Body */}
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
            
            <nav className="flex flex-col gap-1">
              
              {/* Home */}
              <Link 
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between py-3 px-3 rounded-xl text-base font-bold transition-colors ${
                  location.pathname === '/' 
                    ? 'bg-brand-red/10 text-brand-red' 
                    : 'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <span>Home</span>
              </Link>

              {/* Programs (Accordion) */}
              <div className="rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleMobileSubmenu('programs')}
                  className="w-full py-3 px-3 flex items-center justify-between text-base font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-xl transition-colors"
                >
                  <span>Programs</span>
                  <ChevronDown size={16} className={`transition-transform duration-200 ${mobileExpanded.programs ? 'rotate-180 text-brand-red' : 'text-slate-400'}`} />
                </button>
                {mobileExpanded.programs && (
                  <div className="pl-3 pr-2 py-2 space-y-1 bg-slate-50/70 dark:bg-slate-900/60 rounded-xl my-1 border border-slate-100 dark:border-slate-800">
                    <Link to="/programs?tab=roadmap#roadmap-section" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-bold text-brand-red bg-red-50 dark:bg-red-950/40 rounded-lg">
                      Visual Learning Roadmap
                    </Link>
                    <Link to="/programs?tab=catalog#catalog-section" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      Full Programs Catalog
                    </Link>
                    <Link to="/programs?school=academic-excellence#programs-content" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      Academics &amp; Tutoring
                    </Link>
                    <Link to="/programs?school=technology-programming#programs-content" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      Coding, Tech &amp; AI
                    </Link>
                    <Link to="/programs?school=digital-literacy#programs-content" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      Digital Literacy &amp; Tools
                    </Link>
                    <Link to="/programs?school=creative-design#programs-content" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      Creative Arts &amp; Design
                    </Link>
                    <Link to="/programs?school=music-performing-arts#programs-content" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      Music &amp; Performing Arts
                    </Link>
                    <Link to="/school-partnership" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      School Coding &amp; Tech Clubs
                    </Link>
                  </div>
                )}
              </div>

              {/* Services */}
              <Link 
                to="/services"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between py-3 px-3 rounded-xl text-base font-bold transition-colors ${
                  location.pathname.startsWith('/services') 
                    ? 'bg-brand-red/10 text-brand-red' 
                    : 'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <span>Services</span>
              </Link>

              {/* Portfolio (Accordion) */}
              <div className="rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleMobileSubmenu('portfolio')}
                  className="w-full py-3 px-3 flex items-center justify-between text-base font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-xl transition-colors"
                >
                  <span>Portfolio</span>
                  <ChevronDown size={16} className={`transition-transform duration-200 ${mobileExpanded.portfolio ? 'rotate-180 text-brand-red' : 'text-slate-400'}`} />
                </button>
                {mobileExpanded.portfolio && (
                  <div className="pl-3 pr-2 py-2 space-y-1 bg-slate-50/70 dark:bg-slate-900/60 rounded-xl my-1 border border-slate-100 dark:border-slate-800">
                    <Link to="/portfolio" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      Kids Corner &amp; Arcade Games
                    </Link>
                    <Link to="/portfolio" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      Organisation Case Studies
                    </Link>
                    <Link to="/magic-particles" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      Magic 3D Particles Playground
                    </Link>
                  </div>
                )}
              </div>

              {/* Resources (Accordion) */}
              <div className="rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleMobileSubmenu('resources')}
                  className="w-full py-3 px-3 flex items-center justify-between text-base font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-xl transition-colors"
                >
                  <span>Resources</span>
                  <ChevronDown size={16} className={`transition-transform duration-200 ${mobileExpanded.resources ? 'rotate-180 text-brand-red' : 'text-slate-400'}`} />
                </button>
                {mobileExpanded.resources && (
                  <div className="pl-3 pr-2 py-2 space-y-1 bg-slate-50/70 dark:bg-slate-900/60 rounded-xl my-1 border border-slate-100 dark:border-slate-800">
                    <Link to="/blog" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      News Corner Bulletins
                    </Link>
                    <Link to="/blog" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      Tech Blog &amp; Tutorials
                    </Link>
                    <Link to="/faq" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red">
                      FAQ &amp; Help Center
                    </Link>
                  </div>
                )}
              </div>

              {/* About & Contact */}
              <Link 
                to="/about"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between py-3 px-3 rounded-xl text-base font-bold transition-colors ${
                  location.pathname === '/about' 
                    ? 'bg-brand-red/10 text-brand-red' 
                    : 'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <span>About</span>
              </Link>
              
              <Link
                to="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between py-3 px-3 rounded-xl text-base font-bold transition-colors ${
                  location.pathname === '/contact' 
                    ? 'bg-brand-red/10 text-brand-red' 
                    : 'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <span>Contact</span>
              </Link>
            </nav>

            {/* Bottom Actions */}
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3">
              <Link
                to="/portal"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full bg-brand-red hover:bg-red-700 text-white py-3.5 rounded-xl font-bold text-center flex items-center justify-center gap-2 uppercase tracking-wider text-sm shadow-md shadow-brand-red/20 transition-colors"
              >
                PORTAL LOGIN / SIGNUP
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white py-3.5 rounded-xl font-bold text-center flex items-center justify-center gap-2 uppercase tracking-wider text-sm transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                ENROLL IN PROGRAMS
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
