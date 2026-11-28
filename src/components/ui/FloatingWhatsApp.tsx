import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const VERIFIED_WHATSAPP_NUMBER = '2349136518194';
const INACTIVITY_DELAY_MS = 10_000;

export const FloatingWhatsApp: React.FC = () => {
  const location = useLocation();
  const [phoneNumber, setPhoneNumber] = useState(VERIFIED_WHATSAPP_NUMBER);
  const [isIdle, setIsIdle] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [codingLabActive, setCodingLabActive] = useState<boolean>(
    () => typeof document !== 'undefined' && document.body.dataset.codingLabActive === '1'
  );

  useEffect(() => {
    const syncCodingLabState = () => {
      setCodingLabActive(
        typeof document !== 'undefined' && document.body.dataset.codingLabActive === '1'
      );
    };
    syncCodingLabState();
    window.addEventListener('jdi-coding-lab-visibility', syncCodingLabState);
    return () => window.removeEventListener('jdi-coding-lab-visibility', syncCodingLabState);
  }, []);

  // Show ONLY on the main public website, never on login, portal, admin dashboards, or Coding Lab.
  const isExcluded =
    codingLabActive ||
    location.pathname === '/portal' ||
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/coding-lab' ||
    location.pathname.startsWith('/coding-lab/') ||
    location.pathname.startsWith('/portal') ||
    location.pathname.startsWith('/admin');

  useEffect(() => {
    if (isExcluded) return;
    let active = true;
    const fetchNumber = async () => {
      try {
        const docRef = doc(db, 'settings', 'global');
        const snap = await getDoc(docRef);
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data();
          const raw = data.whatsappNumber || data.contactPhone || VERIFIED_WHATSAPP_NUMBER;
          const clean = String(raw).replace(/[^0-9]/g, '');
          if (clean && !clean.includes('913658194') && clean !== '234913658194') {
            setPhoneNumber(clean);
          } else {
            setPhoneNumber(VERIFIED_WHATSAPP_NUMBER);
          }
        }
      } catch {
        if (active) setPhoneNumber(VERIFIED_WHATSAPP_NUMBER);
      }
    };
    void fetchNumber();
    return () => {
      active = false;
    };
  }, [isExcluded]);

  // Collapse after ten seconds without page activity. Any normal page interaction
  // restores the full button and starts a fresh inactivity window.
  useEffect(() => {
    if (isExcluded) return;

    let timeoutId: number | undefined;
    let frameId: number | undefined;

    const resetIdleTimer = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);

      frameId = window.requestAnimationFrame(() => {
        setIsIdle(false);
      });

      timeoutId = window.setTimeout(() => {
        setIsIdle(true);
      }, INACTIVITY_DELAY_MS);
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'pointerdown',
      'wheel'
    ];

    activityEvents.forEach(eventName => {
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      activityEvents.forEach(eventName => {
        window.removeEventListener(eventName, resetIdleTimer);
      });
    };
  }, [isExcluded, location.pathname]);

  if (isExcluded) return null;

  const defaultMsg = encodeURIComponent(
    'Hello Jaystarbliss Studios! I would like to make an inquiry regarding your coding programs and services.'
  );
  const activeNumber = phoneNumber && !phoneNumber.includes('913658194') && phoneNumber !== '234913658194'
    ? phoneNumber
    : VERIFIED_WHATSAPP_NUMBER;
  const whatsappUrl = `https://wa.me/${activeNumber}?text=${defaultMsg}`;
  const compact = isIdle && !isHovered;

  return (
    <div
      className="fixed bottom-6 right-6 z-40 flex items-center justify-center pointer-events-auto"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Subtle ambient pulse ring effect. Keep it tied to the compact/expanded button size. */}
      <span
        className={`absolute rounded-full bg-[#25D366]/30 pointer-events-none transition-all duration-300 ${
          compact ? '-inset-0.5 opacity-30' : '-inset-1 opacity-60 animate-ping'
        }`}
      />
      <span
        className={`absolute rounded-full bg-[#25D366]/15 pointer-events-none transition-all duration-300 ${
          compact ? '-inset-1 opacity-20' : '-inset-2.5 opacity-100 animate-pulse'
        }`}
      />

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        title="Chat with us on WhatsApp"
        className={`relative rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-lg shadow-emerald-900/30 flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-emerald-400/40 transition-all duration-300 ease-out ${
          compact
            ? 'w-10 h-10 sm:w-11 sm:h-11 shadow-md'
            : 'w-13 h-13 sm:w-14 sm:h-14 hover:scale-110 active:scale-95'
        }`}
      >
        <svg
          className={`fill-current transition-all duration-300 ${compact ? 'w-5 h-5' : 'w-6.5 h-6.5 sm:w-7 sm:h-7'}`}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.188 8.188 0 012.41 5.82c0 4.54-3.7 8.24-8.24 8.24-1.44 0-2.84-.38-4.08-1.1l-.29-.17-3.03.79.81-2.95-.19-.3a8.216 8.216 0 01-1.26-4.33c0-4.54 3.7-8.24 8.24-8.24l.02-.18zm4.51 11.59c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.78 2.72 4.31 3.81.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.12-.23-.19-.48-.31z" />
        </svg>
      </a>
    </div>
  );
};
