import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getAllClientDatabases } from './firebase';

export interface EditableSectionConfig {
  id: string;
  name: string;
  description: string;
  defaultData: Record<string, any>;
  fields: Array<{
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'image' | 'url' | 'boolean' | 'list' | 'select';
    placeholder?: string;
    options?: string[];
    subfields?: Array<{ key: string; label: string; type: string }>;
  }>;
}

export interface EditablePageConfig {
  id: string;
  title: string;
  path: string;
  description: string;
  sections: EditableSectionConfig[];
}

export const CMS_PAGES: EditablePageConfig[] = [
  {
    id: 'home',
    title: 'Home Page',
    path: '/',
    description: 'Main landing page sections, hero text, value proposition, and feature previews.',
    sections: [
      {
        id: 'hero',
        name: 'Hero Section',
        description: 'Main introduction headline and interactive orb area text.',
        defaultData: {
          tagline: 'DIGITAL INNOVATION & EDUCATION',
          headingLine1: 'LEARN. BUILD.',
          headingLine2: 'CREATE. GROW.',
          description: 'Jaystarbliss Studios empowers the next generation through practical tech education, coding programs for kids, and scalable software solutions.',
          primaryCtaText: 'EXPLORE PROGRAMS',
          primaryCtaLink: '/programs',
          secondaryCtaText: 'OUR SERVICES',
          secondaryCtaLink: '/services',
          heroWatermarkImage: ''
        },
        fields: [
          { key: 'tagline', label: 'Top Tagline', type: 'text' },
          { key: 'headingLine1', label: 'Heading Line 1', type: 'text' },
          { key: 'headingLine2', label: 'Heading Line 2', type: 'text' },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'primaryCtaText', label: 'Primary Button Text', type: 'text' },
          { key: 'primaryCtaLink', label: 'Primary Button URL', type: 'text' },
          { key: 'secondaryCtaText', label: 'Secondary Button Text', type: 'text' },
          { key: 'secondaryCtaLink', label: 'Secondary Button URL', type: 'text' },
          { key: 'heroWatermarkImage', label: 'Hero Sphere Logo / Watermark', type: 'image' }
        ]
      },
      {
        id: 'pillars',
        name: 'Core Pillars Section',
        description: 'The 3 foundational pillars of Jaystarbliss Studios.',
        defaultData: {
          title: 'WHAT WE STAND FOR',
          subtitle: 'Empowering minds with practical skills, innovative thinking, and real-world execution.',
          pillar1Title: 'Practical Learning',
          pillar1Desc: 'Hands-on projects where students create real games, apps, and hardware prototypes.',
          pillar2Title: 'Modern Tech Stack',
          pillar2Desc: 'Cutting-edge curriculum covering Python, Artificial Intelligence, Robotics, and Web Development.',
          pillar3Title: 'Mentorship & Care',
          pillar3Desc: 'Experienced instructors who inspire confidence, curiosity, and high academic performance.'
        },
        fields: [
          { key: 'title', label: 'Section Title', type: 'text' },
          { key: 'subtitle', label: 'Section Subtitle', type: 'textarea' },
          { key: 'pillar1Title', label: 'Pillar 1 Title', type: 'text' },
          { key: 'pillar1Desc', label: 'Pillar 1 Description', type: 'textarea' },
          { key: 'pillar2Title', label: 'Pillar 2 Title', type: 'text' },
          { key: 'pillar2Desc', label: 'Pillar 2 Description', type: 'textarea' },
          { key: 'pillar3Title', label: 'Pillar 3 Title', type: 'text' },
          { key: 'pillar3Desc', label: 'Pillar 3 Description', type: 'textarea' }
        ]
      },
      {
        id: 'programs_preview',
        name: 'Featured Programs Section',
        description: 'Section header and call-to-action for programs preview.',
        defaultData: {
          title: 'LEARN SOMETHING YOU CAN USE.',
          subtitle: 'Our programs are designed around practical learning. You don\'t just learn the theory — you get opportunities to practise, create and apply what you\'ve learned.',
          ctaText: 'VIEW ALL PROGRAMS',
          ctaLink: '/programs'
        },
        fields: [
          { key: 'title', label: 'Section Title (Keeps to 1 line)', type: 'text' },
          { key: 'subtitle', label: 'Section Description (2 lines)', type: 'textarea' },
          { key: 'ctaText', label: 'Button Text', type: 'text' },
          { key: 'ctaLink', label: 'Button Link', type: 'text' }
        ]
      },
      {
        id: 'services_preview',
        name: 'Featured Services Section',
        description: 'Heading and description for enterprise & creative services.',
        defaultData: {
          title: 'DIGITAL & CREATIVE SERVICES.',
          subtitle: 'From enterprise platforms to custom branding and institutional software labs, we craft digital products that deliver.',
          ctaText: 'VIEW ALL SERVICES',
          ctaLink: '/services'
        },
        fields: [
          { key: 'title', label: 'Section Title', type: 'text' },
          { key: 'subtitle', label: 'Section Subtitle', type: 'textarea' },
          { key: 'ctaText', label: 'Button Text', type: 'text' },
          { key: 'ctaLink', label: 'Button Link', type: 'text' }
        ]
      },
      {
        id: 'portfolio_preview',
        name: 'Featured Portfolio Section',
        description: 'Heading and subtitle for showcase projects.',
        defaultData: {
          title: 'PROVEN RESULTS. REAL IMPACT.',
          subtitle: 'Explore our latest software engineering deployments and young coder creations.',
          ctaText: 'VIEW ALL PROJECTS',
          ctaLink: '/portfolio'
        },
        fields: [
          { key: 'title', label: 'Section Title', type: 'text' },
          { key: 'subtitle', label: 'Section Subtitle', type: 'textarea' },
          { key: 'ctaText', label: 'Button Text', type: 'text' },
          { key: 'ctaLink', label: 'Button Link', type: 'text' }
        ]
      },
      {
        id: 'learning_method',
        name: 'Learning Method & Philosophy',
        description: 'How our pedagogy works step-by-step.',
        defaultData: {
          title: 'HOW WE TEACH',
          subtitle: 'A structured 4-stage pipeline moving from foundational principles to independent student creation.',
          step1Title: '1. Foundation & Concepts',
          step1Desc: 'Mastering core logical and algorithmic structures through interactive challenges.',
          step2Title: '2. Guided Practice',
          step2Desc: 'Building live apps and simulations with real-time feedback from expert mentors.',
          step3Title: '3. Independent Creation',
          step3Desc: 'Students design and implement their own original projects from scratch.',
          step4Title: '4. Showcase & Presentation',
          step4Desc: 'Publishing student work online and pitching prototypes to peers and parents.'
        },
        fields: [
          { key: 'title', label: 'Section Title', type: 'text' },
          { key: 'subtitle', label: 'Section Subtitle', type: 'textarea' },
          { key: 'step1Title', label: 'Step 1 Title', type: 'text' },
          { key: 'step1Desc', label: 'Step 1 Description', type: 'textarea' },
          { key: 'step2Title', label: 'Step 2 Title', type: 'text' },
          { key: 'step2Desc', label: 'Step 2 Description', type: 'textarea' },
          { key: 'step3Title', label: 'Step 3 Title', type: 'text' },
          { key: 'step3Desc', label: 'Step 3 Description', type: 'textarea' },
          { key: 'step4Title', label: 'Step 4 Title', type: 'text' },
          { key: 'step4Desc', label: 'Step 4 Description', type: 'textarea' }
        ]
      },
      {
        id: 'final_cta',
        name: 'Bottom Call-to-Action',
        description: 'Final banner section before footer.',
        defaultData: {
          title: 'READY TO START YOUR JOURNEY?',
          subtitle: 'Join hundreds of young learners, schools, and forward-thinking organisations building the future with Jaystarbliss Studios.',
          primaryBtnText: 'ENROLL TODAY',
          primaryBtnLink: '/register',
          secondaryBtnText: 'REQUEST A PROJECT',
          secondaryBtnLink: '/project-request',
          backgroundImage: ''
        },
        fields: [
          { key: 'title', label: 'Headline', type: 'text' },
          { key: 'subtitle', label: 'Description', type: 'textarea' },
          { key: 'primaryBtnText', label: 'Primary Button Text', type: 'text' },
          { key: 'primaryBtnLink', label: 'Primary Button URL', type: 'text' },
          { key: 'secondaryBtnText', label: 'Secondary Button Text', type: 'text' },
          { key: 'secondaryBtnLink', label: 'Secondary Button URL', type: 'text' },
          { key: 'backgroundImage', label: 'Background Image (Cloudinary)', type: 'image' }
        ]
      }
    ]
  },
  {
    id: 'about',
    title: 'About Page',
    path: '/about',
    description: 'Story, mission, core beliefs, and operational values.',
    sections: [
      {
        id: 'hero',
        name: 'About Hero Header',
        description: 'Main introduction on About page.',
        defaultData: {
          title: 'WE TEACH. WE BUILD. WE CREATE.',
          paragraph1: 'Jaystarbliss Studios is a learning, technology and creative company built around a simple idea: people learn better when they get the opportunity to actually use what they\'re learning.',
          paragraph2: 'What started from a focus on teaching has grown into a broader ecosystem where education, technology and creativity meet.',
          paragraph3: 'Today, Jaystarbliss Studios supports students, families, schools and businesses through practical learning programs, digital services and creative work.',
          bannerImage: ''
        },
        fields: [
          { key: 'title', label: 'Main Headline', type: 'text' },
          { key: 'paragraph1', label: 'Paragraph 1', type: 'textarea' },
          { key: 'paragraph2', label: 'Paragraph 2', type: 'textarea' },
          { key: 'paragraph3', label: 'Paragraph 3', type: 'textarea' },
          { key: 'bannerImage', label: 'Banner Image (Cloudinary)', type: 'image' }
        ]
      },
      {
        id: 'beliefs',
        name: 'What We Believe',
        description: 'Core 4 principles displayed in the editorial rows.',
        defaultData: {
          sectionTitle: 'WHAT WE BELIEVE',
          sectionSubtitle: 'The foundational principles that guide how we teach, engineer solutions, and collaborate with our community.',
          b1Title: 'PRACTICAL SKILLS MATTER',
          b1Desc: 'Learning should prepare people to do something, not simply remember something.',
          b2Title: 'CREATIVITY MATTERS',
          b2Desc: 'Technology is powerful, but creativity is what helps people use it in meaningful ways.',
          b3Title: 'GOOD WORK TAKES CARE',
          b3Desc: 'Whether we\'re teaching a student or building a website for a client, we believe the details matter.',
          b4Title: 'PEOPLE COME FIRST',
          b4Desc: 'Every student, parent, school and client has different needs. We listen before we recommend.'
        },
        fields: [
          { key: 'sectionTitle', label: 'Section Title', type: 'text' },
          { key: 'sectionSubtitle', label: 'Section Subtitle', type: 'textarea' },
          { key: 'b1Title', label: 'Belief 1 Title', type: 'text' },
          { key: 'b1Desc', label: 'Belief 1 Description', type: 'textarea' },
          { key: 'b2Title', label: 'Belief 2 Title', type: 'text' },
          { key: 'b2Desc', label: 'Belief 2 Description', type: 'textarea' },
          { key: 'b3Title', label: 'Belief 3 Title', type: 'text' },
          { key: 'b3Desc', label: 'Belief 3 Description', type: 'textarea' },
          { key: 'b4Title', label: 'Belief 4 Title', type: 'text' },
          { key: 'b4Desc', label: 'Belief 4 Description', type: 'textarea' }
        ]
      }
    ]
  },
  {
    id: 'services',
    title: 'Services Page',
    path: '/services',
    description: 'Header and service categories introduction.',
    sections: [
      {
        id: 'hero',
        name: 'Services Hero Header',
        description: 'Headline and description on the Services catalog.',
        defaultData: {
          title: 'SOLUTIONS THAT DELIVER.',
          subtitle: 'From interactive software platforms to enterprise school management systems and branding, we provide end-to-end digital solutions.',
          ctaText: 'REQUEST A PROJECT',
          ctaLink: '/project-request',
          bannerImage: ''
        },
        fields: [
          { key: 'title', label: 'Header Title', type: 'text' },
          { key: 'subtitle', label: 'Header Subtitle', type: 'textarea' },
          { key: 'ctaText', label: 'CTA Button Text', type: 'text' },
          { key: 'ctaLink', label: 'CTA Button Link', type: 'text' },
          { key: 'bannerImage', label: 'Banner Image (Cloudinary)', type: 'image' }
        ]
      }
    ]
  },
  {
    id: 'programs',
    title: 'Programs Page',
    path: '/programs',
    description: 'Ecosystem header banner shown above the 8 Programs / Roadmap / Pathfinder / Catalog views.',
    sections: [
      {
        id: 'hero',
        name: 'Programs Hero Header',
        description: 'Headline and banner photo above the program explorer.',
        defaultData: {
          title: "Our Learning Ecosystem. 8 Specialized Programs. Infinite Potential.",
          subtitle: "Jaystarbliss Studios is more than tutoring — we build tailored learning pathways across technology, music, digital literacy, creative arts, and academic excellence with our proven 5-stage mastery framework.",
          bannerImage: ''
        },
        fields: [
          { key: 'title', label: 'Headline', type: 'text' },
          { key: 'subtitle', label: 'Description', type: 'textarea' },
          { key: 'bannerImage', label: 'Banner Image (Cloudinary)', type: 'image' }
        ]
      }
    ]
  },
  {
    id: 'contact',
    title: 'Contact Page',
    path: '/contact',
    description: 'Contact details, address, support hours, and inquiry info.',
    sections: [
      {
        id: 'details',
        name: 'Contact Information',
        description: 'Direct contact info displayed to visitors.',
        defaultData: {
          title: 'GET IN TOUCH',
          subtitle: 'Have questions about admissions, school partnerships, or digital services? Our team is here to assist.',
          email: 'jaystarblissstudios@gmail.com',
          phone: '+234 913 651 8194',
          secondaryPhone: '+234 913 052 9010',
          address: 'Lagos, Nigeria',
          officeHours: 'Monday - Friday: 9:00 AM - 6:00 PM (WAT)',
          bannerImage: ''
        },
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
          { key: 'email', label: 'Contact Email', type: 'text' },
          { key: 'phone', label: 'Primary Contact Phone', type: 'text' },
          { key: 'secondaryPhone', label: 'Secondary Contact Phone', type: 'text' },
          { key: 'address', label: 'Physical Office Address', type: 'text' },
          { key: 'officeHours', label: 'Office / Support Hours', type: 'text' },
          { key: 'bannerImage', label: 'Banner Image (Cloudinary)', type: 'image' }
        ]
      }
    ]
  }
];

/**
 * Hook to retrieve live section data from Firestore with immediate default fallback
 */
const CMS_CACHE_PREFIX = 'jdi_cms_section_v1_';
const CMS_CACHE_TTL_MS = 15 * 60 * 1000;

export function usePageSection<T extends Record<string, any>>(
  pageId: string,
  sectionId: string,
  defaultData: T
): { data: T; loading: boolean; error: string | null } {
  const [data, setData] = useState<T>(defaultData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const defaultDataRef = useRef(defaultData);

  useEffect(() => {
    defaultDataRef.current = defaultData;
  }, [defaultData]);

  useEffect(() => {
    let isMounted = true;
    const sectionKey = `${pageId}_${sectionId}`;
    const cacheKey = `${CMS_CACHE_PREFIX}${sectionKey}`;

    try {
      const cachedRaw = sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (parsed && typeof parsed.ts === 'number' && Date.now() - parsed.ts < CMS_CACHE_TTL_MS) {
          if (parsed.exists && parsed.data) {
            setData({ ...defaultDataRef.current, ...parsed.data } as T);
          } else {
            setData(defaultDataRef.current);
          }
          setLoading(false);
          return;
        }
      }
    } catch {
      // ignore storage errors
    }

    (async () => {
      try {
        const dbs = getAllClientDatabases();
        let fetchedData: Record<string, any> | null = null;
        for (const clientDb of dbs) {
          try {
            const snap = await getDoc(doc(clientDb, 'page_sections', sectionKey));
            if (snap.exists()) {
              fetchedData = snap.data();
              break;
            }
          } catch {
            // try next database
          }
        }
        if (!isMounted) return;
        if (fetchedData) {
          setData({ ...defaultDataRef.current, ...fetchedData } as T);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), exists: true, data: fetchedData }));
          } catch {
            // ignore storage errors
          }
        } else {
          setData(defaultDataRef.current);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), exists: false, data: null }));
          } catch {
            // ignore storage errors
          }
        }
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.warn(`CMS Section load note for ${sectionKey}:`, err?.message);
        setError(err?.message || 'Error loading section');
        setData(defaultDataRef.current);
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [pageId, sectionId]);

  return { data, loading, error };
}

/**
 * Save a section's updated configuration to Firestore
 */
export async function savePageSection(
  pageId: string,
  sectionId: string,
  data: Record<string, any>
): Promise<void> {
  const sectionKey = `${pageId}_${sectionId}`;
  const dbs = getAllClientDatabases();
  await Promise.all(
    dbs.map((clientDb) =>
      setDoc(
        doc(clientDb, 'page_sections', sectionKey),
        {
          ...data,
          pageId,
          sectionId,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      ).catch(() => null)
    )
  );
  try {
    sessionStorage.removeItem(`${CMS_CACHE_PREFIX}${sectionKey}`);
  } catch {
    // ignore storage errors
  }
}

/**
 * Fetch initial section data once
 */
export async function fetchPageSectionOnce<T extends Record<string, any>>(
  pageId: string,
  sectionId: string,
  defaultData: T
): Promise<T> {
  try {
    const dbs = getAllClientDatabases();
    for (const clientDb of dbs) {
      try {
        const snap = await getDoc(doc(clientDb, 'page_sections', `${pageId}_${sectionId}`));
        if (snap.exists()) {
          return { ...defaultData, ...snap.data() } as T;
        }
      } catch {
        // try next database
      }
    }
  } catch (e) {
    console.warn(`Could not fetch section ${pageId}_${sectionId}`, e);
  }
  return defaultData;
}
