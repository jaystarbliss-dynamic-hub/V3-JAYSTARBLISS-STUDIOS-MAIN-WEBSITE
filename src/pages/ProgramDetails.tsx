import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { getAllClientDatabases } from '../lib/firebase';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { Loader2, ArrowLeft, CheckCircle2, Download, FileText } from 'lucide-react';
import DOMPurify from 'dompurify';
import Button from '../components/ui/Button';
import StageArchitectureBanner from '../components/ecosystem/StageArchitectureBanner';
import { generateSyllabusPdf } from '../lib/syllabusPdfGenerator';

const ProgramDetails: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [program, setProgram] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    const fetchProgram = async () => {
      try {
        const dbs = getAllClientDatabases();
        let found: any = null;

        for (const clientDb of dbs) {
          try {
            const q = query(collection(clientDb, 'programs'), where('slug', '==', slug), where('status', '==', 'PUBLISHED'));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
              found = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
              break;
            }
            if (slug) {
              const byId = await getDoc(doc(clientDb, 'programs', slug));
              if (byId.exists()) {
                found = { id: byId.id, ...byId.data() };
                break;
              }
            }
          } catch {
            // ignore secondary db error
          }
        }

        if (found) {
          setProgram(found);
          setError(false);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (slug) fetchProgram();
  }, [slug]);

  const handleDownloadSyllabus = () => {
    if (!program) return;
    setDownloadingPdf(true);
    try {
      generateSyllabusPdf({
        title: program.title,
        categoryId: program.categoryId,
        category: program.categoryId ? program.categoryId.replace(/_/g, ' ') : 'Academic Academy',
        schoolName: program.schoolName,
        shortDescription: program.shortDescription,
        longDescription: program.longDescription,
        targetAudience: program.targetAudience,
        deliveryFormat: program.deliveryFormat,
        duration: program.duration
      });
    } catch (err) {
      console.error('Error generating syllabus PDF:', err);
    } finally {
      setTimeout(() => setDownloadingPdf(false), 800);
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
        <div className="py-32 text-center container mx-auto px-4">
          <h1 className="text-3xl font-extrabold mb-4 text-brand-slate dark:text-white">Program Not Found</h1>
          <p className="mb-8 text-slate-500 dark:text-slate-400">The program you are looking for does not exist or is no longer available.</p>
          <Button to="/programs" variant="ghost" leftIcon={<ArrowLeft size={18} />} className="text-brand-red font-bold">
            All Programs
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <SEO 
        title={program.title} 
        description={program.shortDescription || `Explore ${program.title} at Jaystarbliss Studios.`} 
      />

      {/* Header Banner */}
      <div className="bg-brand-slate text-white py-16 lg:py-24 relative overflow-hidden">
        {program.image || program.coverImage || program.bannerImage ? (
          <div className="absolute inset-0 z-0">
            <img 
              src={program.image || program.coverImage || program.bannerImage} 
              alt={program.title}
              className="w-full h-full object-cover opacity-20 filter saturate-150"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-slate via-brand-slate/80 to-brand-slate/60" />
          </div>
        ) : (
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
        )}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl relative z-10">
          <Link to="/programs" className="text-white/70 hover:text-white inline-flex items-center gap-2 mb-6 text-xs font-bold tracking-widest uppercase">
            <ArrowLeft size={14} /> Back to Programs
          </Link>
          
          <div className="mb-4">
            <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-white/10 text-white border border-white/20">
              {program.categoryId ? program.categoryId.replace(/_/g, ' ') : 'Our Programs'}
            </span>
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6 leading-tight tracking-tight">
            {program.title}
          </h1>
          
          <p className="text-base sm:text-lg text-white/80 max-w-3xl leading-relaxed mb-10 font-normal">
            {program.shortDescription}
          </p>
          
          <div className="flex flex-wrap gap-4 sm:gap-6 items-center pt-6 border-t border-white/10">
            <Button to="/register" size="lg" className="uppercase tracking-widest font-extrabold shadow-lg shadow-brand-red/20">
              Request Enrollment
            </Button>

            <button
              type="button"
              onClick={handleDownloadSyllabus}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider border border-white/20 backdrop-blur-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {downloadingPdf ? (
                <Loader2 size={16} className="animate-spin text-brand-red" />
              ) : (
                <Download size={16} className="text-brand-red" />
              )}
              <span>{downloadingPdf ? 'Generating PDF...' : 'Download Syllabus PDF'}</span>
            </button>
            
            <div className="hidden sm:block pl-2">
              <span className="text-white/50 text-xs block uppercase tracking-widest font-bold mb-0.5">Structure</span> 
              <span className="font-extrabold text-sm text-white">Custom Learning Plan</span>
            </div>
            
            <div className="hidden sm:block">
              <span className="text-white/50 text-xs block uppercase tracking-widest font-bold mb-0.5">Format</span> 
              <span className="font-extrabold text-sm text-white">{program.deliveryFormat || 'Online / Physical'}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Details & 5-Stage Section */}
      <div className="py-16 md:py-24 bg-brand-neutral dark:bg-slate-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl space-y-12">
          
          {/* Parent Planning & Syllabus Download Card */}
          <div className="bg-gradient-to-r from-slate-900 via-brand-slate to-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <FileText size={16} className="text-brand-red" /> Parent Planning Resource
              </div>
              <h3 className="text-xl sm:text-2xl font-black">
                Official DISCOVER-MASTER Syllabus & Guide
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                Download the structured curriculum roadmap covering all 5 stages, recommended weekly session cadence, and capstone milestone deliverables to plan with your child.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadSyllabus}
              disabled={downloadingPdf}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-brand-red hover:bg-red-700 text-white font-extrabold rounded-xl shadow-lg shadow-brand-red/30 transition-all text-xs uppercase tracking-wider disabled:opacity-50"
            >
              {downloadingPdf ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              <span>{downloadingPdf ? 'Preparing PDF...' : 'Download Syllabus PDF'}</span>
            </button>
          </div>

          {/* Main Description */}
          <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md p-8 sm:p-12 rounded-3xl border border-white/60 dark:border-white/10 shadow-xs">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-slate dark:text-white mb-6 tracking-tight">
              Curriculum Overview
            </h2>
            <div className="prose prose-lg max-w-none text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
              {program.longDescription ? (
                <div className="whitespace-pre-line leading-relaxed quill-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(program.longDescription) }} />
              ) : (
                <p>Detailed module milestones and project portfolio guidelines for this course are calibrated during diagnostic onboarding.</p>
              )}
            </div>

            <div className="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <CheckCircle2 size={16} className="text-emerald-500" /> Verifiable Certificate Included
              </div>
              <div className="flex gap-3">
                <Button to="/contact" variant="outline" size="md" className="font-bold text-xs">
                  Request Info Pack
                </Button>
                <Button to="/register" size="md" className="uppercase tracking-wider font-extrabold">
                  Enroll in Cohort
                </Button>
              </div>
            </div>
          </div>

          {/* 5-Stage Standard Integration */}
          <StageArchitectureBanner compact />

        </div>
      </div>
    </MainLayout>
  );
};

export default ProgramDetails;
