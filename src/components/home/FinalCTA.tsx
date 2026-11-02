import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageSquare, HelpCircle, Mail, ExternalLink } from 'lucide-react';
import { Reveal } from '../ui/Reveal';
import { usePageSection } from '../../lib/cms';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const FinalCTA: React.FC = () => {
  const { data: sectionInfo } = usePageSection('home', 'final_cta', {
    title: 'READY TO START YOUR JOURNEY?',
    subtitle: 'Take the next step in your digital journey. Whether you want to master a new skill or build a professional project, we\'re ready to start.',
    primaryBtnText: 'START LEARNING',
    primaryBtnLink: '/register',
    secondaryBtnText: 'START A PROJECT',
    secondaryBtnLink: '/contact',
    backgroundImage: ''
  });

  const [channelSettings, setChannelSettings] = useState({
    infoWhatsapp: '2349130529010',
    infoEmail: 'info@jaystarbliss-studios.name.ng',
    supportWhatsapp: '2347077638925',
    supportEmail: 'support@jaystarbliss-studios.name.ng',
    primaryWhatsapp: '2349136518194'
  });

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const docRef = doc(db, 'settings', 'global');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setChannelSettings({
            infoWhatsapp: String(data.infoWhatsapp || '2349130529010').replace(/[^0-9]/g, ''),
            infoEmail: String(data.infoEmail || 'info@jaystarbliss-studios.name.ng'),
            supportWhatsapp: String(data.supportWhatsapp || '2347077638925').replace(/[^0-9]/g, ''),
            supportEmail: String(data.supportEmail || 'support@jaystarbliss-studios.name.ng'),
            primaryWhatsapp: String(data.whatsappNumber || data.contactPhone || '2349136518194').replace(/[^0-9]/g, '')
          });
        }
      } catch {
        // Fallback default
      }
    };
    fetchChannels();
  }, []);

  return (
    <section className="py-24 bg-brand-slate text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-red/10 rounded-full blur-3xl -mr-48 -mt-48"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl -ml-48 -mb-48"></div>
      
      <Reveal className="container mx-auto px-4 md:px-8 max-w-4xl relative z-10 text-center">
        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black mb-6 tracking-tight">
          {sectionInfo.title || 'READY TO LEARN, BUILD OR CREATE?'}
        </h2>
        <p className="text-lg sm:text-xl text-brand-neutral/80 mb-12 max-w-2xl mx-auto leading-relaxed">
          {sectionInfo.subtitle || "Take the next step in your digital journey. Whether you want to master a new skill or build a professional project, we're ready to start."}
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link to={sectionInfo.primaryBtnLink || '/register'} className="relative inline-flex w-full sm:w-auto overflow-hidden rounded-xl p-[2px] focus:outline-none hover:-translate-y-1 transition-transform shadow-xl shadow-brand-red/20 group">
            <span className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#B91C1C_0%,#F8FAFC_50%,#B91C1C_100%)]" />
            <span className="inline-flex h-full w-full items-center justify-center gap-2 rounded-xl bg-brand-slate px-8 py-4 font-bold text-white backdrop-blur-3xl transition-colors group-hover:bg-brand-red/90 text-sm">
              {sectionInfo.primaryBtnText || 'START LEARNING'}
              <ArrowRight size={18} />
            </span>
          </Link>
          <Link to={sectionInfo.secondaryBtnLink || '/contact'} className="w-full sm:w-auto bg-white dark:bg-slate-900 dark:border-slate-800 text-brand-slate dark:text-white px-8 py-4 rounded-xl font-bold shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2 text-sm">
            {sectionInfo.secondaryBtnText || 'START A PROJECT'}
          </Link>
        </div>

        {/* Direct Connect & Dedicated WhatsApp / Email Helpdesks */}
        <div className="pt-10 border-t border-slate-800/80">
          <div className="text-xs font-black tracking-widest text-slate-400 uppercase mb-6">
            Direct Studio Communication Desks
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
            {/* Services & Admissions Desk */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <MessageSquare size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Services & Admissions Desk</h3>
                    <p className="text-[11px] text-slate-400">Programs, custom builds & corporate inquiries</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={`https://wa.me/${channelSettings.infoWhatsapp}?text=${encodeURIComponent('Hello Jaystarbliss Studios, I would like information regarding your courses and services.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950 transition-colors"
                >
                  <span>WhatsApp Info Desk</span>
                  <ExternalLink size={12} />
                </a>
                <a
                  href={`mailto:${channelSettings.infoEmail}`}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center gap-1.5 transition-colors border border-slate-700"
                >
                  <Mail size={12} className="text-slate-400" />
                  <span>{channelSettings.infoEmail}</span>
                </a>
              </div>
            </div>

            {/* Portal & Technical Support Desk */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-rose-500/40 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                    <HelpCircle size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Portal & Technical Support</h3>
                    <p className="text-[11px] text-slate-400">Student login, credentials, CBT & portal troubleshooting</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={`https://wa.me/${channelSettings.supportWhatsapp}?text=${encodeURIComponent('Hello Jaystarbliss Support Desk, I need help with my portal access / student account.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-950 transition-colors"
                >
                  <span>WhatsApp Support Desk</span>
                  <ExternalLink size={12} />
                </a>
                <a
                  href={`mailto:${channelSettings.supportEmail}`}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center gap-1.5 transition-colors border border-slate-700"
                >
                  <Mail size={12} className="text-slate-400" />
                  <span>{channelSettings.supportEmail}</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default FinalCTA;

