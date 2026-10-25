import React, { useState, useEffect } from 'react';
import { 
  Headphones, MessageCircle, Phone, Mail, MapPin, Send, 
  HelpCircle, Clock, CheckCircle2, ShieldCheck, 
  ExternalLink, ChevronDown, ChevronUp, AlertCircle, MessageSquare
} from 'lucide-react';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';
import { getEffectiveAuth } from '../../utils/impersonation';

interface Message {
  id: string;
  sender: 'user' | 'support';
  senderName: string;
  text: string;
  timestamp: any;
}

const PortalSupport: React.FC = () => {
  const { toast } = useToast();
  const effective = getEffectiveAuth();
  const user = auth.currentUser;

  const [category, setCategory] = useState('General Support');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // Live Chat State
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatTicketId, setChatTicketId] = useState<string>('');

  const userEmail = (effective.effectiveEmail || user?.email || sessionStorage.getItem('userEmail') || '').toLowerCase();
  const userName = sessionStorage.getItem('userName') || user?.displayName || userEmail.split('@')[0] || 'Portal Scholar';
  const userUid = effective.effectiveUid || user?.uid || '';
  const userRole = (effective.effectiveRole || sessionStorage.getItem('userRole') || 'student').toLowerCase();

  // Load active chat or tickets
  useEffect(() => {
    if (!userUid && !userEmail) return;

    const q = query(
      collection(db, 'supportTickets'),
      where('userEmail', '==', userEmail),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const latestDoc = snap.docs[0];
        setChatTicketId(latestDoc.id);
        const data = latestDoc.data();
        if (Array.isArray(data.messages)) {
          setChatMessages(data.messages);
        }
      }
    }, (err) => {
      console.warn('Support ticket listener note:', err);
    });

    return () => unsub();
  }, [userUid, userEmail]);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      return toast.error('Please enter a subject and your inquiry message.');
    }

    setSubmitting(true);
    try {
      const now = new Date();
      const initialMsg: Message = {
        id: `msg_${Date.now()}`,
        sender: 'user',
        senderName: userName,
        text: message.trim(),
        timestamp: now.toISOString()
      };

      const ticketRef = await addDoc(collection(db, 'supportTickets'), {
        userId: userUid || null,
        userName,
        userEmail,
        userRole,
        category,
        subject: subject.trim(),
        status: 'OPEN',
        priority: 'NORMAL',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messages: [
          initialMsg,
          {
            id: `msg_bot_${Date.now() + 1}`,
            sender: 'support',
            senderName: 'Jaystarbliss Desk',
            text: `Hello ${userName}! Your support request has been registered under ticket [${category}]. A learning coordinator will respond shortly. You can also chat directly here.`,
            timestamp: new Date(Date.now() + 1000).toISOString()
          }
        ]
      });

      // Also mirror to contact_messages for admin inquiry review
      await addDoc(collection(db, 'contact_messages'), {
        name: userName,
        email: userEmail,
        subject: `[${category}] ${subject.trim()}`,
        message: message.trim(),
        role: userRole,
        source: 'portal_support_center',
        createdAt: serverTimestamp()
      }).catch(() => undefined);

      setChatTicketId(ticketRef.id);
      setSubject('');
      setMessage('');
      toast.success('Support ticket submitted successfully! Check the live support chat below.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not submit support ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendLiveChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput.trim();
    setChatInput('');
    setSendingChat(true);

    try {
      const newMsg: Message = {
        id: `msg_${Date.now()}`,
        sender: 'user',
        senderName: userName,
        text: userText,
        timestamp: new Date().toISOString()
      };

      const updated = [...chatMessages, newMsg];
      setChatMessages(updated);

      // Automated helpful response after 1.5s
      setTimeout(() => {
        const autoReply: Message = {
          id: `msg_support_${Date.now()}`,
          sender: 'support',
          senderName: 'Academic Coordinator',
          text: `Thank you for your message. An advisor is reviewing your query regarding: "${userText.slice(0, 50)}...". For urgent live class or assessment assistance, reach us on WhatsApp at +234 812 345 6789.`,
          timestamp: new Date().toISOString()
        };
        setChatMessages(curr => [...curr, autoReply]);
      }, 1200);

    } catch (err: any) {
      console.warn('Chat error:', err);
    } finally {
      setSendingChat(false);
    }
  };

  const faqs = [
    {
      q: 'How do I join my scheduled live classroom?',
      a: 'Navigate to "Live Classrooms" from your portal sidebar. You will see scheduled sessions for your class. When the class is active, click "Join Live Classroom" to connect to Google Meet or the integrated interactive workspace.'
    },
    {
      q: 'How do school admins onboard new learners and issue access codes?',
      a: 'Go to "Learners Roster" or "Onboard Student" in the School Portal. Fill in the student\'s name, class, and program track. Click "Create Student Portal Access" to generate immediate access credentials. You can print or download credential cards as PDF/PNG.'
    },
    {
      q: 'How do parents request new child enrollments and view schedules?',
      a: 'From the Parent Dashboard, click "Enroll New Child". Pick your preferred programme and subjects. Once admissions reviews the request, your child\'s profile and timetable will appear on your dashboard.'
    },
    {
      q: 'Where do I submit assignments and view my CBT quiz scores?',
      a: 'Students can visit the "Assessments & Quizzes" or "Lesson Resources" tabs in their student portal to complete CBT tests, review milestones, and download notes.'
    }
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      <SEO title="Help & Support Center | Jaystarbliss Studios" description="Get instant support, contact advisors, and chat with the customer care desk." noindex={true} />

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-[#182335] to-slate-900 text-white p-6 sm:p-8 shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-red text-white">
              <Headphones size={13} /> Jaystarbliss Customer Support Center
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">How can we help you today?</h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              Get direct assistance with student enrollment, live classes, school lab access, CBT examinations, tuition, and technical queries.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href="https://wa.me/2348123456789?text=Hello%20Jaystarbliss%20Support,%20I%20need%20assistance"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md"
            >
              <MessageCircle size={16} />
              <span>WhatsApp Live Help</span>
            </a>
            <a
              href="tel:+2348123456789"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all border border-white/10"
            >
              <Phone size={15} />
              <span>Call Helpline</span>
            </a>
          </div>
        </div>
      </div>

      {/* 4 Multi-Channel Contact Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="pro-surface rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#161B26] shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3">
            <Phone size={20} />
          </div>
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Direct Phone Lines</h3>
          <p className="text-xs text-slate-500 mt-1 font-mono">+234 812 345 6789</p>
          <p className="text-xs text-slate-500 font-mono">+234 901 234 5678</p>
          <span className="inline-block mt-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Mon – Sat: 8:00 AM – 6:00 PM</span>
        </div>

        <div className="pro-surface rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#161B26] shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
            <MessageCircle size={20} />
          </div>
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Instant WhatsApp</h3>
          <p className="text-xs text-slate-500 mt-1">Chat directly with an academic advisor in seconds.</p>
          <a
            href="https://wa.me/2348123456789"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline mt-2"
          >
            Start Chat <ExternalLink size={12} />
          </a>
        </div>

        <div className="pro-surface rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#161B26] shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-brand-red/10 text-brand-red flex items-center justify-center mb-3">
            <Mail size={20} />
          </div>
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Support Emails</h3>
          <p className="text-xs text-slate-500 mt-1">General: support@jaystarbliss.com</p>
          <p className="text-xs text-slate-500">Admissions: admissions@jaystarbliss.com</p>
          <span className="inline-block mt-2 text-[10px] text-slate-400 font-medium">Average response time: &lt; 2 hrs</span>
        </div>

        <div className="pro-surface rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#161B26] shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center mb-3">
            <MapPin size={20} />
          </div>
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Tech Studios & Hub</h3>
          <p className="text-xs text-slate-500 mt-1">Lekki Phase 1 Innovation Hub</p>
          <p className="text-xs text-slate-500">Ikeja Coding & Robotics Studio</p>
          <span className="inline-block mt-2 text-[10px] text-purple-600 dark:text-purple-400 font-bold">Lagos, Nigeria</span>
        </div>
      </div>

      {/* Main Grid: Ticket Submission & Live Chat Window */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Create Ticket Form (5 Cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#161B26] rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-red">Submit Inquiry</span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create a Support Ticket</h2>
            <p className="text-xs text-slate-500 mt-1">
              Your message will be logged directly for review by the admin & support team.
            </p>
          </div>

          <form onSubmit={handleSubmitTicket} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Inquiry Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="General Support">General Support & Guidance</option>
                <option value="Admissions & Enrollment">Child Enrollment & Plan Selection</option>
                <option value="Live Classrooms">Live Classroom & Schedule Issues</option>
                <option value="School Onboarding">School Partner & Student Onboarding</option>
                <option value="Billing & Tuition">Billing, Fees & Payments</option>
                <option value="Technical Issue">Technical Bug or Login Issue</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Subject / Summary</label>
              <input
                type="text"
                required
                placeholder="e.g. Question about Scratch & Python schedule"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Inquiry Details</label>
              <textarea
                required
                rows={4}
                placeholder="Explain what you need assistance with in detail..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-11 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send size={14} />
              <span>{submitting ? 'Submitting Ticket…' : 'Submit Support Ticket'}</span>
            </button>
          </form>
        </div>

        {/* Right Column: Interactive Support Chat Center (7 Cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#161B26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col h-[520px] overflow-hidden">
          {/* Chat Header */}
          <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-brand-red text-white flex items-center justify-center text-xs font-bold">
                  JS
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  Jaystar Support Desk
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold">Online</span>
                </h3>
                <p className="text-[10px] text-slate-500">Live chat assistance for scholars, parents & schools</p>
              </div>
            </div>
            <span className="text-[10px] font-mono text-slate-400">24/7 Desk</span>
          </div>

          {/* Chat Stream Window */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/30 dark:bg-slate-950/20 custom-scrollbar">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 text-slate-400">
                <MessageSquare size={36} className="text-slate-300 dark:text-slate-700" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Jaystar Support Chat Ready</p>
                <p className="text-[11px] max-w-xs text-slate-400">
                  Type your question below or submit a ticket to start a direct thread with our academic coordinators.
                </p>
              </div>
            ) : (
              chatMessages.map(msg => {
                const isUser = msg.sender === 'user';
                return (
                  <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className="text-[10px] font-semibold text-slate-400 mb-1 px-1">{msg.senderName}</div>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs ${
                        isUser
                          ? 'bg-brand-red text-white rounded-tr-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 shadow-xs rounded-tl-xs'
                      }`}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      <span className={`block text-[9px] mt-1 ${isUser ? 'text-white/70' : 'text-slate-400'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Chat Input Bar */}
          <form onSubmit={handleSendLiveChat} className="p-3 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#161B26] flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask a question or describe your issue..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              className="flex-1 min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-red"
            />
            <button
              type="submit"
              disabled={sendingChat || !chatInput.trim()}
              className="min-h-10 px-4 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-40"
            >
              <Send size={14} />
              <span>Send</span>
            </button>
          </form>
        </div>

      </div>

      {/* Frequently Asked Questions Accordion */}
      <div className="bg-white dark:bg-[#161B26] rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <HelpCircle size={20} className="text-brand-red" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Quick Help & Frequently Asked Questions</h2>
            <p className="text-xs text-slate-500">Fast answers for student, parent, school, and tutor workflows.</p>
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          {faqs.map((faq, index) => {
            const isOpen = activeFaq === index;
            return (
              <div
                key={index}
                className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : index)}
                  className="w-full p-4 text-left flex items-center justify-between gap-3 text-xs font-bold text-slate-900 dark:text-white hover:text-brand-red transition-colors"
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-200/40 dark:border-slate-800/40 pt-2.5">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default PortalSupport;
