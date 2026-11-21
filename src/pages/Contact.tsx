import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { CheckCircle2, MapPin, Mail, Phone, Globe, ExternalLink, MessageSquare, HelpCircle } from 'lucide-react';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import { pageHeaderImages } from '../lib/stockImages';
import { usePageSection } from '../lib/cms';
import { useToast } from '../contexts/ToastContext';

const Contact: React.FC = () => {
  const { toast } = useToast();
  const { data: heroData } = usePageSection('contact', 'details', {
    title: 'GET IN TOUCH',
    subtitle: "Whether you're looking to start a new project, enroll in a program, or just say hello, we'd love to hear from you.",
    bannerImage: ''
  });

  const [channelData, setChannelData] = useState({
    contactEmail: 'jaystarblissstudios@gmail.com',
    contactPhone: '+234 913 651 8194',
    infoWhatsapp: '+234 913 052 9010',
    infoEmail: 'info@jaystarbliss-studios.name.ng',
    supportWhatsapp: '+234 707 763 8925',
    supportEmail: 'support@jaystarblissstudios.com',
    address: 'Lagos, Nigeria',
    googleBusinessUrl: 'https://share.google/mqVU8pAgKEDjOfGHe'
  });

  useEffect(() => {
    const loadChannels = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'global'));
        if (snap.exists()) {
          const d = snap.data();
          setChannelData(prev => ({ ...prev, ...d }));
        }
      } catch {}
    };
    loadChannels();
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    type: 'General Inquiry',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
        
    try {
      await addDoc(collection(db, 'inquiries'), {
        inquirySubject: formData.type,
        ...formData,
        type: 'CONTACT',
        status: 'NEW',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Trigger Resend email delivery in background
      fetch('/.netlify/functions/send-client-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'contact_form',
          name: formData.name,
          email: formData.email,
          subject: formData.type,
          message: formData.message,
          type: 'Contact Inquiry'
        })
      }).catch((emailErr) => {
        console.warn('Email dispatch warning:', emailErr);
      });

      setSuccess(true);
      toast.success('Your message has been sent successfully! A confirmation email has also been dispatched.');
      setFormData({ name: '', email: '', type: 'General Inquiry', message: '' });
    } catch (err) {
      console.error('Error submitting form:', err);
      setError(true);
      toast.error('Failed to submit message. Please try again or reach out via WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <SEO 
        title="Contact Us" 
        description="Get in touch with Jaystarbliss Studios. Whether you're looking to start a new project, enroll in a program, or just say hello." 
      />

      {/* Header Banner */}
      <PageHeader
        eyebrow="Direct Communication"
        title={heroData.title || 'GET IN TOUCH'}
        description={heroData.subtitle}
        image={heroData.bannerImage}
        fallbackImage={pageHeaderImages.contact}
      />

      {/* Contact Content Split */}
      <div className="py-16 md:py-24 bg-brand-neutral dark:bg-slate-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            
            {/* Contact Info Column */}
            <div className="lg:col-span-5 space-y-8">
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-brand-red block mb-2">Reach Us Directly</span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-slate dark:text-white tracking-tight">
                  Contact Information
                </h2>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800">
                
                {/* General Inquiry & Admissions */}
                <div className="py-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-brand-red/10 flex items-center justify-center text-brand-red shrink-0 mt-0.5">
                    <Mail size={20} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">General Email & Correspondence</h3>
                    <a href={`mailto:${channelData.contactEmail}`} className="text-sm sm:text-base font-semibold text-brand-slate dark:text-white hover:text-brand-red transition-colors break-all block">
                      {channelData.contactEmail}
                    </a>
                  </div>
                </div>

                {/* Info Desk */}
                <div className="py-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                    <MessageSquare size={20} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Services & Admissions Info Desk</h3>
                    <div className="flex flex-col gap-1">
                      <a 
                        href={`https://wa.me/${channelData.infoWhatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hello Jaystarbliss Studios! I would like information regarding your courses & services.')}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm sm:text-base font-semibold text-brand-slate dark:text-white hover:text-emerald-600 transition-colors inline-flex items-center gap-1.5"
                      >
                        <span>WhatsApp: {channelData.infoWhatsapp}</span>
                        <ExternalLink size={12} />
                      </a>
                      <a href={`mailto:${channelData.infoEmail}`} className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 transition-colors">
                        Email: {channelData.infoEmail}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Support Helpdesk */}
                <div className="py-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0 mt-0.5">
                    <HelpCircle size={20} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">Portal & Technical Support Helpdesk</h3>
                    <div className="flex flex-col gap-1">
                      <a 
                        href={`https://wa.me/${channelData.supportWhatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hello Jaystarbliss Support Desk! I need assistance with portal login / credentials.')}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm sm:text-base font-semibold text-brand-slate dark:text-white hover:text-rose-600 transition-colors inline-flex items-center gap-1.5"
                      >
                        <span>WhatsApp: {channelData.supportWhatsapp}</span>
                        <ExternalLink size={12} />
                      </a>
                      <a href={`mailto:${channelData.supportEmail}`} className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-600 transition-colors">
                        Email: {channelData.supportEmail}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Primary Contact Phone */}
                <div className="py-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-brand-red/10 flex items-center justify-center text-brand-red shrink-0 mt-0.5">
                    <Phone size={20} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Direct Line / Primary WhatsApp</h3>
                    <div className="flex flex-col gap-1">
                      <a href={`tel:${channelData.contactPhone.replace(/\s+/g, '')}`} className="text-sm sm:text-base font-semibold text-brand-slate dark:text-white hover:text-brand-red transition-colors">
                        {channelData.contactPhone}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Google Business */}
                <div className="py-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-brand-red/10 flex items-center justify-center text-brand-red shrink-0 mt-0.5">
                    <Globe size={20} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Google Business</h3>
                    <a 
                      href={channelData.googleBusinessUrl || 'https://share.google/mqVU8pAgKEDjOfGHe'} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-red hover:underline mt-0.5"
                    >
                      <span>Verified Google Profile</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>

                {/* Headquarters */}
                <div className="py-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-brand-red/10 flex items-center justify-center text-brand-red shrink-0 mt-0.5">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Headquarters</h3>
                    <p className="text-base font-medium text-brand-slate dark:text-white leading-relaxed">
                      {channelData.address || 'Lagos, Nigeria'}
                    </p>
                  </div>
                </div>

              </div>

              <div className="p-6 rounded-2xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-white/60 dark:border-white/10 shadow-sm">
                <h4 className="text-sm font-bold text-brand-slate dark:text-white mb-1">Operating Hours</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Monday – Friday: 9:00 AM – 6:00 PM WAT<br />
                  Saturday: 10:00 AM – 4:00 PM WAT
                </p>
              </div>
            </div>

            {/* Form Column */}
            <div className="lg:col-span-7">
              <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md p-8 sm:p-10 md:p-12 rounded-2xl border border-white/60 dark:border-white/10 shadow-sm">
                {success ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center text-green-500 mx-auto mb-6">
                      <CheckCircle2 size={36} />
                    </div>
                    <h3 className="text-2xl font-extrabold text-brand-slate dark:text-white mb-2">Message Sent!</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-8 font-normal max-w-md mx-auto">
                      Thank you for reaching out. We will get back to you shortly.
                    </p>
                    <Button onClick={() => setSuccess(false)} variant="secondary" fullWidth size="lg">
                      Send Another Message
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                      <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-semibold">
                        There was an error sending your message. Please try again.
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                          Full Name
                        </label>
                        <input 
                          type="text" 
                          name="name" 
                          required 
                          value={formData.name} 
                          onChange={handleChange} 
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red focus:border-brand-red text-slate-900 dark:text-white text-sm font-medium transition-colors" 
                          placeholder="Jane Doe" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                          Email Address
                        </label>
                        <input 
                          type="email" 
                          name="email" 
                          required 
                          value={formData.email} 
                          onChange={handleChange} 
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red focus:border-brand-red text-slate-900 dark:text-white text-sm font-medium transition-colors" 
                          placeholder="jane@example.com" 
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                        Inquiry Type
                      </label>
                      <select 
                        name="type" 
                        value={formData.type} 
                        onChange={handleChange} 
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red focus:border-brand-red text-slate-900 dark:text-white text-sm font-medium transition-colors"
                      >
                        <option value="General Inquiry">General Inquiry</option>
                        <option value="Project Request">Project Request</option>
                        <option value="Tutoring Program">Tutoring Program</option>
                        <option value="Partnership">Partnership</option>
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                        Message
                      </label>
                      <textarea 
                        name="message" 
                        rows={5} 
                        required 
                        value={formData.message} 
                        onChange={handleChange} 
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red focus:border-brand-red text-slate-900 dark:text-white text-sm font-medium transition-colors resize-none" 
                        placeholder="Tell us about your project, questions, or goals..." 
                      />
                    </div>
                    
                    <Button 
                      type="submit" 
                      variant="primary" 
                      size="lg" 
                      fullWidth 
                      isLoading={loading}
                      className="uppercase tracking-widest shadow-lg shadow-brand-red/20 font-extrabold"
                    >
                      Send Message
                    </Button>
                  </form>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Contact;
