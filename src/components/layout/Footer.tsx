import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, ExternalLink, Globe } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { JaystarblissIcon } from '../common/JaystarblissLogo';
import { useToast } from '../../contexts/ToastContext';

const Footer: React.FC = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [settings, setSettings] = useState({
    companyName: 'Jaystarbliss Studios',
    contactEmail: 'jaystarblissstudios@gmail.com',
    contactPhone: '+234 913 651 8194',
    secondaryPhone: '+234 913 052 9010',
    googleBusinessUrl: 'https://share.google/mqVU8pAgKEDjOfGHe',
    address: 'Lagos, Nigeria',
    twitter: '#',
    linkedin: '#',
    instagram: '#'
  });

  useEffect(() => {
    let isMounted = true;
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'global'));
        if (docSnap.exists() && isMounted) {
          setSettings(prev => ({ ...prev, ...docSnap.data() }));
        }
      } catch (error) {
        // Fallback safely to default company & contact info
        console.warn("Notice: Using default settings configuration:", error);
      }
    };
    fetchSettings();
    return () => { isMounted = false; };
  }, []);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    // Process newsletter subscription
    setEmail('');
    toast.success('Thank you for subscribing to Jaystarbliss Studios updates & curriculum newsletters!');
  };

  return (
    <footer className="bg-brand-slate pt-20 pb-10 border-t border-slate-800 relative z-50">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-8 mb-16">
          
          {/* Column 1: Brand & Socials (Span 4) */}
          <div className="lg:col-span-4 pr-0 lg:pr-8">
            <Link to="/" className="inline-block mb-6">
              <span className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                <JaystarblissIcon className="w-8 h-8" />
                JAYSTARBLISS STUDIOS
              </span>
            </Link>
            <p className="text-gray-400 mb-8 font-medium leading-relaxed">
              Empowering learners of all ages through personalized digital education, technology tracks, and scalable software solutions.
            </p>
            <div className="flex items-center gap-3">
              <a href={settings.twitter || '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-gray-400 hover:bg-brand-red hover:text-white transition-all">
                <span className="text-xs font-bold">X</span>
              </a>
              <a href={settings.instagram || '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-gray-400 hover:bg-brand-red hover:text-white transition-all">
                <span className="text-xs font-bold">IG</span>
              </a>
              <a href={settings.linkedin || '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-gray-400 hover:bg-brand-red hover:text-white transition-all">
                <span className="text-xs font-bold">IN</span>
              </a>
              <a 
                href={settings.googleBusinessUrl || 'https://share.google/mqVU8pAgKEDjOfGHe'} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="px-3 h-10 rounded-full bg-slate-800 flex items-center gap-1.5 text-gray-300 hover:bg-brand-red hover:text-white transition-all text-xs font-bold"
                title="View Google Business Profile"
              >
                <Globe size={14} />
                <span>Google</span>
              </a>
            </div>
          </div>

          {/* Column 2: Quick Links (Span 2) */}
          <div className="lg:col-span-2">
            <h3 className="text-white font-bold mb-6 tracking-wide uppercase text-sm">Navigation</h3>
            <ul className="space-y-4">
              <li><Link to="/about" className="text-gray-400 hover:text-brand-red transition-colors font-medium">About Us</Link></li>
              <li><Link to="/programs" className="text-gray-400 hover:text-brand-red transition-colors font-medium">Programs</Link></li>
              <li><Link to="/services" className="text-gray-400 hover:text-brand-red transition-colors font-medium">Services</Link></li>
              <li><Link to="/portfolio" className="text-gray-400 hover:text-brand-red transition-colors font-medium">Portfolio & Showcase</Link></li>
              <li><Link to="/magic-particles" className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium flex items-center gap-1">Magic Particles</Link></li>
              <li><Link to="/school-partnership" className="text-gray-400 hover:text-brand-red transition-colors font-medium">School Partnerships</Link></li>
            </ul>
          </div>

          {/* Column 3: Resources (Span 2) */}
          <div className="lg:col-span-2">
            <h3 className="text-white font-bold mb-6 tracking-wide uppercase text-sm">Resources</h3>
            <ul className="space-y-4">
              <li><Link to="/tutors" className="text-gray-400 hover:text-brand-red transition-colors font-medium">Find a Mentor</Link></li>
              <li><Link to="/resources" className="text-gray-400 hover:text-brand-red transition-colors font-medium">Resource Center</Link></li>
              <li><Link to="/blog" className="text-gray-400 hover:text-brand-red transition-colors font-medium">Blog</Link></li>
              <li><Link to="/faq" className="text-gray-400 hover:text-brand-red transition-colors font-medium">FAQ</Link></li>
              <li><Link to="/contact" className="text-gray-400 hover:text-brand-red transition-colors font-medium">Contact</Link></li>
            </ul>
          </div>

          {/* Column 4: Newsletter & Contact (Span 4) */}
          <div className="lg:col-span-4">
            <h3 className="text-white font-bold mb-6 tracking-wide uppercase text-sm">Stay Updated</h3>
            <p className="text-gray-400 mb-6 font-medium text-sm">
              Subscribe to our newsletter for the latest updates on programs and tech insights.
            </p>
            <form onSubmit={handleSubscribe} className="flex gap-2 mb-8">
              <input 
                type="email" 
                placeholder="Enter your email" 
                className="bg-slate-800 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red flex-grow border border-slate-700 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="bg-brand-red hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold transition-colors text-sm">
                Join
              </button>
            </form>
            
            <div className="space-y-3">
              <a href={`mailto:${settings.contactEmail}`} className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                <Mail size={16} className="text-brand-red shrink-0" />
                <span className="font-medium text-sm break-all">{settings.contactEmail}</span>
              </a>
              <div className="flex flex-col gap-1.5">
                <a href="tel:+2349136518194" className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                  <Phone size={16} className="text-brand-red shrink-0" />
                  <span className="font-medium text-sm">+234 913 651 8194</span>
                </a>
                <a href="tel:+2349130529010" className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors pl-7">
                  <span className="font-medium text-sm">+234 913 052 9010</span>
                </a>
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <MapPin size={16} className="text-brand-red shrink-0" />
                <span className="font-medium text-sm">{settings.address}</span>
              </div>
              <a 
                href={settings.googleBusinessUrl || 'https://share.google/mqVU8pAgKEDjOfGHe'}
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center gap-2 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors pt-1"
              >
                <span>Google Business Profile Details</span>
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-500 font-medium text-sm">
            &copy; {new Date().getFullYear()} {settings.companyName}. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm font-medium">
            <Link to="#" className="text-gray-500 hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="#" className="text-gray-500 hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
