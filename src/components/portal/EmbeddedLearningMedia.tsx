import React from 'react';
import { ExternalLink, PlayCircle, Video, BookOpen, Globe } from 'lucide-react';

export interface ParsedEmbedMedia {
  kind: 'youtube' | 'vimeo' | 'loom' | 'gdrive' | 'video_file' | 'external';
  embedUrl: string | null;
  originalUrl: string;
  providerLabel: string;
}

/**
 * Parses a raw URL and determines whether it can be embedded directly inside the portal
 * (YouTube, Vimeo, Loom, Google Drive preview, or direct MP4/WebM video).
 */
export function parseLearningResourceUrl(rawUrl?: string | null): ParsedEmbedMedia | null {
  const clean = String(rawUrl ?? '').trim();
  if (!clean) return null;

  let normalizedUrl = clean;
  if (!/^https?:\/\//i.test(normalizedUrl) && !normalizedUrl.startsWith('/')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    const u = new URL(normalizedUrl, 'https://portal.jaystarbliss.com');
    const host = u.hostname.toLowerCase().replace(/^www\./, '');

    // 1. YouTube (youtube.com/watch?v=, youtu.be/, youtube.com/embed/, youtube.com/shorts/, youtube.com/live/)
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
      let videoId = '';
      if (host === 'youtu.be') {
        videoId = u.pathname.split('/').filter(Boolean)[0] || '';
      } else if (u.pathname.startsWith('/watch')) {
        videoId = u.searchParams.get('v') || '';
      } else if (
        u.pathname.startsWith('/embed/') ||
        u.pathname.startsWith('/shorts/') ||
        u.pathname.startsWith('/live/')
      ) {
        videoId = u.pathname.split('/').filter(Boolean)[1] || '';
      }
      videoId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
      if (videoId.length >= 6) {
        return {
          kind: 'youtube',
          embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
          originalUrl: normalizedUrl,
          providerLabel: 'YouTube Video Lesson',
        };
      }
    }

    // 2. Vimeo
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const segments = u.pathname.split('/').filter(Boolean);
      const vimeoId = segments.find((s) => /^\d+$/.test(s));
      if (vimeoId) {
        return {
          kind: 'vimeo',
          embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
          originalUrl: normalizedUrl,
          providerLabel: 'Vimeo Video Lesson',
        };
      }
    }

    // 3. Loom
    if (host === 'loom.com' || host.endsWith('.loom.com')) {
      const match = u.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/);
      if (match?.[1]) {
        return {
          kind: 'loom',
          embedUrl: `https://www.loom.com/embed/${match[1]}`,
          originalUrl: normalizedUrl,
          providerLabel: 'Loom Walkthrough',
        };
      }
    }

    // 4. Google Drive file preview
    if (host === 'drive.google.com') {
      const match = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match?.[1]) {
        return {
          kind: 'gdrive',
          embedUrl: `https://drive.google.com/file/d/${match[1]}/preview`,
          originalUrl: normalizedUrl,
          providerLabel: 'Google Drive Resource',
        };
      }
    }

    // 5. Direct video file (.mp4, .webm, .ogg)
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(u.pathname)) {
      return {
        kind: 'video_file',
        embedUrl: normalizedUrl,
        originalUrl: normalizedUrl,
        providerLabel: 'Embedded Video File',
      };
    }

    return {
      kind: 'external',
      embedUrl: null,
      originalUrl: normalizedUrl,
      providerLabel: host || 'External Resource',
    };
  } catch {
    return {
      kind: 'external',
      embedUrl: null,
      originalUrl: normalizedUrl,
      providerLabel: 'Learning Resource',
    };
  }
}

interface EmbeddedLearningMediaProps {
  url?: string | null;
  title?: string;
  description?: string;
  compact?: boolean;
  hideExternalLink?: boolean;
}

export const EmbeddedLearningMedia: React.FC<EmbeddedLearningMediaProps> = ({
  url,
  title,
  description,
  compact = false,
  hideExternalLink = false,
}) => {
  const parsed = parseLearningResourceUrl(url);
  if (!parsed) return null;

  return (
    <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-slate-900/90 overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-blue-100/60 dark:bg-blue-950/50 border-b border-blue-200/70 dark:border-blue-900/60 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {parsed.embedUrl ? (
            <PlayCircle size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
          ) : (
            <BookOpen size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
          )}
          <span className="text-xs font-black uppercase tracking-wider text-blue-950 dark:text-blue-200 truncate">
            {title || parsed.providerLabel}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            {parsed.embedUrl ? 'Watch Inside Portal' : parsed.providerLabel}
          </span>
        </div>

        {!hideExternalLink && (
          <a
            href={parsed.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 hover:underline shrink-0"
          >
            Open Original Link <ExternalLink size={12} />
          </a>
        )}
      </div>

      {description && (
        <div className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 border-b border-blue-100 dark:border-slate-800 leading-relaxed whitespace-pre-wrap">
          {description}
        </div>
      )}

      {parsed.kind === 'video_file' && parsed.embedUrl ? (
        <div className="bg-slate-950 w-full">
          <video
            src={parsed.embedUrl}
            controls
            preload="metadata"
            className={`w-full ${compact ? 'max-h-64' : 'max-h-[440px]'} mx-auto`}
          >
            Your browser does not support embedded video playback.
          </video>
        </div>
      ) : parsed.embedUrl ? (
        <div className={`relative w-full bg-slate-950 ${compact ? 'aspect-video max-h-72' : 'aspect-video'}`}>
          <iframe
            src={parsed.embedUrl}
            title={title || parsed.providerLabel}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Globe size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {title || 'Attached Reference & Learning Material'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {parsed.originalUrl}
              </p>
            </div>
          </div>

          {!hideExternalLink && (
            <a
              href={parsed.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors shrink-0"
            >
              Open Resource <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default EmbeddedLearningMedia;

