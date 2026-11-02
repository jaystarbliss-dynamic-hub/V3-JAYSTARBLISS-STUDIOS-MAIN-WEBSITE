import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Mail, Phone, MapPin, MessageSquare, HelpCircle } from 'lucide-react';

const Footer: React.FC = () => {
  const [settings, setSettings] = useState<any>({
    siteName: 'Jaystarbliss Studios',
    tagline: 'A multi-service digital, creative and educational hub helping people learn, build, create and grow.',
    contactEmail: 'info@jaystarbliss-studios.name.ng',
    infoEmail: 'info@jaystarbliss-studios.name.ng',
    supportEmail: 'support@jaystarbliss-studios.name.ng',
    contactPhone: '+234 913 651 8194',
    infoWhatsapp: '+234 913 052 9010',
    supportWhatsapp: '+234 707 763 8925',
    address: 'Lagos, Nigeria',
    facebookUrl: '',
    instagramUrl: '',
    linkedinUrl: '',
    youtubeUrl: ''
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'global');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings((prev: any) => ({ ...prev, ...docSnap.data() }));
        }
      } catch (error) {
        console.error('Error fetching global settings:', error);
      }
    };
    fetchSettings();
  }, []);

  const cleanPhone = (val: string) => String(val || '').replace(/[^0-9]/g, '');

  return (
    <footer className="bg-brand-slate text-white pt-20 pb-12 border-t border-white/10">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          <div>
            <Link to="/" className="inline-flex items-center gap-3 mb-6">
              <img
                src="/logo.png"
                alt="Jaystarbliss Studios Logo"
                width={48}
                height={48}
                loading="lazy"
                decoding="async"
                className="w-12 h-12 object-contain"
              />
              <span className="font-extrabold text-xl tracking-tight text-white">
                {settings.siteName || 'JAYSTARBLISS'}
              </span>
            </Link>
            <p className="text-brand-neutral/70 text-sm leading-relaxed mb-6">
              {settings.tagline}
            </p>
            <div className="flex space-x-3">
              {settings.facebookUrl && (
                <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-white/5 flex items-center justify-center hover:bg-brand-red transition-colors text-xs font-bold">FB</a>
              )}
              {settings.instagramUrl && (
                <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-white/5 flex items-center justify-center hover:bg-brand-red transition-colors text-xs font-bold">IG</a>
              )}
              {settings.linkedinUrl && (
                <a href={settings.linkedinUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-white/5 flex items-center justify-center hover:bg-brand-red transition-colors text-xs font-bold">IN</a>
              )}
              {settings.youtubeUrl && (
                <a href={settings.youtubeUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-white/5 flex items-center justify-center hover:bg-brand-red transition-colors text-xs font-bold">YT</a>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider mb-6 text-white">Quick Links</h4>
            <ul className="space-y-3 text-brand-neutral/70 text-sm">
              <li><Link to="/about" className="hover:text-white transition-colors">About Us</Link></li>
              <li><Link to="/programs" className="hover:text-white transition-colors">Programs &amp; Academies</Link></li>
              <li><Link to="/courses" className="hover:text-white transition-colors">All Courses</Link></li>
              <li><Link to="/services" className="hover:text-white transition-colors">Services</Link></li>
              <li><Link to="/portfolio" className="hover:text-white transition-colors">Portfolio</Link></li>
              <li><Link to="/kids-projects" className="hover:text-white transition-colors">Kids Zone</Link></li>
              <li><Link to="/blog" className="hover:text-white transition-colors">Blog</Link></li>
              <li><Link to="/contact" className="hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider mb-6 text-white">Portals</h4>
            <ul className="space-y-3 text-brand-neutral/70 text-sm">
              <li><Link to="/login" className="hover:text-white transition-colors">Student Portal</Link></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Parent Portal</Link></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Tutor / Staff Portal</Link></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Partner School Portal</Link></li>
              <li><Link to="/register" className="hover:text-white transition-colors">Create Account</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider mb-6 text-white">Contact &amp; Support Desks</h4>
            <div className="space-y-4 text-brand-neutral/70 text-xs">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <MessageSquare size={13} />
                  <span>Services &amp; Courses Info</span>
                </div>
                <a href={`https://wa.me/${cleanPhone(settings.infoWhatsapp || '2349130529010')}`} target="_blank" rel="noopener noreferrer" className="block text-white hover:text-emerald-400 font-semibold mb-0.5">
                  WhatsApp: {settings.infoWhatsapp || '+234 913 052 9010'}
                </a>
                <a href={`mailto:${settings.infoEmail || 'info@jaystarbliss-studios.name.ng'}`} className="block text-slate-300 hover:text-white break-all">
                  {settings.infoEmail || 'info@jaystarbliss-studios.name.ng'}
                </a>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="font-bold text-rose-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <HelpCircle size={13} />
                  <span>Portal &amp; Tech Support</span>
                </div>
                <a href={`https://wa.me/${cleanPhone(settings.supportWhatsapp || '2347077638925')}`} target="_blank" rel="noopener noreferrer" className="block text-white hover:text-rose-400 font-semibold mb-0.5">
                  WhatsApp: {settings.supportWhatsapp || '+234 707 763 8925'}
                </a>
                <a href={`mailto:${settings.supportEmail || 'support@jaystarbliss-studios.name.ng'}`} className="block text-slate-300 hover:text-white break-all">
                  {settings.supportEmail || 'support@jaystarbliss-studios.name.ng'}
                </a>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-brand-red shrink-0" />
                  <span>{settings.contactPhone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-brand-red shrink-0" />
                  <span className="break-all">{settings.contactEmail}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-brand-red shrink-0" />
                  <span>{settings.address}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center text-xs text-brand-neutral/50 gap-4">
          <p>&copy; {new Date().getFullYear()} {settings.siteName}. All rights reserved.</p>
          <div className="flex space-x-6">
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
