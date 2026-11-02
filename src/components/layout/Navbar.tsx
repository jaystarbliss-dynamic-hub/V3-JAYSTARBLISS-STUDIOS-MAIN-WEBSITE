import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, Sun, Moon, Search, Sparkles, GraduationCap, Layers, Cpu } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useSearch } from '../../contexts/SearchContext';

const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { openSearch } = useSearch();
  const location = useLocation();
  const userRole = typeof window !== 'undefined' ? sessionStorage.getItem('portalRole') : null;
  const currentUser = Boolean(userRole);

  const getDashboardLink = () => {
    switch (userRole?.toUpperCase()) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
        return '/admin';
      case 'STAFF':
        return '/portal/staff';
      case 'STUDENT':
        return '/portal/student';
      case 'PARENT':
        return '/portal/parent';
      case 'SCHOOL':
        return '/portal/school';
      case 'CLIENT':
        return '/portal/client';
      default:
        return '/portal/student';
    }
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <header className="sticky top-0 z-50 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800/80 shadow-xs">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <div className="flex justify-between items-center h-20">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src="/logo.png"
              alt="Jaystarbliss Studios Logo"
              width={44}
              height={44}
              fetchPriority="high"
              decoding="async"
              className="w-10 h-10 md:w-11 md:h-11 object-contain group-hover:scale-105 transition-transform"
            />
            <div className="flex flex-col">
              <span className="font-extrabold text-base md:text-lg tracking-tight text-brand-slate dark:text-white leading-none">
                JAYSTARBLISS
              </span>
              <span className="text-[10px] font-bold tracking-[0.2em] text-brand-red uppercase mt-0.5">
                STUDIOS
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1 xl:space-x-2">
            <Link
              to="/"
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                isActive('/')
                  ? 'text-brand-red bg-red-50/80 dark:bg-red-950/30'
                  : 'text-slate-700 dark:text-slate-200 hover:text-brand-red dark:hover:text-brand-red'
              }`}
            >
              Home
            </Link>

            <Link
              to="/about"
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                isActive('/about')
                  ? 'text-brand-red bg-red-50/80 dark:bg-red-950/30'
                  : 'text-slate-700 dark:text-slate-200 hover:text-brand-red dark:hover:text-brand-red'
              }`}
            >
              About
            </Link>

            {/* Programs Dropdown */}
            <div className="relative group">
              <Link
                to="/programs"
                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                  isActive('/programs') || isActive('/courses')
                    ? 'text-brand-red bg-red-50/80 dark:bg-red-950/30'
                    : 'text-slate-700 dark:text-slate-200 hover:text-brand-red dark:hover:text-brand-red'
                }`}
              >
                <span>Programs</span>
                <ChevronDown size={14} className="group-hover:rotate-180 transition-transform" />
              </Link>
              <div className="absolute left-0 mt-1 w-72 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pt-2">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 space-y-1">
                  <Link
                    to="/programs"
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                  >
                    <GraduationCap size={18} className="text-brand-red mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        8 Learning Academies
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Structured learning schools for kids &amp; teens
                      </div>
                    </div>
                  </Link>
                  <Link
                    to="/courses"
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                  >
                    <Layers size={18} className="text-brand-red mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        All Courses Catalog
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Browse individual modules &amp; tracks
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>

            <Link
              to="/services"
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                isActive('/services')
                  ? 'text-brand-red bg-red-50/80 dark:bg-red-950/30'
                  : 'text-slate-700 dark:text-slate-200 hover:text-brand-red dark:hover:text-brand-red'
              }`}
            >
              Services
            </Link>

            <Link
              to="/portfolio"
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                isActive('/portfolio')
                  ? 'text-brand-red bg-red-50/80 dark:bg-red-950/30'
                  : 'text-slate-700 dark:text-slate-200 hover:text-brand-red dark:hover:text-brand-red'
              }`}
            >
              Portfolio
            </Link>

            <Link
              to="/kids-projects"
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                isActive('/kids-projects')
                  ? 'text-brand-red bg-red-50/80 dark:bg-red-950/30'
                  : 'text-slate-700 dark:text-slate-200 hover:text-brand-red dark:hover:text-brand-red'
              }`}
            >
              Kids Zone
            </Link>

            <Link
              to="/blog"
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                isActive('/blog')
                  ? 'text-brand-red bg-red-50/80 dark:bg-red-950/30'
                  : 'text-slate-700 dark:text-slate-200 hover:text-brand-red dark:hover:text-brand-red'
              }`}
            >
              Blog
            </Link>

            <Link
              to="/contact"
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                isActive('/contact')
                  ? 'text-brand-red bg-red-50/80 dark:bg-red-950/30'
                  : 'text-slate-700 dark:text-slate-200 hover:text-brand-red dark:hover:text-brand-red'
              }`}
            >
              Contact
            </Link>
          </nav>

          {/* Right Controls */}
          <div className="hidden lg:flex items-center space-x-2">
            <button
              onClick={openSearch}
              aria-label="Search site"
              className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Search size={18} />
            </button>

            <button
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
            </button>

            {currentUser ? (
              <Link
                to={getDashboardLink()}
                className="bg-brand-slate dark:bg-white text-white dark:text-slate-900 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shadow-sm"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Portal Login
                </Link>
                <Link
                  to="/register"
                  className="bg-brand-red text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-red-700 transition-colors shadow-md shadow-brand-red/20"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile Hamburger */}
          <div className="lg:hidden flex items-center gap-2">
            <button
              onClick={openSearch}
              aria-label="Search site"
              className="p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Search size={20} />
            </button>
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} />}
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle menu"
              className="p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {isOpen && (
        <div className="lg:hidden bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 px-4 pt-3 pb-6 space-y-1 shadow-xl">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="block py-2.5 px-3 rounded-xl font-bold text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            Home
          </Link>
          <Link
            to="/about"
            onClick={() => setIsOpen(false)}
            className="block py-2.5 px-3 rounded-xl font-bold text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            About
          </Link>
          <Link
            to="/programs"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 py-2.5 px-3 rounded-xl font-bold text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            <Cpu size={16} className="text-brand-red" />
            <span>8 Learning Academies</span>
          </Link>
          <Link
            to="/courses"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 py-2.5 px-3 rounded-xl font-bold text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            <Layers size={16} className="text-slate-500" />
            <span>All Courses</span>
          </Link>
          <Link
            to="/services"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 py-2.5 px-3 rounded-xl font-bold text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            <Sparkles size={16} className="text-cyan-500" />
            <span>Services</span>
          </Link>
          <Link
            to="/portfolio"
            onClick={() => setIsOpen(false)}
            className="block py-2.5 px-3 rounded-xl font-bold text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            Portfolio
          </Link>
          <Link
            to="/kids-projects"
            onClick={() => setIsOpen(false)}
            className="block py-2.5 px-3 rounded-xl font-bold text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            Kids Zone
          </Link>
          <Link
            to="/blog"
            onClick={() => setIsOpen(false)}
            className="block py-2.5 px-3 rounded-xl font-bold text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            Blog
          </Link>
          <Link
            to="/contact"
            onClick={() => setIsOpen(false)}
            className="block py-2.5 px-3 rounded-xl font-bold text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            Contact
          </Link>

          <div className="pt-4 mt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
            {currentUser ? (
              <Link
                to={getDashboardLink()}
                onClick={() => setIsOpen(false)}
                className="w-full text-center bg-brand-slate dark:bg-white text-white dark:text-slate-900 font-bold py-3 rounded-xl text-xs uppercase tracking-wider"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-center bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider"
                >
                  Portal Login
                </Link>
                <Link
                  to="/register"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-center bg-brand-red text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
