import DOMPurify from 'dompurify';
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { getAllClientDatabases } from '../lib/firebase';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { Loader2, ArrowLeft, Layers, CheckCircle2 } from 'lucide-react';
import Button from '../components/ui/Button';

const ServiceDetails: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [service, setService] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchService = async () => {
      try {
        const dbs = getAllClientDatabases();
        let found: any = null;
        for (const clientDb of dbs) {
          try {
            const q = query(collection(clientDb, 'services'), where('slug', '==', slug), where('status', '==', 'PUBLISHED'));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
              found = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
              break;
            }
            if (slug) {
              const byId = await getDoc(doc(clientDb, 'services', slug));
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
          setService(found);
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

    if (slug) fetchService();
  }, [slug]);

  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-[60vh] flex items-center justify-center bg-brand-neutral dark:bg-slate-900">
          <Loader2 className="w-10 h-10 animate-spin text-brand-red" />
        </div>
      </MainLayout>
    );
  }
  
  if (error || !service) {
    return (
      <MainLayout>
        <div className="py-32 text-center container mx-auto px-4">
          <h1 className="text-3xl font-extrabold mb-4 text-brand-slate dark:text-white">Service Not Found</h1>
          <p className="mb-8 text-slate-500 dark:text-slate-400">The service you are looking for does not exist or is no longer available.</p>
          <Button to="/services" variant="ghost" leftIcon={<ArrowLeft size={18} />} className="text-brand-red font-bold">
            Back to Services
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <SEO 
        title={service.title} 
        description={service.shortDescription || `Professional ${service.title} by Jaystarbliss Studios.`} 
      />

      {/* Hero Section */}
      <div className="bg-brand-slate text-white py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
          <Link to="/services" className="text-white/60 hover:text-white inline-flex items-center gap-2 mb-8 text-xs font-bold tracking-widest transition-colors uppercase">
            <ArrowLeft size={14} /> BACK TO SERVICES
          </Link>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-8">
              <span className="inline-block text-xs font-black uppercase tracking-widest text-brand-red mb-3">
                Digital & Creative Capability
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6 leading-tight tracking-tight">
                {service.title}
              </h1>
              <p className="text-base sm:text-lg text-white/80 leading-relaxed mb-8 font-normal max-w-2xl">
                {service.shortDescription}
              </p>
              <div className="flex flex-wrap gap-4 items-center">
                <Button to="/contact" variant="primary" size="lg" className="uppercase tracking-widest font-extrabold shadow-lg shadow-brand-red/20">
                  REQUEST SERVICE
                </Button>
                <a href="#details" className="text-white/70 hover:text-white px-5 py-3 font-semibold transition-colors uppercase tracking-wider text-xs">
                  Explore Details
                </a>
              </div>
            </div>
            
            <div className="hidden lg:flex lg:col-span-4 justify-end"> 
              <div className="w-full max-w-xs aspect-square bg-white/[0.03] border border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                <Layers className="w-20 h-20 text-brand-red/60 mb-4" />
                <div className="text-lg font-bold text-white mb-1">Professional Execution</div>
                <div className="text-xs text-white/50 font-medium">Built to modern industry standards</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Overview & Content Section */}
      <div id="details" className="py-16 md:py-24 bg-brand-neutral dark:bg-slate-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            
            <div className="lg:col-span-8 space-y-12">
              <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md p-8 sm:p-12 rounded-2xl border border-white/60 dark:border-white/10 shadow-sm">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-slate dark:text-white mb-6 tracking-tight">
                  Service Overview
                </h2>
                <div className="prose prose-lg max-w-none text-slate-700 dark:text-slate-300 font-normal leading-relaxed prose-a:text-brand-red">
                  {service.content ? (
                    <div className="whitespace-pre-line leading-relaxed quill-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(service.content) }} />
                  ) : (
                    <p>Details about this service are being updated. Our team works closely with you to understand your specific needs, plan the execution, and deliver high-quality results. Contact us to learn more about how we can help with {service.title}.</p>
                  )}
                </div>
              </div>
              
              {/* How We Work block */}
              <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md p-8 sm:p-12 rounded-2xl border border-white/60 dark:border-white/10 shadow-sm"> 
                <span className="text-xs font-black uppercase tracking-widest text-brand-red block mb-2">Process</span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-slate dark:text-white mb-8 tracking-tight">
                  How We Execute
                </h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="py-6 flex gap-6 items-baseline">
                    <span className="font-mono text-xl font-extrabold text-brand-red shrink-0">01</span>
                    <div>
                      <h3 className="text-lg font-bold text-brand-slate dark:text-white mb-1">Understand & Plan</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                        We start by understanding exactly what you're trying to achieve, mapping out the requirements, and defining success criteria.
                      </p>
                    </div>
                  </div>
                  <div className="py-6 flex gap-6 items-baseline">
                    <span className="font-mono text-xl font-extrabold text-brand-red shrink-0">02</span>
                    <div>
                      <h3 className="text-lg font-bold text-brand-slate dark:text-white mb-1">Design & Build</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                        Our experts execute the work, keeping you in the loop with regular updates and ensuring quality at every step.
                      </p>
                    </div>
                  </div>
                  <div className="py-6 flex gap-6 items-baseline">
                    <span className="font-mono text-xl font-extrabold text-brand-red shrink-0">03</span>
                    <div>
                      <h3 className="text-lg font-bold text-brand-slate dark:text-white mb-1">Review & Launch</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                        We test thoroughly, gather your final feedback, and successfully launch or hand over the completed project.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Sidebar */}
            <div className="lg:col-span-4 lg:sticky lg:top-28">
              <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl p-8 border border-white/60 dark:border-white/10 shadow-sm space-y-6">
                <div>
                  <h3 className="text-xl font-extrabold text-brand-slate dark:text-white mb-2">Ready to start?</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    Get in touch with us to discuss your requirements, timeline, and pricing for this service.
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button to="/contact" variant="primary" fullWidth size="lg" className="uppercase tracking-wider font-extrabold">
                    Request a Quote
                  </Button>
                  <Button to="/project-request" variant="secondary" fullWidth size="md" className="uppercase tracking-wider font-bold">
                    Start Structured Spec
                  </Button>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                    <CheckCircle2 size={16} className="text-emerald-500" /> Dedicated Technical Lead
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ServiceDetails;
