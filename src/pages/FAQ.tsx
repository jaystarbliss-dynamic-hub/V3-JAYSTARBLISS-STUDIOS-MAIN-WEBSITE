import React, { useState } from 'react';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { ChevronDown } from 'lucide-react';
import Button from '../components/ui/Button';

const faqs = [
  {
    question: "Do I need prior experience to join a program?",
    answer: "For most of our beginner programs, no prior experience is required. We start from the basics and build up. Some advanced programs may require prerequisites, which will be clearly stated on the program page."
  },
  {
    question: "Are your programs online or physical?",
    answer: "We offer a mix of both. Many of our core digital skills programs are delivered online via live sessions, while some specialized bootcamps and school partnership programs are conducted physically. Check the specific program details for delivery format."
  },
  {
    question: "Do you build websites for small businesses?",
    answer: "Yes, we work with businesses of all sizes. Whether you need a simple landing page or a complex web application, our digital services team can help you build it."
  },
  {
    question: "How long does a typical web project take?",
    answer: "A standard business website typically takes 2-4 weeks from design to launch. More complex web applications can take 2-3 months. We will provide a specific timeline when you request a quote."
  },
  {
    question: "Do you offer certificates for your programs?",
    answer: "Yes, upon successful completion of our programs and submission of the final project, you will receive a verifiable certificate of completion."
  },
  {
    question: "Can I hire your students?",
    answer: "Absolutely. We are proud of the talent we develop. If you are looking to hire junior developers, designers, or digital marketers, please contact us."
  }
];

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <MainLayout>
      <SEO 
        title="Frequently Asked Questions" 
        description="Find answers to common questions about Jaystarbliss Studios programs, services, and educational pathways." 
      />

      {/* Header Banner */}
      <div className="jb-public-banner bg-brand-slate text-white py-20 lg:py-28 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10 text-center">
          <span className="inline-block text-xs font-black uppercase tracking-widest text-brand-red mb-3">
            Knowledge & Clarifications
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tight">
            FREQUENTLY ASKED QUESTIONS
          </h1>
          <p className="text-base sm:text-lg text-white/80 leading-relaxed font-normal max-w-2xl mx-auto">
            Find answers to common questions about our programs, services, and how we work.
          </p>
        </div>
      </div>

      {/* Accordion Area */}
      <div className="digital-canvas py-16 md:py-24 border-t border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          
          <div className="pro-surface rounded-[2rem] px-5 sm:px-10 divide-y divide-slate-200 dark:divide-slate-800">
            {faqs.map((faq, index) => {
              const isOpen = openIndex === index;
              return (
                <div key={index} className="transition-colors">
                  <button
                    type="button"
                    className="w-full py-6 sm:py-8 text-left flex justify-between items-start gap-6 focus:outline-none group"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                  >
                    <div className="flex items-baseline gap-4 sm:gap-6">
                      <span className="font-mono text-sm font-black text-slate-400 dark:text-slate-600 group-hover:text-brand-red transition-colors shrink-0">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="font-extrabold text-lg sm:text-xl text-brand-slate dark:text-white group-hover:text-brand-red transition-colors leading-snug">
                        {faq.question}
                      </span>
                    </div>

                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                      isOpen 
                        ? 'bg-brand-red text-white' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:bg-brand-red/10 group-hover:text-brand-red'
                    }`}>
                      <ChevronDown 
                        className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} 
                        size={18} 
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="pl-8 sm:pl-12 pr-6 pb-8 text-base text-slate-600 dark:text-slate-400 font-normal leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="mt-16 text-center">
            <p className="text-slate-500 dark:text-slate-400 mb-6 font-bold tracking-wider uppercase text-xs">
              Still have questions?
            </p>
            <Button to="/contact" variant="secondary" size="lg" className="shadow-lg">
              CONTACT US
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default FAQ;
