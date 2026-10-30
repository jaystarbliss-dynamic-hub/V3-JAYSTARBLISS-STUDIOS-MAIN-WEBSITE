import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getAllClientDatabases } from '../lib/firebase';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { Monitor, Paintbrush, Database, Globe, Briefcase, Cpu, ArrowUpRight, Workflow, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CardSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { stockImages, pageHeaderImages } from '../lib/stockImages';
import { StaggerGroup } from '../components/ui/Reveal';
import PageHeader from '../components/ui/PageHeader';
import { staggerItem } from '../components/ui/animationVariants';
import { motion } from 'motion/react';
import { usePageSection } from '../lib/cms';

const getIconComponent = (iconName: string) => {
  const normalizedName = (iconName || "Monitor").toLowerCase();
  const lowerIcons: Record<string, React.ReactNode> = { 
    monitor: <Monitor size={22} />, 
    database: <Database size={22} />, 
    paintbrush: <Paintbrush size={22} />, 
    briefcase: <Briefcase size={22} />, 
    globe: <Globe size={22} />, 
    cpu: <Cpu size={22} /> 
  };
  return lowerIcons[normalizedName] || <Monitor size={22} />;
};

const getServiceImage = (iconName: string) => {
  const normalizedName = (iconName || "Monitor").toLowerCase();
  const map: Record<string, string> = {
    monitor: stockImages.webDev,
    database: stockImages.database,
    paintbrush: stockImages.design,
    briefcase: stockImages.consulting,
    globe: stockImages.global,
    cpu: stockImages.tech,
  };
  return map[normalizedName] || stockImages.webDev;
};

const Services: React.FC = () => {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: heroData } = usePageSection('services', 'hero', {
    title: 'SOLUTIONS THAT DELIVER.',
    subtitle: 'From interactive software platforms to enterprise school management systems and branding, we provide end-to-end digital solutions.',
    bannerImage: ''
  });

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const dbs = getAllClientDatabases();
        const merged = new Map<string, any>();
        await Promise.all(
          dbs.map(async (clientDb) => {
            try {
              const q = query(collection(clientDb, 'services'), where('status', '==', 'PUBLISHED'));
              const snapshot = await getDocs(q);
              snapshot.docs.forEach((docSnap) => {
                if (!merged.has(docSnap.id)) {
                  merged.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
                }
              });
            } catch {
              // ignore secondary db error
            }
          })
        );
        setServices(Array.from(merged.values()));
      } catch (error) {
        console.error('Error fetching services:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, []);

  return (
    <MainLayout>
      <SEO title="Services" description="Professional technology and creative services designed to elevate your brand." />
      <PageHeader
        eyebrow="What We Offer"
        title={heroData.title || 'SOLUTIONS THAT DELIVER.'}
        description={heroData.subtitle || 'From interactive software platforms to enterprise school management systems and branding, we provide end-to-end digital solutions.'}
        image={heroData.bannerImage}
        fallbackImage={pageHeaderImages.services}
      />
      
      <div className="digital-canvas py-20 lg:py-28 min-h-[50vh] overflow-hidden">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="grid lg:grid-cols-[1.1fr_.9fr] gap-8 items-end mb-12">
            <div>
              <span className="tech-label text-brand-red">Capabilities, connected</span>
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-950 dark:text-white mt-3">From idea to dependable delivery.</h2>
            </div>
            <p className="text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-400 lg:border-l lg:border-slate-300 dark:lg:border-slate-700 lg:pl-8">Strategy, design and engineering work as one system. Explore a capability to see the process, outputs and best-fit engagement.</p>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map(i => <CardSkeleton key={i} />)}
            </div>
          ) : services.length === 0 ? (
            <EmptyState 
              title="No Services Found" 
              description="We are currently updating our professional services catalog. Please check back soon."
            />
          ) : (
            <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
              {services.map((service, index) => (
                <motion.div 
                  key={service.id} 
                  variants={staggerItem}
                  className={`${index < 2 ? 'lg:col-span-6' : 'lg:col-span-4'}`}
                >
                  <Link
                    to={`/services/${service.slug}`}
                    className={`group relative flex flex-col justify-end ${index < 2 ? 'h-[420px]' : 'h-[350px]'} rounded-[2rem] overflow-hidden border border-white/15 shadow-2xl transition-all duration-500 hover:-translate-y-1`}
                  >
                    <img
                      src={getServiceImage(service.iconName)}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-900/10" />
                    <div className="relative z-10 p-6 sm:p-8">
                      <div className="flex items-center justify-between mb-8">
                      <div className="w-12 h-12 shrink-0 aspect-square bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center text-white group-hover:bg-brand-red group-hover:border-brand-red transition-all">
                        {getIconComponent(service.iconName)}
                      </div>
                      <ArrowUpRight size={22} className="text-white/50 group-hover:text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                      </div>
                      <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">{service.title}</h3>
                      <p className="text-white/80 leading-relaxed mb-4 text-sm line-clamp-2">
                        {service.shortDescription}
                      </p>
                      <span className="font-bold text-xs uppercase tracking-wider text-red-300 group-hover:text-white inline-flex items-center gap-2 transition-colors"><Workflow size={14}/> Explore process</span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </StaggerGroup>
          )}
          <div className="mt-12 pro-surface rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="flex items-start gap-4"><CheckCircle2 className="text-brand-red mt-1 shrink-0"/><div><h3 className="font-extrabold text-slate-950 dark:text-white">Not sure which service fits?</h3><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Tell us the outcome you need. We will recommend the leanest practical route.</p></div></div>
            <Link to="/project-request" className="shrink-0 px-6 py-3 rounded-xl bg-brand-red text-white text-xs font-black uppercase tracking-wider hover:bg-red-700 transition-colors">Start a project</Link>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Services;
