import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

export interface MetaData {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  canonical?: string;
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
  structuredData?: object;
}

interface MetaTagsContextType {
  meta: MetaData;
  setMeta: (meta: MetaData) => void;
  resetMeta: () => void;
}

const BRAND_NAME = 'Jaystarbliss Studios';
const BASE_PRODUCTION_URL = 'https://jaystarblissstudios.com';
const DEFAULT_IMAGE = `${BASE_PRODUCTION_URL}/favicon.png`;
const DEFAULT_DESCRIPTION = 'Jaystarbliss Studios is a modern technology, creative and educational studio in Lagos, Nigeria. We teach practical skills, build scalable software, and engineer digital solutions.';
const DEFAULT_KEYWORDS = 'Jaystarbliss Studios, coding for kids Lagos, tech education Nigeria, web development Lagos, programming courses Nigeria, robotics for kids, software development, creative digital solutions, coding academy Nigeria';

// Comprehensive default route metadata map
const ROUTE_META_MAP: Record<string, MetaData> = {
  '/': {
    title: `${BRAND_NAME} | Learn. Build. Create. Grow.`,
    description: 'Jaystarbliss Studios is a modern technology, creative and educational studio in Lagos, Nigeria. We teach practical skills, build scalable software, and engineer digital solutions.',
    keywords: DEFAULT_KEYWORDS,
    type: 'website'
  },
  '/about': {
    title: `${BRAND_NAME} | About Us & Mission`,
    description: 'Learn about Jaystarbliss Studios, our journey, visionary leadership, and commitment to transforming tech education and enterprise solutions across Africa.',
    keywords: 'about Jaystarbliss Studios, tech education mission, Lagos coding academy, technology educators Nigeria',
    type: 'website'
  },
  '/programs': {
    title: `${BRAND_NAME} | Tech, Coding & Robotics Programs`,
    description: 'Explore comprehensive coding, robotics, creative arts, and academic excellence courses for kids, teens, and young professionals in Lagos.',
    keywords: 'coding courses kids Lagos, Python classes, Scratch programming, robotics workshop, web development curriculum',
    type: 'website'
  },
  '/services': {
    title: `${BRAND_NAME} | Digital Solutions & IT Services`,
    description: 'Bespoke web development, school coding lab setup, enterprise software engineering, and corporate tech training tailored for schools and businesses.',
    keywords: 'software development Lagos, school portal developer, website design Lagos, corporate IT training Nigeria',
    type: 'website'
  },
  '/portfolio': {
    title: `${BRAND_NAME} | Project Showcase & Student Games`,
    description: 'Discover innovative web apps, interactive games built by our young student coders, and enterprise software solutions deployed by Jaystarbliss Studios.',
    keywords: 'student coding projects, kids games portfolio, web apps showcase, software case studies',
    type: 'website'
  },
  '/magic-particles': {
    title: `${BRAND_NAME} | Interactive 3D Particles & Gesture Lab`,
    description: 'Experience cutting-edge 3D interactive graphics, particle systems, and AI hand gesture tracking built with Three.js and MediaPipe.',
    keywords: 'Three.js particles, WebGL interactive lab, hand tracking demo, AI gesture controls',
    type: 'website'
  },
  '/kids-zone/magic': {
    title: `${BRAND_NAME} | Interactive 3D Particles & Gesture Lab`,
    description: 'Experience cutting-edge 3D interactive graphics, particle systems, and AI hand gesture tracking built with Three.js and MediaPipe.',
    keywords: 'Three.js particles, WebGL interactive lab, hand tracking demo, AI gesture controls',
    type: 'website'
  },
  '/resources': {
    title: `${BRAND_NAME} | Curriculum & Resource Library`,
    description: 'Access curated termly syllabi, lesson notes, code cheatsheets, CBT practice exams, and hands-on worksheets for students and educators.',
    keywords: 'curriculum download, coding lesson notes, Python cheatsheet, Scratch guides, school worksheets',
    type: 'website'
  },
  '/blog': {
    title: `${BRAND_NAME} | Tech Insights, News & Tutorials`,
    description: 'Read the latest technology tutorials, studio news, coding tips, and educational thought leadership from Jaystarbliss Studios.',
    keywords: 'tech blog Lagos, coding tutorials, technology education articles, Jaystarbliss news',
    type: 'website'
  },
  '/faq': {
    title: `${BRAND_NAME} | FAQ & Help Center`,
    description: 'Find clear answers regarding student admissions, class schedules, pricing, school technology partnerships, and digital service deliveries.',
    keywords: 'Jaystarbliss FAQ, coding class admission questions, school partnership costs',
    type: 'website'
  },
  '/contact': {
    title: `${BRAND_NAME} | Contact Us & Studio Location`,
    description: 'Get in touch with Jaystarbliss Studios. Book a consultation, visit our studio in Lagos, or reach out via WhatsApp, phone, or email.',
    keywords: 'contact Jaystarbliss, tech studio Lagos address, coding school phone number, technology consultation',
    type: 'website'
  },
  '/project-request': {
    title: `${BRAND_NAME} | Start a Project & Request Quote`,
    description: 'Submit your software, school portal, or custom tech lab requirements for a rapid technical proposal and transparent price estimate.',
    keywords: 'hire software developers Lagos, request web app quote, school portal quotation',
    type: 'website'
  },
  '/school-partnership': {
    title: `${BRAND_NAME} | Partner School Coding & Tech Clubs`,
    description: 'Empower your school with modern ICT & coding curricula, hands-on robotics workshops, and dedicated certified coding tutors.',
    keywords: 'school coding partnership Lagos, school coding club setup, curriculum integration Nigeria',
    type: 'website'
  },
  '/tutors': {
    title: `${BRAND_NAME} | Find Expert Tech & Academic Tutors`,
    description: 'Connect with verified 1-on-1 and small group tutors for coding, mathematics, science, music, and digital literacy in Lagos and online.',
    keywords: 'private coding tutor Lagos, home tutor Lagos, WAEC math tutor, Python private teacher',
    type: 'website'
  },
  '/find-tutor': {
    title: `${BRAND_NAME} | Find Expert Tech & Academic Tutors`,
    description: 'Connect with verified 1-on-1 and small group tutors for coding, mathematics, science, music, and digital literacy in Lagos and online.',
    keywords: 'private coding tutor Lagos, home tutor Lagos, WAEC math tutor, Python private teacher',
    type: 'website'
  },
  '/tutor-application': {
    title: `${BRAND_NAME} | Apply to Become an Instructor`,
    description: 'Join the Jaystarbliss Studios teaching team as a certified technology instructor, coding mentor, or academic tutor.',
    keywords: 'teach coding Lagos, tutor job openings, coding instructor vacancies',
    type: 'website'
  },
  '/portal': {
    title: `${BRAND_NAME} | Portal Login & Access`,
    description: 'Sign in to access your student courses, parent progress tracker, tutor management hub, or partner school dashboard.',
    keywords: 'Jaystarbliss portal login, student login, parent portal, tutor portal',
    type: 'website',
    noindex: true
  },
  '/register': {
    title: `${BRAND_NAME} | Enroll in Programs`,
    description: 'Enroll in cutting-edge coding, software engineering, and creative technology programs at Jaystarbliss Studios today.',
    keywords: 'register coding class, enroll tech bootcamp Lagos, student registration',
    type: 'website'
  },
  '/portal/student': {
    title: `${BRAND_NAME} | Student Dashboard`,
    description: 'Access your active courses, assignments, badges, and learning materials on Jaystarbliss Studios.',
    noindex: true
  },
  '/portal/student/resources': {
    title: `${BRAND_NAME} | Student Resource Library`,
    description: 'Browse, preview, and download syllabi, lesson notes, and project assets.',
    noindex: true
  },
  '/portal/student/calendar': {
    title: `${BRAND_NAME} | Class Schedule & Timetable`,
    description: 'View your upcoming class sessions, labs, and workshop schedules.',
    noindex: true
  },
  '/portal/student/courses': {
    title: `${BRAND_NAME} | My Learning Tracks & Courses`,
    description: 'Track course modules, milestones, and hands-on coding challenges.',
    noindex: true
  },
  '/portal/student/payments': {
    title: `${BRAND_NAME} | Tuition & Payment History`,
    description: 'View payment receipts, pending invoices, and course tuition details.',
    noindex: true
  },
  '/portal/student/settings': {
    title: `${BRAND_NAME} | Account Settings`,
    description: 'Manage profile information, avatar, password, and preferences.',
    noindex: true
  },
  '/portal/parent': {
    title: `${BRAND_NAME} | Parent Monitoring Hub`,
    description: 'Track your child’s academic progress, attendance, and project deliverables.',
    noindex: true
  },
  '/portal/staff': {
    title: `${BRAND_NAME} | Staff & Tutor Management`,
    description: 'Manage student cohorts, attendance, grades, and instructional assets.',
    noindex: true
  },
  '/portal/school': {
    title: `${BRAND_NAME} | Partner School Admin Portal`,
    description: 'Administer enrolled school students, termly curriculum, and class schedules.',
    noindex: true
  },
  '/admin': {
    title: `${BRAND_NAME} | Studio Administration`,
    description: 'Jaystarbliss Studios internal administration console.',
    noindex: true
  }
};

const formatTitle = (rawTitle?: string): string => {
  if (!rawTitle) return `${BRAND_NAME} | Learn. Build. Create. Grow.`;
  if (rawTitle.startsWith(`${BRAND_NAME} |`)) return rawTitle;
  if (rawTitle.includes(`| ${BRAND_NAME}`)) {
    const stripped = rawTitle.replace(`| ${BRAND_NAME}`, '').trim();
    return `${BRAND_NAME} | ${stripped}`;
  }
  if (rawTitle.trim() === BRAND_NAME) return `${BRAND_NAME} | Learn. Build. Create. Grow.`;
  return `${BRAND_NAME} | ${rawTitle.trim()}`;
};

const MetaTagsContext = createContext<MetaTagsContextType | undefined>(undefined);

export const MetaTagsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [customMeta, setCustomMeta] = useState<MetaData | null>(null);

  // Compute default meta for current path or matching route pattern
  const defaultRouteMeta = useMemo(() => {
    const pathname = location.pathname;
    
    // Direct match
    if (ROUTE_META_MAP[pathname]) {
      return ROUTE_META_MAP[pathname];
    }

    // Prefix matches for dynamic routes
    if (pathname.startsWith('/programs/')) {
      return {
        title: `${BRAND_NAME} | Program Details & Curriculum`,
        description: 'Explore full course details, learning objectives, modules, and schedule at Jaystarbliss Studios.',
        type: 'website' as const
      };
    }
    if (pathname.startsWith('/services/')) {
      return {
        title: `${BRAND_NAME} | Service Details & Capabilities`,
        description: 'Discover specialized digital solutions, engineering specs, and project deliverables from Jaystarbliss Studios.',
        type: 'website' as const
      };
    }
    if (pathname.startsWith('/blog/')) {
      return {
        title: `${BRAND_NAME} | Tech Blog & Tutorial`,
        description: 'Read the latest technical guide and educational insight from Jaystarbliss Studios.',
        type: 'article' as const
      };
    }
    if (pathname.startsWith('/portal/')) {
      return {
        title: `${BRAND_NAME} | Member Portal`,
        description: 'Access the Jaystarbliss Studios authenticated user portal.',
        noindex: true
      };
    }
    if (pathname.startsWith('/admin')) {
      return {
        title: `${BRAND_NAME} | Administration Console`,
        description: 'Internal Jaystarbliss Studios administration portal.',
        noindex: true
      };
    }

    return {
      title: `${BRAND_NAME} | Learn. Build. Create. Grow.`,
      description: DEFAULT_DESCRIPTION,
      keywords: DEFAULT_KEYWORDS,
      type: 'website' as const
    };
  }, [location.pathname]);

  // Reset custom page-level overrides when route changes
  useEffect(() => {
    setCustomMeta(null);
  }, [location.pathname]);

  // Merge active metadata (custom page overrides take precedence over route defaults)
  const activeMeta = useMemo(() => {
    return {
      ...defaultRouteMeta,
      ...(customMeta || {})
    };
  }, [defaultRouteMeta, customMeta]);

  // Synchronize with DOM `<head>` elements
  useEffect(() => {
    const formattedTitle = formatTitle(activeMeta.title);
    const description = activeMeta.description || DEFAULT_DESCRIPTION;
    const keywords = activeMeta.keywords || DEFAULT_KEYWORDS;
    const image = activeMeta.image || DEFAULT_IMAGE;
    const type = activeMeta.type || 'website';
    const noindex = Boolean(activeMeta.noindex);
    const canonicalUrl = activeMeta.canonical || `${BASE_PRODUCTION_URL}${location.pathname}`;

    // 1. Title tag
    document.title = formattedTitle;

    // Helper for meta tags
    const setMetaTag = (attrName: string, attrVal: string, content: string) => {
      let element = document.querySelector(`meta[${attrName}="${attrVal}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attrName, attrVal);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    // 2. Primary Meta Tags
    setMetaTag('name', 'title', formattedTitle);
    setMetaTag('name', 'description', description);
    setMetaTag('name', 'keywords', keywords);

    // 3. OpenGraph Tags
    setMetaTag('property', 'og:title', formattedTitle);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', type);
    setMetaTag('property', 'og:url', canonicalUrl);
    setMetaTag('property', 'og:image', image);
    setMetaTag('property', 'og:site_name', BRAND_NAME);

    // 4. Twitter Tags
    setMetaTag('name', 'twitter:title', formattedTitle);
    setMetaTag('name', 'twitter:description', description);
    setMetaTag('name', 'twitter:url', canonicalUrl);
    setMetaTag('name', 'twitter:image', image);
    setMetaTag('name', 'twitter:card', 'summary_large_image');

    // 5. Robots
    if (noindex) {
      setMetaTag('name', 'robots', 'noindex, nofollow');
      setMetaTag('name', 'googlebot', 'noindex, nofollow');
    } else {
      setMetaTag('name', 'robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
      setMetaTag('name', 'googlebot', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
    }

    // 6. Canonical link
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', canonicalUrl);

    // 7. Structured Data JSON-LD
    let dynamicScript = document.getElementById('dynamic-page-ldjson') as HTMLScriptElement | null;
    if (activeMeta.structuredData) {
      if (!dynamicScript) {
        dynamicScript = document.createElement('script');
        dynamicScript.type = 'application/ld+json';
        dynamicScript.id = 'dynamic-page-ldjson';
        document.head.appendChild(dynamicScript);
      }
      dynamicScript.text = JSON.stringify(activeMeta.structuredData);
    } else if (dynamicScript && dynamicScript.parentNode) {
      dynamicScript.parentNode.removeChild(dynamicScript);
    }
  }, [activeMeta, location.pathname]);

  const setMeta = useCallback((newMeta: MetaData) => {
    setCustomMeta(prev => {
      // Check if newMeta actually differs from prev
      if (prev) {
        const isSame = 
          prev.title === newMeta.title &&
          prev.description === newMeta.description &&
          prev.keywords === newMeta.keywords &&
          prev.image === newMeta.image &&
          prev.canonical === newMeta.canonical &&
          prev.type === newMeta.type &&
          prev.noindex === newMeta.noindex &&
          JSON.stringify(prev.structuredData) === JSON.stringify(newMeta.structuredData);
        if (isSame) return prev;
      }
      return { ...(prev || {}), ...newMeta };
    });
  }, []);

  const resetMeta = useCallback(() => {
    setCustomMeta(prev => (prev === null ? prev : null));
  }, []);

  return (
    <MetaTagsContext.Provider value={{ meta: activeMeta, setMeta, resetMeta }}>
      {children}
    </MetaTagsContext.Provider>
  );
};

export const useMetaTags = () => {
  const context = useContext(MetaTagsContext);
  if (!context) {
    throw new Error('useMetaTags must be used within a MetaTagsProvider');
  }
  return context;
};
