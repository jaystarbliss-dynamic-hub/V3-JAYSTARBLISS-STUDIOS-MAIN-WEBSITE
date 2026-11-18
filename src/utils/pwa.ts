import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const PWA_STANDALONE_SESSION_KEY = 'jaystar_pwa_standalone_mode';

// Module-level capture of beforeinstallprompt so lazy routes never miss an early browser event.
let capturedDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptSubscribers = new Set<(evt: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    capturedDeferredPrompt = e as BeforeInstallPromptEvent;
    promptSubscribers.forEach((cb) => cb(capturedDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    capturedDeferredPrompt = null;
    try {
      sessionStorage.setItem(PWA_STANDALONE_SESSION_KEY, '1');
    } catch {
      // ignore storage access errors
    }
    promptSubscribers.forEach((cb) => cb(null));
  });
}

/**
 * Returns true strictly when the OS / browser is running the app in an installed
 * standalone PWA window (or iOS Home Screen app / Android TWA) at the top level.
 * Never returns true inside an iframe or when a regular browser tab is merely in F11 fullscreen.
 */
export function isHardwareStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Installed PWAs always run in their own top-level OS window, never inside an iframe.
    if (window.self !== window.top) {
      return false;
    }
    // If explicitly opened as an external main-website link in Chrome/browser, treat as normal website.
    if (window.location.search.includes('open_external=1')) {
      return false;
    }
    const matchStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches;
    const iosStandalone =
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const androidAppReferrer =
      typeof document !== 'undefined' && document.referrer.startsWith('android-app://');
    return matchStandalone || iosStandalone || androidAppReferrer;
  } catch {
    return false;
  }
}

/**
 * Returns true strictly when running inside an OS-installed standalone PWA container
 * on PC or mobile (display-mode: standalone or iOS standalone).
 * Regular browser tabs always return false so the main public website is never restricted.
 */
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  const hardwareStandalone = isHardwareStandalone();
  try {
    if (!hardwareStandalone) {
      sessionStorage.removeItem(PWA_STANDALONE_SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return hardwareStandalone;
  }
}

/**
 * Allowed routes inside the installed Portal PWA.
 * Public marketing website routes (/, /programs, /about, /services, /portfolio, etc.)
 * are excluded so the installed app strictly serves portal authentication, registration,
 * dashboards, assessments, and admin operations.
 */
export function isPortalAppRoute(pathname: string): boolean {
  const clean = (pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  return (
    clean === '/portal' ||
    clean.startsWith('/portal/') ||
    clean === '/register' ||
    clean.startsWith('/register/') ||
    clean === '/admin' ||
    clean.startsWith('/admin/') ||
    clean === '/login'
  );
}

/**
 * Builds an external URL intended to open the main public website in Chrome / system browser
 * rather than navigating inside the installed PWA portal.
 */
export function getExternalMainWebsiteUrl(path = '/'): string {
  if (typeof window === 'undefined') return 'https://jaystarblissstudios.com/?open_external=1';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const separator = normalizedPath.includes('?') ? '&' : '?';
  return `${window.location.origin}${normalizedPath}${separator}open_external=1`;
}

export function useStandalonePWA(): boolean {
  const [standalone, setStandalone] = useState<boolean>(() => isStandalonePWA());

  useEffect(() => {
    setStandalone(isStandalonePWA());

    const mq = window.matchMedia('(display-mode: standalone)');
    const handleChange = () => setStandalone(isStandalonePWA());

    if (mq.addEventListener) {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);

  return standalone;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => capturedDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isStandalonePWA());
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandalonePWA());

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const subscriber = (evt: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(evt);
      if (!evt && isStandalonePWA()) {
        setIsInstalled(true);
      }
    };

    promptSubscribers.add(subscriber);
    return () => {
      promptSubscribers.delete(subscriber);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    const promptEvent = deferredPrompt || capturedDeferredPrompt;
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      capturedDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}
