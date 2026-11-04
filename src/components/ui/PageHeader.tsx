import React from 'react';
import { Reveal } from './Reveal';

interface PageHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** CMS-supplied override (e.g. heroData.bannerImage) — falls back to `fallbackImage` when empty. */
  image?: string;
  fallbackImage: string;
  /** Extra content rendered below the description (buttons, tab switchers, etc). */
  children?: React.ReactNode;
  size?: 'md' | 'lg';
}

/**
 * Shared photo + gradient page banner used across About / Services / Contact /
 * Programs / Portfolio, replacing the old flat brand-slate header block.
 * If a CMS `image` prop is supplied (via usePageSection's bannerImage/heroImage
 * field) it takes priority; otherwise a curated fallback photo is used so the
 * page never looks bare before an admin uploads their own photo.
 */
const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  image,
  fallbackImage,
  children,
  size = 'md',
}) => {
  return (
    <div className={`jb-page-header relative overflow-hidden text-white ${size === 'lg' ? 'py-24 lg:py-36' : 'py-20 lg:py-28'}`}>
      <img
        src={image || fallbackImage}
        alt=""
        loading="eager"
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Gradient scrim: keeps text readable over any photo, angled for a less flat look */}
      <div className="absolute inset-0 bg-gradient-to-r from-brand-slate via-brand-slate/85 to-brand-slate/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-brand-slate via-transparent to-brand-slate/30" />
      <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        <Reveal className="max-w-3xl">
          {eyebrow && (
            <span className="inline-block text-xs font-black uppercase tracking-widest text-brand-red mb-3">
              {eyebrow}
            </span>
          )}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tight leading-[1.08]">
            {title}
          </h1>
          {description && (
            <p className="text-base sm:text-lg text-white/85 leading-relaxed font-normal max-w-2xl">
              {description}
            </p>
          )}
        </Reveal>
        {children && <div className="relative z-10 mt-8">{children}</div>}
      </div>
    </div>
  );
};

export default PageHeader;
