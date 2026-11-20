import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Share2,
  Check,
  ChevronRight,
  Clock,
  Users,
  BookOpen,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import Button from '../components/ui/Button';
import StageArchitectureBanner from '../components/ecosystem/StageArchitectureBanner';
import { generateSyllabusPdf } from '../lib/syllabusPdfGenerator';
import { auth } from '../lib/firebase';
import {
  type ProgramRecord,
  fetchAllProgramsMap,
  getProgramBreadcrumbs,
  getPublishedDirectChildren,
  countPublishedDiscoverableDescendants,
  resolveProgramCanonicalRoot,
  isProgramPublished,
  isProgramPubliclyEnrollable,
  computeProgramIndicators,
} from '../lib/programHierarchy';
import { resolveProgramBackgroundImage } from '../lib/programMedia';
import {
  buildCanonicalProgramUrl,
  buildLoginReturnUrl,
  buildPortalProgramExplorePath,
  buildRegisterProgramUrl,
  resolveProgramSlug,
  shareOrCopyLink,
} from '../lib/sharing';

const DELIVERY_LABELS: Record<string, string> = {
  PUBLIC_GROUP: 'Public Group Cohort',
  PRIVATE_MENTORSHIP: '1-on-1 Private Mentorship',
  SCHOOL_COHORT: 'Partner School Cohort',
};

const ProgramDetails: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());
  const [program, setProgram] = useState<ProgramRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadProgramAndTree = async () => {
      if (!slug) {
        if (mounted) {
          setError(true);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const map = await fetchAllProgramsMap();
        if (!mounted) return;
        setProgramsMap(map);

        const targetLower = decodeURIComponent(slug).trim().toLowerCase();
        let matched: ProgramRecord | null = null;

        // 1. Exact ID lookup
        if (map.has(slug)) {
          matched = map.get(slug)!;
        }
        // 2. Exact slug lookup (published preferred)
        if (!matched) {
          for (const candidate of map.values()) {
            if (candidate.slug.toLowerCase() === targetLower && isProgramPublished(candidate)) {
              matched = candidate;
              break;
            }
          }
        }
        // 3. Fallback slug/id case-insensitive match if published
        if (!matched) {
          for (const candidate of map.values()) {
            if (
              (candidate.id.toLowerCase() === targetLower ||
                candidate.slug.toLowerCase() === targetLower) &&
              isProgramPublished(candidate)
            ) {
              matched = candidate;
              break;
            }
          }
        }

        if (matched && isProgramPublished(matched)) {
          setProgram(matched);
          setError(false);
        } else {
          setProgram(null);
          setError(true);
        }
      } catch (err) {
        console.error('Error loading programme details:', err);
        if (mounted) {
          setProgram(null);
          setError(true);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadProgramAndTree();
    return () => {
      mounted = false;
    };
  }, [slug]);

  const breadcrumbs = useMemo(() => {
    if (!program) return [];
    return getProgramBreadcrumbs(program.id, programsMap).filter((b) => isProgramPublished(b));
  }, [program, programsMap]);

  const directChildren = useMemo(() => {
    if (!program) return [];
    return getPublishedDirectChildren(program.id, programsMap);
  }, [program, programsMap]);

  const rootResolution = useMemo(() => {
    if (!program) return null;
    return resolveProgramCanonicalRoot(program, programsMap);
  }, [program, programsMap]);

  const indicators = useMemo(() => {
    if (!program) return [];
    return computeProgramIndicators(program);
  }, [program]);

  const isEnrollable = useMemo(() => {
    if (!program) return false;
    return isProgramPubliclyEnrollable(program);
  }, [program]);

  const parentBreadcrumb = useMemo(() => {
    if (breadcrumbs.length < 2) return null;
    return breadcrumbs[breadcrumbs.length - 2];
  }, [breadcrumbs]);

  const heroBackgroundImage = useMemo(() => {
    if (!program) return '';
    return resolveProgramBackgroundImage(program, programsMap, rootResolution?.rootKey);
  }, [program, programsMap, rootResolution?.rootKey]);

  const canonicalUrl = useMemo(() => {
    if (!program) return '';
    return buildCanonicalProgramUrl(program);
  }, [program]);

  const structuredData = useMemo(() => {
    if (!program) return undefined;
    const priceAmount = program.publicGroupPricing?.amount || program.price || undefined;
    return {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: program.title,
      description:
        program.shortDescription || `Explore ${program.title} at Jaystarbliss Studios.`,
      url: canonicalUrl,
      image: program.featuredImage || undefined,
      provider: {
        '@type': 'EducationalOrganization',
        name: 'Jaystarbliss Studios',
        url: 'https://jaystarblissstudios.com',
      },
      ...(priceAmount
        ? {
            offers: {
              '@type': 'Offer',
              price: String(priceAmount),
              priceCurrency: program.publicGroupPricing?.currency || 'NGN',
              availability: 'https://schema.org/InStock',
            },
          }
        : {}),
    };
  }, [program, canonicalUrl]);

  // Determine signed-in enrolment navigation behavior
  const authUser = auth.currentUser;
  const sessionRole =
    typeof window !== 'undefined' ? (sessionStorage.getItem('userRole') || '').toLowerCase() : '';
  const studentRegType =
    typeof window !== 'undefined'
      ? (sessionStorage.getItem('studentRegistrationType') || '').toLowerCase()
      : '';
  const isParentManagedStudent =
    Boolean(authUser) && sessionRole === 'student' && studentRegType === 'parent';

  const handlePrimaryEnrolClick = () => {
    if (!program) return;
    const programSlug = resolveProgramSlug(program);

    if (authUser && sessionRole === 'parent') {
      navigate(
        buildPortalProgramExplorePath({
          role: 'parent',
          programId: program.id,
          programSlug,
        })
      );
      return;
    }

    if (authUser && sessionRole === 'student') {
      if (isParentManagedStudent) {
        return;
      }
      navigate(
        buildPortalProgramExplorePath({
          role: 'student',
          programId: program.id,
          programSlug,
        })
      );
      return;
    }

    // Signed out: take user to login with validated same-origin return into portal explorer
    const returnTo = buildPortalProgramExplorePath({
      role: 'student',
      programId: program.id,
      programSlug,
    });
    navigate(
      buildLoginReturnUrl({
        returnTo,
        programId: program.id,
        programSlug,
      })
    );
  };

  const handleShareProgramme = async () => {
    if (!program) return;
    const result = await shareOrCopyLink({
      title: `${program.title} | Jaystarbliss Studios`,
      text:
        program.shortDescription ||
        `Discover ${program.title} at Jaystarbliss Studios.`,
      url: canonicalUrl,
    });
    if (result.method === 'web-share') {
      setShareFeedback('Programme shared');
    } else if (result.method === 'clipboard') {
      setShareFeedback('Programme link copied');
    } else if (result.method !== 'cancelled') {
      setShareFeedback('Unable to copy link');
    }
    window.setTimeout(() => setShareFeedback(null), 2600);
  };

  const handleDownloadSyllabus = () => {
    if (!program) return;
    if (program.curriculumPdfUrl && /^https?:\/\//i.test(program.curriculumPdfUrl)) {
      const link = document.createElement('a');
      link.href = program.curriculumPdfUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
      return;
    }

    setDownloadingPdf(true);
    try {
      generateSyllabusPdf({
        title: program.title,
        categoryId: program.categoryId,
        category: rootResolution?.rootDefinition?.title || program.categoryId.replace(/_/g, ' '),
        shortDescription: program.shortDescription,
        longDescription: program.fullDescription,
        targetAudience: program.whoIsItFor,
        deliveryFormat: program.deliveryMode,
        duration: program.duration,
      });
    } catch (err) {
      console.error('Error generating syllabus PDF:', err);
    } finally {
      window.setTimeout(() => setDownloadingPdf(false), 700);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-[60vh] flex items-center justify-center bg-brand-neutral dark:bg-slate-900">
          <Loader2 className="w-10 h-10 animate-spin text-brand-red" />
        </div>
      </MainLayout>
    );
  }

  if (error || !program) {
    return (
      <MainLayout>
        <SEO title="Programme Not Found" noindex />
        <div className="py-32 text-center container mx-auto px-4">
          <h1 className="text-3xl font-extrabold mb-4 text-brand-slate dark:text-white">
            Programme Not Found
          </h1>
          <p className="mb-8 text-slate-500 dark:text-slate-400">
            The programme you are looking for does not exist or is no longer published.
          </p>
          <Button
            to="/programs?tab=catalog#catalog-section"
            variant="ghost"
            leftIcon={<ArrowLeft size={18} />}
            className="text-brand-red font-bold"
          >
            Back to Programme Catalogue
          </Button>
        </div>
      </MainLayout>
    );
  }

  const registerHref = buildRegisterProgramUrl({
    mode: 'student',
    programId: program.id,
    programSlug: resolveProgramSlug(program),
  });

  return (
    <MainLayout>
      <SEO
        title={program.title}
        description={
          program.shortDescription || `Explore ${program.title} at Jaystarbliss Studios.`
        }
        image={program.featuredImage || undefined}
        canonical={canonicalUrl}
        structuredData={structuredData}
      />

      {/* Full-bleed Studio Hero Banner */}
      <div className="bg-slate-950 text-white py-14 lg:py-20 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={heroBackgroundImage}
            alt={program.title}
            className="w-full h-full object-cover object-center opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/55" />
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
          {/* Recursive Breadcrumb Navigation */}
          <nav
            aria-label="Programme hierarchy breadcrumb"
            className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-white/70 mb-5"
          >
            <Link
              to="/programs?tab=catalog#catalog-section"
              className="hover:text-white transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft size={13} />
              <span>Catalogue</span>
            </Link>
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id}>
                  <ChevronRight size={13} className="text-white/40 shrink-0" />
                  {isLast ? (
                    <span className="text-white font-bold truncate max-w-[260px]">
                      {crumb.title}
                    </span>
                  ) : (
                    <Link
                      to={`/programs/${resolveProgramSlug(crumb)}`}
                      className="hover:text-white transition-colors truncate max-w-[200px]"
                    >
                      {crumb.title}
                    </Link>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          {/* Unboxed Metadata & Availability Indicators */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-red-400">
              {rootResolution?.rootDefinition?.title ||
                (program.categoryId ? program.categoryId.replace(/_/g, ' ') : 'Programme')}
            </span>
            {program.nodeType === 'CONTAINER' && (
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300 border-l border-white/25 pl-3">
                Programme Collection · {directChildren.length}{' '}
                {directChildren.length === 1 ? 'Track' : 'Tracks'}
              </span>
            )}
            {indicators.map((label) => (
              <span
                key={label}
                className="px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] rounded-sm bg-white/15 border border-white/25 text-white"
              >
                {label}
              </span>
            ))}
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-4 leading-tight tracking-tight max-w-4xl">
            {program.title}
          </h1>

          {program.shortDescription && (
            <p className="text-base sm:text-lg text-slate-200/90 max-w-3xl leading-relaxed mb-8 font-normal">
              {program.shortDescription}
            </p>
          )}

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-3 pt-6 border-t border-white/15">
            {isEnrollable ? (
              isParentManagedStudent ? (
                <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-xs font-semibold text-slate-100">
                  <ShieldCheck size={16} className="text-amber-300 shrink-0" />
                  <span>
                    Enrolment for this student account is managed by your parent or guardian.
                  </span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handlePrimaryEnrolClick}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-red-900/30 transition-colors cursor-pointer"
                  >
                    <span>
                      {authUser
                        ? sessionRole === 'parent'
                          ? 'Enrol a Child in Portal'
                          : 'Apply in Student Portal'
                        : 'Sign In to Enrol'}
                    </span>
                    <ArrowRight size={15} />
                  </button>

                  {!authUser && (
                    <Link
                      to={registerHref}
                      className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider border border-white/20 transition-colors"
                    >
                      New Student? Register
                    </Link>
                  )}
                </>
              )
            ) : (
              directChildren.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('child-programmes-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-red-900/30 transition-colors cursor-pointer"
                >
                  <Layers size={15} />
                  <span>Explore {directChildren.length} Available Tracks</span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={handleDownloadSyllabus}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider border border-white/20 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {downloadingPdf ? (
                <Loader2 size={15} className="animate-spin text-red-400" />
              ) : (
                <Download size={15} className="text-red-400" />
              )}
              <span>{downloadingPdf ? 'Preparing PDF...' : 'Syllabus PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handleShareProgramme}
              className="inline-flex items-center gap-2 px-4 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider border border-white/20 transition-colors cursor-pointer"
            >
              {shareFeedback ? (
                <Check size={15} className="text-emerald-400" />
              ) : (
                <Share2 size={15} />
              )}
              <span>{shareFeedback || 'Share'}</span>
            </button>
          </div>

          {/* Key Programme Specs Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-white/10 text-xs">
            <div>
              <span className="text-white/50 block uppercase tracking-widest font-bold text-[10px] mb-0.5">
                Duration
              </span>
              <span className="font-bold text-white inline-flex items-center gap-1.5">
                <Clock size={13} className="text-red-400" />
                {program.duration || 'Flexible Schedule'}
              </span>
            </div>
            <div>
              <span className="text-white/50 block uppercase tracking-widest font-bold text-[10px] mb-0.5">
                Delivery Mode
              </span>
              <span className="font-bold text-white">
                {program.deliveryMode || 'Online / Hybrid'}
              </span>
            </div>
            {program.whoIsItFor && (
              <div>
                <span className="text-white/50 block uppercase tracking-widest font-bold text-[10px] mb-0.5">
                  Designed For
                </span>
                <span className="font-bold text-white inline-flex items-center gap-1.5">
                  <Users size={13} className="text-red-400 shrink-0" />
                  <span className="truncate">{program.whoIsItFor}</span>
                </span>
              </div>
            )}
            {isEnrollable && (
              <div>
                <span className="text-white/50 block uppercase tracking-widest font-bold text-[10px] mb-0.5">
                  Public Tuition
                </span>
                <span className="font-bold text-white tabular-nums">
                  {program.publicGroupPricing?.amount
                    ? `₦${program.publicGroupPricing.amount.toLocaleString()}`
                    : program.pricing || 'Contact Admissions'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="py-14 md:py-20 bg-brand-neutral dark:bg-slate-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl space-y-12">
          {/* Compact Navigable Child Programmes Grid (Recursive Containers & Tracks) */}
          {directChildren.length > 0 && (
            <section id="child-programmes-section" className="space-y-5 scroll-mt-24">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#B91C1C]">
                    Included Pathways & Courses
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    Programmes inside {program.title}
                  </h2>
                </div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                  {directChildren.length} {directChildren.length === 1 ? 'programme' : 'programmes'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {directChildren.map((child) => {
                  const childBg = resolveProgramBackgroundImage(
                    child,
                    programsMap,
                    rootResolution?.rootKey
                  );
                  const nestedCount = countPublishedDiscoverableDescendants(child.id, programsMap);
                  const childIsContainer = child.nodeType === 'CONTAINER' || nestedCount > 0;
                  const childSlug = resolveProgramSlug(child);

                  if (childIsContainer) {
                    return (
                      <Link
                        key={child.id}
                        to={`/programs/${childSlug}`}
                        className="group relative flex flex-col justify-between min-h-[230px] rounded-2xl overflow-hidden border border-slate-200/80 dark:border-white/15 bg-slate-950 shadow-xs hover:shadow-lg transition-all"
                      >
                        <img
                          src={childBg}
                          alt={child.title}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-slate-950/20" />
                        <div className="relative z-10 p-4 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.15em] text-red-400">
                          <span>Sub-Programme</span>
                          <span className="text-slate-200 tabular-nums">
                            {nestedCount} {nestedCount === 1 ? 'track' : 'tracks'}
                          </span>
                        </div>
                        <div className="relative z-10 p-4 pt-6 space-y-1.5">
                          <h3 className="text-lg font-extrabold text-white leading-snug">
                            {child.title}
                          </h3>
                          {child.shortDescription && (
                            <p className="text-xs text-slate-200/85 line-clamp-2">
                              {child.shortDescription}
                            </p>
                          )}
                          <div className="pt-2 flex items-center justify-between text-xs font-bold text-white border-t border-white/15">
                            <span className="text-slate-300 font-medium">
                              {child.duration || 'Structured Pathway'}
                            </span>
                            <span className="inline-flex items-center gap-1 text-red-300 group-hover:text-white">
                              Explore <ArrowRight size={13} />
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  }

                  return (
                    <Link
                      key={child.id}
                      to={`/programs/${childSlug}`}
                      className="group flex flex-col justify-between rounded-2xl overflow-hidden bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 hover:border-[#B91C1C]/40 shadow-xs hover:shadow-md transition-all"
                    >
                      <div>
                        <div className="relative h-32 bg-slate-900 overflow-hidden">
                          <img
                            src={childBg}
                            alt={child.title}
                            loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
                        </div>
                        <div className="p-4 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <span>{child.deliveryMode || 'Online / Hybrid'}</span>
                            <span className="tabular-nums">{child.duration || '8 Weeks'}</span>
                          </div>
                          <h3 className="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-[#B91C1C] transition-colors leading-snug">
                            {child.title}
                          </h3>
                          {child.shortDescription && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                              {child.shortDescription}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-700 dark:text-slate-300 tabular-nums">
                          {child.publicGroupPricing?.amount
                            ? `₦${child.publicGroupPricing.amount.toLocaleString()}`
                            : child.pricing || 'View Details'}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[#B91C1C]">
                          View Course <ArrowRight size={13} />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Overview, Objectives, Outcomes & Fees Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 space-y-8">
              {/* Programme Overview */}
              <div className="bg-white dark:bg-slate-900/70 p-6 sm:p-9 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xs space-y-5">
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Programme Overview
                </h2>
                <div className="prose prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed">
                  {program.fullDescription ? (
                    <div
                      className="whitespace-pre-line leading-relaxed quill-content"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(program.fullDescription),
                      }}
                    />
                  ) : (
                    <p>
                      {program.shortDescription ||
                        'Detailed module milestones and project portfolio guidelines for this programme are calibrated during onboarding.'}
                    </p>
                  )}
                </div>

                {/* Learning Objectives / Outcomes */}
                {program.learningObjectives.length > 0 && (
                  <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                      Learning Objectives & Outcomes
                    </h3>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {program.learningObjectives.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
                        >
                          <CheckCircle2
                            size={16}
                            className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Curriculum Modules */}
                {program.curriculum.length > 0 && (
                  <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                      <BookOpen size={15} className="text-[#B91C1C]" />
                      <span>Curriculum Modules</span>
                    </h3>
                    <ol className="space-y-2">
                      {program.curriculum.map((mod, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200"
                        >
                          <span className="font-mono text-xs font-extrabold text-[#B91C1C] tabular-nums mt-0.5">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span>{mod}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>

            {/* Right Sidebar: Delivery Modes, Fees & Enrolment */}
            <aside className="lg:col-span-4 space-y-5">
              <div className="bg-white dark:bg-slate-900/80 p-6 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xs space-y-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#B91C1C]">
                    Delivery & Tuition
                  </p>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                    {isEnrollable ? 'Enrolment Options' : 'Pathway Structure'}
                  </h3>
                </div>

                {program.deliveryOptions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Available Delivery Modes
                    </div>
                    <ul className="space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {program.deliveryOptions.map((opt) => (
                        <li key={opt} className="flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-[#B91C1C] shrink-0" />
                          <span>{DELIVERY_LABELS[opt] || opt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {isEnrollable && (
                  <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                    {program.publicGroupPricing && program.publicGroupPricing.amount > 0 && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {program.publicGroupPricing.label || 'Public Group Class'}
                        </div>
                        <div className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                          ₦{program.publicGroupPricing.amount.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {program.publicGroupPricing.billingCycle}
                        </div>
                      </div>
                    )}

                    {program.privateMentorshipPricing &&
                      program.privateMentorshipPricing.amount > 0 && (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {program.privateMentorshipPricing.label || '1-on-1 Private Mentorship'}
                          </div>
                          <div className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                            ₦{program.privateMentorshipPricing.amount.toLocaleString()}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {program.privateMentorshipPricing.billingCycle}
                          </div>
                        </div>
                      )}
                  </div>
                )}

                <div className="pt-2 space-y-2.5">
                  {isEnrollable && !isParentManagedStudent && (
                    <button
                      type="button"
                      onClick={handlePrimaryEnrolClick}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white font-extrabold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      <span>{authUser ? 'Continue in Portal' : 'Sign In to Enrol'}</span>
                      <ArrowRight size={14} />
                    </button>
                  )}

                  {parentBreadcrumb && (
                    <Link
                      to={`/programs/${resolveProgramSlug(parentBreadcrumb)}`}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <ArrowLeft size={13} />
                      <span>Back to {parentBreadcrumb.title}</span>
                    </Link>
                  )}
                </div>
              </div>

              {/* Syllabus Download Card */}
              <div className="bg-slate-950 text-white p-6 rounded-3xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <FileText size={15} className="text-red-400" />
                  <span>Planning Guide</span>
                </div>
                <h3 className="text-lg font-extrabold leading-snug">
                  Official Syllabus & Roadmap
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Download the curriculum guide covering milestone deliverables and weekly session
                  cadence.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadSyllabus}
                  disabled={downloadingPdf}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-950 hover:bg-slate-100 font-extrabold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {downloadingPdf ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  <span>{downloadingPdf ? 'Preparing PDF...' : 'Download Syllabus'}</span>
                </button>
              </div>
            </aside>
          </div>

          <StageArchitectureBanner compact />
        </div>
      </div>
    </MainLayout>
  );
};

export default ProgramDetails;
