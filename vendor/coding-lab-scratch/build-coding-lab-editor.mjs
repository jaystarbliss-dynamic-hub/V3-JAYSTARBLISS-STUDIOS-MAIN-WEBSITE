#!/usr/bin/env node
/**
 * Reproducible build & patch pipeline for the Jaystarbliss Dynamic Institute Coding Lab
 * self-hosted Scratch 3 editor bundle.
 *
 * Upstream repository: https://github.com/scratchfoundation/scratch-editor
 * Pinned commit:       89181a7a224793a05bf9d55e2aecc68417534076 (v15.3.0, AGPL-3.0-only)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SCRATCH_REPO = process.env.SCRATCH_REPO_DIR || '/tmp/scratch-audit/scratch-editor';
const GUI_DIR = path.join(SCRATCH_REPO, 'packages/scratch-gui');
const WORKSPACE_ROOT = process.cwd();
const VENDOR_DIR = path.join(WORKSPACE_ROOT, 'vendor/coding-lab-scratch');
const MODIFIED_ARCHIVE_DIR = path.join(VENDOR_DIR, 'modified-files');
const PUBLIC_OUT_DIR = path.join(WORKSPACE_ROOT, 'public/coding-lab-editor');

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeAndArchive(relPathInGui, content) {
  const target = path.join(GUI_DIR, relPathInGui);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content);

  const archived = path.join(MODIFIED_ARCHIVE_DIR, relPathInGui);
  ensureDir(path.dirname(archived));
  fs.writeFileSync(archived, content);
}

/**
 * Generates a valid 16-bit mono PCM WAV buffer from a sample synthesis function.
 * 100% original synthesized audio (CC0 / Public Domain) — zero third-party copyright risk.
 */
function synthesizeWav(durationSec, sampleRate, sampleFn) {
  const numSamples = Math.max(1, Math.floor(durationSec * sampleRate));
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20);  // PCM format
  buf.writeUInt16LE(1, 22);  // Mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  buf.writeUInt16LE(2, 32);  // Block align
  buf.writeUInt16LE(16, 34); // Bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const raw = sampleFn(t, i, numSamples);
    const clamped = Math.max(-1, Math.min(1, raw));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return { buffer: buf, sampleRate, sampleCount: numSamples };
}

// ============================================================================
// 1. GENERATE SELF-HOSTED ORIGINAL MEDIA LIBRARY (SPRITES, BACKDROPS, SOUNDS)
// ============================================================================

const SPRITE_SPECS = [
  {
    name: 'Robo',
    tags: ['technology', 'people', 'fantasy'],
    costumes: [
      {
        name: 'robo-idle',
        rx: 48,
        ry: 56,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="112" viewBox="0 0 96 112">
          <line x1="48" y1="6" x2="48" y2="20" stroke="#1E293B" stroke-width="4" stroke-linecap="round"/>
          <circle cx="48" cy="6" r="5" fill="#F59E0B" stroke="#1E293B" stroke-width="2.5"/>
          <rect x="20" y="18" width="56" height="40" rx="12" fill="#2563EB" stroke="#1E293B" stroke-width="3"/>
          <rect x="28" y="26" width="40" height="22" rx="7" fill="#0F172A"/>
          <circle cx="40" cy="37" r="4.5" fill="#38BDF8"/>
          <circle cx="56" cy="37" r="4.5" fill="#38BDF8"/>
          <path d="M40 44 Q48 49 56 44" fill="none" stroke="#38BDF8" stroke-width="2.2" stroke-linecap="round"/>
          <rect x="24" y="61" width="48" height="32" rx="10" fill="#1D4ED8" stroke="#1E293B" stroke-width="3"/>
          <rect x="35" y="69" width="26" height="14" rx="4" fill="#EFF6FF"/>
          <circle cx="43" cy="76" r="3" fill="#22C55E"/>
          <circle cx="53" cy="76" r="3" fill="#F59E0B"/>
          <rect x="10" y="64" width="12" height="24" rx="6" fill="#3B82F6" stroke="#1E293B" stroke-width="3"/>
          <rect x="74" y="64" width="12" height="24" rx="6" fill="#3B82F6" stroke="#1E293B" stroke-width="3"/>
          <rect x="30" y="93" width="12" height="14" rx="5" fill="#334155" stroke="#1E293B" stroke-width="2.5"/>
          <rect x="54" y="93" width="12" height="14" rx="5" fill="#334155" stroke="#1E293B" stroke-width="2.5"/>
        </svg>`,
      },
      {
        name: 'robo-wave',
        rx: 48,
        ry: 56,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="112" viewBox="0 0 96 112">
          <line x1="48" y1="6" x2="48" y2="20" stroke="#1E293B" stroke-width="4" stroke-linecap="round"/>
          <circle cx="48" cy="6" r="5" fill="#22C55E" stroke="#1E293B" stroke-width="2.5"/>
          <rect x="20" y="18" width="56" height="40" rx="12" fill="#2563EB" stroke="#1E293B" stroke-width="3"/>
          <rect x="28" y="26" width="40" height="22" rx="7" fill="#0F172A"/>
          <path d="M36 37 Q40 32 44 37" fill="none" stroke="#38BDF8" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M52 37 Q56 32 60 37" fill="none" stroke="#38BDF8" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M38 43 Q48 51 58 43" fill="none" stroke="#38BDF8" stroke-width="2.4" stroke-linecap="round"/>
          <rect x="24" y="61" width="48" height="32" rx="10" fill="#1D4ED8" stroke="#1E293B" stroke-width="3"/>
          <rect x="35" y="69" width="26" height="14" rx="4" fill="#EFF6FF"/>
          <circle cx="43" cy="76" r="3" fill="#22C55E"/>
          <circle cx="53" cy="76" r="3" fill="#EF4444"/>
          <rect x="10" y="64" width="12" height="24" rx="6" fill="#3B82F6" stroke="#1E293B" stroke-width="3"/>
          <rect x="74" y="42" width="12" height="28" rx="6" transform="rotate(24 80 56)" fill="#3B82F6" stroke="#1E293B" stroke-width="3"/>
          <rect x="28" y="93" width="12" height="14" rx="5" fill="#334155" stroke="#1E293B" stroke-width="2.5"/>
          <rect x="56" y="91" width="12" height="14" rx="5" fill="#334155" stroke="#1E293B" stroke-width="2.5"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Rocket',
    tags: ['space', 'vehicles'],
    costumes: [
      {
        name: 'rocket-idle',
        rx: 44,
        ry: 54,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="108" viewBox="0 0 88 108">
          <path d="M44 6 C60 22 66 48 64 78 L24 78 C22 48 28 22 44 6 Z" fill="#F8FAFC" stroke="#1E293B" stroke-width="3"/>
          <path d="M44 6 C52 14 57 24 60 34 L28 34 C31 24 36 14 44 6 Z" fill="#DC2626" stroke="#1E293B" stroke-width="2.5"/>
          <circle cx="44" cy="52" r="11" fill="#38BDF8" stroke="#1E293B" stroke-width="3"/>
          <path d="M24 62 L8 84 L24 78 Z" fill="#DC2626" stroke="#1E293B" stroke-width="2.5"/>
          <path d="M64 62 L80 84 L64 78 Z" fill="#DC2626" stroke="#1E293B" stroke-width="2.5"/>
          <rect x="33" y="78" width="22" height="8" rx="3" fill="#475569" stroke="#1E293B" stroke-width="2.5"/>
        </svg>`,
      },
      {
        name: 'rocket-boost',
        rx: 44,
        ry: 54,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="108" viewBox="0 0 88 108">
          <path d="M34 84 L44 106 L54 84 Z" fill="#F97316"/>
          <path d="M38 84 L44 98 L50 84 Z" fill="#FDE047"/>
          <path d="M44 6 C60 22 66 48 64 78 L24 78 C22 48 28 22 44 6 Z" fill="#F8FAFC" stroke="#1E293B" stroke-width="3"/>
          <path d="M44 6 C52 14 57 24 60 34 L28 34 C31 24 36 14 44 6 Z" fill="#DC2626" stroke="#1E293B" stroke-width="2.5"/>
          <circle cx="44" cy="52" r="11" fill="#38BDF8" stroke="#1E293B" stroke-width="3"/>
          <path d="M24 62 L8 84 L24 78 Z" fill="#DC2626" stroke="#1E293B" stroke-width="2.5"/>
          <path d="M64 62 L80 84 L64 78 Z" fill="#DC2626" stroke="#1E293B" stroke-width="2.5"/>
          <rect x="33" y="78" width="22" height="8" rx="3" fill="#475569" stroke="#1E293B" stroke-width="2.5"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Star Gem',
    tags: ['fantasy', 'things'],
    costumes: [
      {
        name: 'star-gold',
        rx: 40,
        ry: 40,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
          <polygon points="40,6 50,28 74,30 56,46 61,70 40,58 19,70 24,46 6,30 30,28" fill="#FACC15" stroke="#B45309" stroke-width="3.5" stroke-linejoin="round"/>
          <polygon points="40,18 46,32 60,34 49,44 52,58 40,50 28,58 31,44 20,34 34,32" fill="#FEF08A"/>
        </svg>`,
      },
      {
        name: 'star-cyan',
        rx: 40,
        ry: 40,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
          <polygon points="40,6 50,28 74,30 56,46 61,70 40,58 19,70 24,46 6,30 30,28" fill="#22D3EE" stroke="#0E7490" stroke-width="3.5" stroke-linejoin="round"/>
          <polygon points="40,18 46,32 60,34 49,44 52,58 40,50 28,58 31,44 20,34 34,32" fill="#CFFAFE"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Soccer Ball',
    tags: ['sports', 'things'],
    costumes: [
      {
        name: 'soccer-ball',
        rx: 36,
        ry: 36,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="32" fill="#FFFFFF" stroke="#0F172A" stroke-width="3.5"/>
          <polygon points="36,22 48,30 44,44 28,44 24,30" fill="#0F172A"/>
          <line x1="36" y1="22" x2="36" y2="5" stroke="#0F172A" stroke-width="2.5"/>
          <line x1="48" y1="30" x2="64" y2="23" stroke="#0F172A" stroke-width="2.5"/>
          <line x1="24" y1="30" x2="8" y2="23" stroke="#0F172A" stroke-width="2.5"/>
          <line x1="44" y1="44" x2="55" y2="60" stroke="#0F172A" stroke-width="2.5"/>
          <line x1="28" y1="44" x2="17" y2="60" stroke="#0F172A" stroke-width="2.5"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Basketball',
    tags: ['sports', 'things'],
    costumes: [
      {
        name: 'basketball',
        rx: 36,
        ry: 36,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="32" fill="#EA580C" stroke="#1E293B" stroke-width="3.5"/>
          <line x1="4" y1="36" x2="68" y2="36" stroke="#1E293B" stroke-width="2.5"/>
          <line x1="36" y1="4" x2="36" y2="68" stroke="#1E293B" stroke-width="2.5"/>
          <path d="M14 14 Q30 36 14 58" fill="none" stroke="#1E293B" stroke-width="2.5"/>
          <path d="M58 14 Q42 36 58 58" fill="none" stroke="#1E293B" stroke-width="2.5"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Owl',
    tags: ['animals'],
    costumes: [
      {
        name: 'owl-perch',
        rx: 46,
        ry: 48,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="92" height="96" viewBox="0 0 92 96">
          <ellipse cx="46" cy="54" rx="30" ry="34" fill="#92400E" stroke="#1E293B" stroke-width="3"/>
          <ellipse cx="46" cy="64" rx="18" ry="20" fill="#FEF3C7"/>
          <circle cx="34" cy="40" r="11" fill="#FFFFFF" stroke="#1E293B" stroke-width="2.5"/>
          <circle cx="58" cy="40" r="11" fill="#FFFFFF" stroke="#1E293B" stroke-width="2.5"/>
          <circle cx="35" cy="40" r="5" fill="#0F172A"/>
          <circle cx="57" cy="40" r="5" fill="#0F172A"/>
          <polygon points="46,46 41,54 51,54" fill="#F59E0B" stroke="#1E293B" stroke-width="2"/>
          <path d="M18 48 Q8 60 18 72" fill="#78350F" stroke="#1E293B" stroke-width="2.5"/>
          <path d="M74 48 Q84 60 74 72" fill="#78350F" stroke="#1E293B" stroke-width="2.5"/>
        </svg>`,
      },
      {
        name: 'owl-fly',
        rx: 46,
        ry: 48,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="92" height="96" viewBox="0 0 92 96">
          <path d="M22 48 Q2 24 14 66 Z" fill="#78350F" stroke="#1E293B" stroke-width="2.5"/>
          <path d="M70 48 Q90 24 78 66 Z" fill="#78350F" stroke="#1E293B" stroke-width="2.5"/>
          <ellipse cx="46" cy="54" rx="28" ry="32" fill="#92400E" stroke="#1E293B" stroke-width="3"/>
          <ellipse cx="46" cy="64" rx="17" ry="18" fill="#FEF3C7"/>
          <circle cx="34" cy="40" r="11" fill="#FFFFFF" stroke="#1E293B" stroke-width="2.5"/>
          <circle cx="58" cy="40" r="11" fill="#FFFFFF" stroke="#1E293B" stroke-width="2.5"/>
          <circle cx="35" cy="40" r="5" fill="#0F172A"/>
          <circle cx="57" cy="40" r="5" fill="#0F172A"/>
          <polygon points="46,46 41,54 51,54" fill="#F59E0B" stroke="#1E293B" stroke-width="2"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Sea Turtle',
    tags: ['animals'],
    costumes: [
      {
        name: 'turtle-swim',
        rx: 50,
        ry: 36,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="72" viewBox="0 0 100 72">
          <ellipse cx="46" cy="38" rx="28" ry="20" fill="#15803D" stroke="#052E16" stroke-width="3"/>
          <polygon points="46,24 58,31 54,45 38,45 34,31" fill="#22C55E" stroke="#052E16" stroke-width="2"/>
          <circle cx="82" cy="34" r="11" fill="#4ADE80" stroke="#052E16" stroke-width="2.5"/>
          <circle cx="86" cy="31" r="2.5" fill="#052E16"/>
          <ellipse cx="60" cy="18" rx="12" ry="6" transform="rotate(-25 60 18)" fill="#4ADE80" stroke="#052E16" stroke-width="2.5"/>
          <ellipse cx="60" cy="56" rx="12" ry="6" transform="rotate(25 60 56)" fill="#4ADE80" stroke="#052E16" stroke-width="2.5"/>
          <ellipse cx="24" cy="24" rx="9" ry="5" transform="rotate(20 24 24)" fill="#4ADE80" stroke="#052E16" stroke-width="2.5"/>
          <ellipse cx="24" cy="52" rx="9" ry="5" transform="rotate(-20 24 52)" fill="#4ADE80" stroke="#052E16" stroke-width="2.5"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Butterfly',
    tags: ['animals'],
    costumes: [
      {
        name: 'butterfly-open',
        rx: 46,
        ry: 38,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="92" height="76" viewBox="0 0 92 76">
          <ellipse cx="26" cy="28" rx="20" ry="18" fill="#A855F7" stroke="#3B0764" stroke-width="2.5"/>
          <ellipse cx="66" cy="28" rx="20" ry="18" fill="#A855F7" stroke="#3B0764" stroke-width="2.5"/>
          <ellipse cx="28" cy="50" rx="14" ry="13" fill="#EC4899" stroke="#3B0764" stroke-width="2.5"/>
          <ellipse cx="64" cy="50" rx="14" ry="13" fill="#EC4899" stroke="#3B0764" stroke-width="2.5"/>
          <circle cx="25" cy="26" r="6" fill="#FDE047"/>
          <circle cx="67" cy="26" r="6" fill="#FDE047"/>
          <rect x="42" y="18" width="8" height="42" rx="4" fill="#1E293B"/>
          <path d="M44 18 Q36 6 30 10" fill="none" stroke="#1E293B" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M48 18 Q56 6 62 10" fill="none" stroke="#1E293B" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`,
      },
      {
        name: 'butterfly-flap',
        rx: 46,
        ry: 38,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="92" height="76" viewBox="0 0 92 76">
          <ellipse cx="32" cy="30" rx="12" ry="18" fill="#A855F7" stroke="#3B0764" stroke-width="2.5"/>
          <ellipse cx="60" cy="30" rx="12" ry="18" fill="#A855F7" stroke="#3B0764" stroke-width="2.5"/>
          <ellipse cx="34" cy="50" rx="9" ry="12" fill="#EC4899" stroke="#3B0764" stroke-width="2.5"/>
          <ellipse cx="58" cy="50" rx="9" ry="12" fill="#EC4899" stroke="#3B0764" stroke-width="2.5"/>
          <rect x="42" y="18" width="8" height="42" rx="4" fill="#1E293B"/>
          <path d="M44 18 Q36 6 30 10" fill="none" stroke="#1E293B" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M48 18 Q56 6 62 10" fill="none" stroke="#1E293B" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Race Car',
    tags: ['vehicles', 'sports'],
    costumes: [
      {
        name: 'race-car',
        rx: 56,
        ry: 28,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="56" viewBox="0 0 112 56">
          <path d="M12 36 L22 20 L48 14 L76 20 L98 28 L104 38 L10 38 Z" fill="#EF4444" stroke="#1E293B" stroke-width="3" stroke-linejoin="round"/>
          <polygon points="34,22 50,18 68,23 68,30 30,30" fill="#BAE6FD" stroke="#1E293B" stroke-width="2"/>
          <circle cx="30" cy="40" r="11" fill="#1E293B"/>
          <circle cx="30" cy="40" r="5" fill="#CBD5E1"/>
          <circle cx="82" cy="40" r="11" fill="#1E293B"/>
          <circle cx="82" cy="40" r="5" fill="#CBD5E1"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Airplane',
    tags: ['vehicles'],
    costumes: [
      {
        name: 'airplane',
        rx: 56,
        ry: 32,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="64" viewBox="0 0 112 64">
          <path d="M14 34 L34 28 L88 26 C100 26 106 32 106 36 C106 40 98 44 86 44 L24 42 L8 22 L20 22 L30 30" fill="#0EA5E9" stroke="#0F172A" stroke-width="3" stroke-linejoin="round"/>
          <polygon points="48,30 64,10 74,10 66,30" fill="#E0F2FE" stroke="#0F172A" stroke-width="2.5"/>
          <polygon points="46,42 62,56 72,56 64,42" fill="#E0F2FE" stroke="#0F172A" stroke-width="2.5"/>
          <circle cx="82" cy="34" r="3.5" fill="#FFFFFF"/>
          <circle cx="70" cy="34" r="3.5" fill="#FFFFFF"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Treasure Chest',
    tags: ['fantasy', 'things'],
    costumes: [
      {
        name: 'chest-closed',
        rx: 44,
        ry: 36,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="72" viewBox="0 0 88 72">
          <rect x="10" y="28" width="68" height="36" rx="6" fill="#92400E" stroke="#1E293B" stroke-width="3"/>
          <path d="M10 30 C10 14 78 14 78 30 Z" fill="#B45309" stroke="#1E293B" stroke-width="3"/>
          <rect x="10" y="28" width="68" height="7" fill="#F59E0B" stroke="#1E293B" stroke-width="2"/>
          <rect x="38" y="26" width="12" height="16" rx="3" fill="#FACC15" stroke="#1E293B" stroke-width="2.5"/>
        </svg>`,
      },
      {
        name: 'chest-open',
        rx: 44,
        ry: 36,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="72" viewBox="0 0 88 72">
          <path d="M12 28 C12 8 76 8 76 28 Z" fill="#78350F" stroke="#1E293B" stroke-width="3"/>
          <circle cx="32" cy="28" r="8" fill="#FACC15" stroke="#B45309" stroke-width="2"/>
          <circle cx="46" cy="24" r="9" fill="#FDE047" stroke="#B45309" stroke-width="2"/>
          <circle cx="58" cy="29" r="8" fill="#FACC15" stroke="#B45309" stroke-width="2"/>
          <rect x="10" y="30" width="68" height="34" rx="6" fill="#92400E" stroke="#1E293B" stroke-width="3"/>
          <rect x="38" y="34" width="12" height="14" rx="3" fill="#FACC15" stroke="#1E293B" stroke-width="2.5"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Red Button',
    tags: ['things'],
    costumes: [
      {
        name: 'button-up',
        rx: 40,
        ry: 30,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60" viewBox="0 0 80 60">
          <ellipse cx="40" cy="40" rx="34" ry="14" fill="#475569" stroke="#0F172A" stroke-width="3"/>
          <ellipse cx="40" cy="30" rx="28" ry="14" fill="#DC2626" stroke="#7F1D1D" stroke-width="3"/>
          <ellipse cx="40" cy="26" rx="22" ry="9" fill="#EF4444"/>
        </svg>`,
      },
      {
        name: 'button-pressed',
        rx: 40,
        ry: 30,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60" viewBox="0 0 80 60">
          <ellipse cx="40" cy="40" rx="34" ry="14" fill="#475569" stroke="#0F172A" stroke-width="3"/>
          <ellipse cx="40" cy="36" rx="28" ry="11" fill="#16A34A" stroke="#14532D" stroke-width="3"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Apple',
    tags: ['food'],
    costumes: [
      {
        name: 'apple',
        rx: 34,
        ry: 38,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="68" height="76" viewBox="0 0 68 76">
          <path d="M34 20 C20 12 8 24 10 42 C12 60 24 68 34 64 C44 68 56 60 58 42 C60 24 48 12 34 20 Z" fill="#DC2626" stroke="#7F1D1D" stroke-width="3"/>
          <path d="M34 20 Q36 8 42 6" fill="none" stroke="#78350F" stroke-width="3.5" stroke-linecap="round"/>
          <ellipse cx="45" cy="14" rx="9" ry="5" transform="rotate(-20 45 14)" fill="#22C55E" stroke="#14532D" stroke-width="2"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Music Note',
    tags: ['music', 'things'],
    costumes: [
      {
        name: 'music-note',
        rx: 34,
        ry: 40,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="68" height="80" viewBox="0 0 68 80">
          <path d="M26 56 L26 16 L58 10 L58 48" fill="none" stroke="#4F46E5" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
          <ellipse cx="18" cy="58" rx="11" ry="8" transform="rotate(-15 18 58)" fill="#6366F1" stroke="#312E81" stroke-width="2.5"/>
          <ellipse cx="50" cy="50" rx="11" ry="8" transform="rotate(-15 50 50)" fill="#6366F1" stroke="#312E81" stroke-width="2.5"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Arrow',
    tags: ['things'],
    costumes: [
      {
        name: 'arrow-right',
        rx: 40,
        ry: 28,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="56" viewBox="0 0 80 56">
          <polygon points="8,18 46,18 46,6 74,28 46,50 46,38 8,38" fill="#10B981" stroke="#064E3B" stroke-width="3" stroke-linejoin="round"/>
        </svg>`,
      },
    ],
  },
  {
    name: 'Wizard Hat',
    tags: ['fantasy'],
    costumes: [
      {
        name: 'wizard-hat',
        rx: 44,
        ry: 44,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88">
          <ellipse cx="44" cy="70" rx="38" ry="11" fill="#4338CA" stroke="#1E1B4B" stroke-width="3"/>
          <polygon points="44,8 20,68 68,68" fill="#4F46E5" stroke="#1E1B4B" stroke-width="3" stroke-linejoin="round"/>
          <path d="M24 58 Q44 64 64 58" fill="none" stroke="#FACC15" stroke-width="6"/>
          <polygon points="44,28 47,36 55,36 49,41 51,49 44,44 37,49 39,41 33,36 41,36" fill="#FDE047"/>
        </svg>`,
      },
    ],
  },
];

const BACKDROP_SPECS = [
  {
    name: 'Blank Canvas',
    tags: ['patterns'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="#FFFFFF"/></svg>`,
  },
  {
    name: 'XY Coordinate Grid',
    tags: ['patterns', 'indoors'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="360" fill="#F8FAFC"/>
      <g stroke="#CBD5E1" stroke-width="1">
        ${Array.from({ length: 15 }, (_, i) => `<line x1="${(i + 1) * 30}" y1="0" x2="${(i + 1) * 30}" y2="360"/>`).join('')}
        ${Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${(i + 1) * 30}" x2="480" y2="${(i + 1) * 30}"/>`).join('')}
      </g>
      <line x1="240" y1="0" x2="240" y2="360" stroke="#2563EB" stroke-width="2.5"/>
      <line x1="0" y1="180" x2="480" y2="180" stroke="#DC2626" stroke-width="2.5"/>
      <circle cx="240" cy="180" r="4" fill="#0F172A"/>
      <text x="246" y="18" font-family="sans-serif" font-size="12" fill="#2563EB" font-weight="bold">y: 180</text>
      <text x="246" y="352" font-family="sans-serif" font-size="12" fill="#2563EB" font-weight="bold">y: -180</text>
      <text x="424" y="174" font-family="sans-serif" font-size="12" fill="#DC2626" font-weight="bold">x: 240</text>
      <text x="6" y="174" font-family="sans-serif" font-size="12" fill="#DC2626" font-weight="bold">x: -240</text>
    </svg>`,
  },
  {
    name: 'Sunny Meadow',
    tags: ['outdoors'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="240" fill="#7DD3FC"/>
      <circle cx="400" cy="64" r="34" fill="#FDE047"/>
      <ellipse cx="110" cy="70" rx="46" ry="20" fill="#FFFFFF" opacity="0.9"/>
      <ellipse cx="145" cy="78" rx="36" ry="18" fill="#FFFFFF" opacity="0.9"/>
      <ellipse cx="280" cy="94" rx="40" ry="16" fill="#FFFFFF" opacity="0.85"/>
      <path d="M0 235 Q120 190 250 230 T480 220 L480 360 L0 360 Z" fill="#4ADE80"/>
      <path d="M0 265 Q160 235 320 270 T480 260 L480 360 L0 360 Z" fill="#22C55E"/>
    </svg>`,
  },
  {
    name: 'Outer Space',
    tags: ['space'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="360" fill="#0B1120"/>
      <circle cx="70" cy="60" r="2.2" fill="#FFFFFF"/><circle cx="150" cy="40" r="1.8" fill="#E2E8F0"/>
      <circle cx="240" cy="80" r="2.5" fill="#FDE047"/><circle cx="330" cy="50" r="2" fill="#FFFFFF"/>
      <circle cx="420" cy="110" r="2.5" fill="#38BDF8"/><circle cx="95" cy="210" r="2" fill="#FFFFFF"/>
      <circle cx="210" cy="260" r="1.8" fill="#FFFFFF"/><circle cx="380" cy="290" r="2.2" fill="#FDE047"/>
      <circle cx="370" cy="95" r="38" fill="#7C3AED"/>
      <ellipse cx="370" cy="95" rx="64" ry="14" transform="rotate(-18 370 95)" fill="none" stroke="#C4B5FD" stroke-width="5"/>
      <circle cx="110" cy="290" r="46" fill="#2563EB"/>
      <path d="M84 275 Q115 268 130 290 Q112 312 90 302 Z" fill="#22C55E"/>
    </svg>`,
  },
  {
    name: 'Underwater Ocean',
    tags: ['underwater', 'outdoors'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="360" fill="#0369A1"/>
      <rect width="480" height="120" fill="#0EA5E9" opacity="0.45"/>
      <path d="M0 305 Q120 285 240 305 T480 295 L480 360 L0 360 Z" fill="#FDE68A"/>
      <circle cx="80" cy="180" r="8" fill="#BAE6FD" opacity="0.6"/>
      <circle cx="94" cy="150" r="5" fill="#BAE6FD" opacity="0.6"/>
      <circle cx="360" cy="140" r="9" fill="#BAE6FD" opacity="0.5"/>
      <path d="M40 315 Q32 270 46 235" fill="none" stroke="#15803D" stroke-width="8" stroke-linecap="round"/>
      <path d="M430 310 Q442 260 426 225" fill="none" stroke="#15803D" stroke-width="8" stroke-linecap="round"/>
    </svg>`,
  },
  {
    name: 'City Skyline',
    tags: ['outdoors'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="280" fill="#1E293B"/>
      <circle cx="410" cy="60" r="24" fill="#FEF08A"/>
      <rect x="20" y="120" width="76" height="165" fill="#334155"/>
      <rect x="110" y="80" width="84" height="205" fill="#475569"/>
      <rect x="210" y="140" width="72" height="145" fill="#334155"/>
      <rect x="296" y="95" width="90" height="190" fill="#475569"/>
      <rect x="400" y="135" width="66" height="150" fill="#334155"/>
      <rect x="0" y="280" width="480" height="80" fill="#0F172A"/>
      <line x1="0" y1="320" x2="480" y2="320" stroke="#FACC15" stroke-width="4" stroke-dasharray="24 18"/>
    </svg>`,
  },
  {
    name: 'Classroom Board',
    tags: ['indoors'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="360" fill="#FEF3C7"/>
      <rect x="28" y="28" width="424" height="230" rx="8" fill="#14532D" stroke="#92400E" stroke-width="12"/>
      <rect x="0" y="290" width="480" height="70" fill="#D97706"/>
    </svg>`,
  },
  {
    name: 'Basketball Court',
    tags: ['sports', 'indoors'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="360" fill="#D97706"/>
      <rect x="24" y="24" width="432" height="312" fill="none" stroke="#FFFFFF" stroke-width="4"/>
      <line x1="240" y1="24" x2="240" y2="336" stroke="#FFFFFF" stroke-width="4"/>
      <circle cx="240" cy="180" r="48" fill="none" stroke="#FFFFFF" stroke-width="4"/>
      <rect x="24" y="116" width="84" height="128" fill="#B45309" stroke="#FFFFFF" stroke-width="3"/>
      <rect x="372" y="116" width="84" height="128" fill="#B45309" stroke="#FFFFFF" stroke-width="3"/>
    </svg>`,
  },
  {
    name: 'Sunset Desert',
    tags: ['outdoors'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="220" fill="#FB923C"/>
      <circle cx="240" cy="180" r="56" fill="#FDE047"/>
      <path d="M0 230 Q140 185 280 235 T480 215 L480 360 L0 360 Z" fill="#F59E0B"/>
      <path d="M0 275 Q180 245 340 285 T480 270 L480 360 L0 360 Z" fill="#D97706"/>
    </svg>`,
  },
  {
    name: 'Neon Maze Grid',
    tags: ['patterns', 'space'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="360" fill="#090D16"/>
      <g stroke="#22D3EE" stroke-width="6" stroke-linecap="round">
        <rect x="20" y="20" width="440" height="320" fill="none"/>
        <line x1="120" y1="20" x2="120" y2="220"/>
        <line x1="240" y1="140" x2="240" y2="340"/>
        <line x1="360" y1="20" x2="360" y2="230"/>
        <line x1="120" y1="120" x2="290" y2="120"/>
        <line x1="240" y1="240" x2="410" y2="240"/>
      </g>
    </svg>`,
  },
];

const SOUND_SPECS = [
  {
    name: 'Pop',
    tags: ['effects'],
    gen: () =>
      synthesizeWav(0.09, 22050, (t) => {
        const env = Math.exp(-t * 48);
        const freq = 520 * Math.exp(-t * 14) + 180;
        return Math.sin(2 * Math.PI * freq * t) * env * 0.7;
      }),
  },
  {
    name: 'Beep',
    tags: ['effects', 'notes'],
    gen: () =>
      synthesizeWav(0.18, 22050, (t) => {
        const env = Math.min(1, t * 60) * Math.exp(-t * 10);
        return Math.sin(2 * Math.PI * 660 * t) * env * 0.55;
      }),
  },
  {
    name: 'Laser Zap',
    tags: ['effects', 'space'],
    gen: () =>
      synthesizeWav(0.26, 22050, (t) => {
        const env = Math.exp(-t * 9);
        const freq = 1400 * Math.exp(-t * 10) + 160;
        return (Math.sin(2 * Math.PI * freq * t) * 0.6 + Math.sin(4 * Math.PI * freq * t) * 0.25) * env * 0.65;
      }),
  },
  {
    name: 'Coin Collect',
    tags: ['effects', 'notes'],
    gen: () =>
      synthesizeWav(0.32, 22050, (t) => {
        const freq = t < 0.08 ? 988 : 1319;
        const env = Math.exp(-t * 8);
        return Math.sin(2 * Math.PI * freq * t) * env * 0.6;
      }),
  },
  {
    name: 'Jump Up',
    tags: ['effects', 'sports'],
    gen: () =>
      synthesizeWav(0.24, 22050, (t) => {
        const freq = 240 + t * 1800;
        const env = Math.exp(-t * 6);
        return Math.sin(2 * Math.PI * freq * t) * env * 0.6;
      }),
  },
  {
    name: 'Boing Bounce',
    tags: ['effects', 'wacky'],
    gen: () =>
      synthesizeWav(0.38, 22050, (t) => {
        const freq = 260 + 110 * Math.sin(2 * Math.PI * 14 * t);
        const env = Math.exp(-t * 5.5);
        return Math.sin(2 * Math.PI * freq * t) * env * 0.6;
      }),
  },
  {
    name: 'Victory Fanfare',
    tags: ['notes', 'effects'],
    gen: () =>
      synthesizeWav(0.55, 22050, (t) => {
        const freq = t < 0.12 ? 523.25 : t < 0.24 ? 659.25 : t < 0.36 ? 783.99 : 1046.5;
        const env = Math.exp(-((t % 0.12) * 5)) * (1 - t / 0.62);
        return Math.sin(2 * Math.PI * freq * t) * env * 0.55;
      }),
  },
  {
    name: 'Bell Chime',
    tags: ['notes', 'percussion'],
    gen: () =>
      synthesizeWav(0.55, 22050, (t) => {
        const env = Math.exp(-t * 5.5);
        return (Math.sin(2 * Math.PI * 880 * t) * 0.6 + Math.sin(2 * Math.PI * 1760 * t) * 0.3) * env * 0.6;
      }),
  },
  {
    name: 'Click Tick',
    tags: ['effects', 'percussion'],
    gen: () =>
      synthesizeWav(0.05, 22050, (t) => {
        const env = Math.exp(-t * 95);
        return Math.sin(2 * Math.PI * 1200 * t) * env * 0.65;
      }),
  },
  {
    name: 'Power Up',
    tags: ['effects', 'space'],
    gen: () =>
      synthesizeWav(0.42, 22050, (t) => {
        const step = Math.floor(t * 14);
        const freq = 330 * Math.pow(1.12, step);
        const env = Math.exp(-t * 4);
        return Math.sin(2 * Math.PI * freq * t) * env * 0.55;
      }),
  },
  {
    name: 'Drum Kick',
    tags: ['percussion'],
    gen: () =>
      synthesizeWav(0.22, 22050, (t) => {
        const freq = 150 * Math.exp(-t * 22) + 42;
        const env = Math.exp(-t * 16);
        return Math.sin(2 * Math.PI * freq * t) * env * 0.85;
      }),
  },
  {
    name: 'Snare Hit',
    tags: ['percussion'],
    gen: () =>
      synthesizeWav(0.18, 22050, (t, i) => {
        const env = Math.exp(-t * 24);
        // Deterministic pseudo-noise so hash is reproducible across builds
        const noise = Math.sin(i * 12.9898) * 43758.5453;
        const n = (noise - Math.floor(noise)) * 2 - 1;
        return (n * 0.65 + Math.sin(2 * Math.PI * 190 * t) * 0.35) * env * 0.7;
      }),
  },
  {
    name: 'Alert Tone',
    tags: ['effects'],
    gen: () =>
      synthesizeWav(0.3, 22050, (t) => {
        const freq = t < 0.14 ? 740 : 587;
        const env = Math.exp(-t * 6);
        return Math.sin(2 * Math.PI * freq * t) * env * 0.55;
      }),
  },
  {
    name: 'Whistle Slide',
    tags: ['effects', 'sports'],
    gen: () =>
      synthesizeWav(0.34, 22050, (t) => {
        const freq = 950 + 450 * Math.sin(Math.PI * (t / 0.34));
        const env = Math.sin(Math.PI * (t / 0.34));
        return Math.sin(2 * Math.PI * freq * t) * env * 0.5;
      }),
  },
];

function buildMediaAssets() {
  const staticAssetsDir = path.join(GUI_DIR, 'static/assets');
  ensureDir(staticAssetsDir);

  const manifestAssetIds = new Set();
  const approvedSoundIds = [];

  const soundsLibrary = [];
  const soundsByName = new Map();

  for (const spec of SOUND_SPECS) {
    const { buffer, sampleRate, sampleCount } = spec.gen();
    const assetId = md5(buffer);
    const md5ext = `${assetId}.wav`;
    fs.writeFileSync(path.join(staticAssetsDir, md5ext), buffer);
    manifestAssetIds.add(assetId);
    manifestAssetIds.add(md5ext);
    approvedSoundIds.push(assetId);

    const entry = {
      name: spec.name,
      assetId,
      md5ext,
      dataFormat: 'wav',
      format: '',
      rate: sampleRate,
      sampleCount,
      tags: spec.tags,
    };
    soundsLibrary.push(entry);
    soundsByName.set(spec.name, { entry, buffer });
  }

  const backdropsLibrary = [];
  let blankBackdrop = null;

  for (const spec of BACKDROP_SPECS) {
    const buf = Buffer.from(spec.svg, 'utf8');
    const assetId = md5(buf);
    const md5ext = `${assetId}.svg`;
    fs.writeFileSync(path.join(staticAssetsDir, md5ext), buf);
    manifestAssetIds.add(assetId);
    manifestAssetIds.add(md5ext);

    const entry = {
      name: spec.name,
      assetId,
      md5ext,
      dataFormat: 'svg',
      bitmapResolution: 1,
      rotationCenterX: 240,
      rotationCenterY: 180,
      tags: spec.tags,
    };
    backdropsLibrary.push(entry);
    if (spec.name === 'Blank Canvas') {
      blankBackdrop = { entry, svg: spec.svg };
    }
  }

  const spritesLibrary = [];
  const costumesLibrary = [];
  let roboSprite = null;
  const popSound = soundsByName.get('Pop');
  const beepSound = soundsByName.get('Beep');

  for (const spec of SPRITE_SPECS) {
    const builtCostumes = [];
    for (const c of spec.costumes) {
      const buf = Buffer.from(c.svg, 'utf8');
      const assetId = md5(buf);
      const md5ext = `${assetId}.svg`;
      fs.writeFileSync(path.join(staticAssetsDir, md5ext), buf);
      manifestAssetIds.add(assetId);
      manifestAssetIds.add(md5ext);

      const costumeEntry = {
        name: c.name,
        assetId,
        md5ext,
        dataFormat: 'svg',
        bitmapResolution: 1,
        rotationCenterX: c.rx,
        rotationCenterY: c.ry,
        tags: spec.tags,
      };
      builtCostumes.push(costumeEntry);
      costumesLibrary.push(costumeEntry);
    }

    const spriteEntry = {
      name: spec.name,
      tags: spec.tags,
      isStage: false,
      variables: {},
      lists: {},
      broadcasts: {},
      comments: {},
      currentCostume: 0,
      costumes: builtCostumes,
      sounds: [beepSound.entry],
      blocks: {},
      volume: 100,
      visible: true,
      x: 0,
      y: 0,
      size: 100,
      direction: 90,
      draggable: false,
      rotationStyle: 'all around',
      layerOrder: 1,
    };
    spritesLibrary.push(spriteEntry);
    if (spec.name === 'Robo') {
      roboSprite = { entry: spriteEntry, svgs: spec.costumes.map((c) => c.svg) };
    }
  }

  // Provide self-hosted original fallback files for Scratch GUI's built-in emptySprite / Paint tools
  const emptySvgAssetId = 'cd21514d0531fdffb22204e0ec5ed84a';
  const emptyPopAssetId = '83a9787d4cb6f3b7632b4ddfebf74367';
  fs.writeFileSync(
    path.join(staticAssetsDir, `${emptySvgAssetId}.svg`),
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"></svg>'
  );
  fs.writeFileSync(path.join(staticAssetsDir, `${emptyPopAssetId}.wav`), popSound.buffer);
  manifestAssetIds.add(emptySvgAssetId);
  manifestAssetIds.add(`${emptySvgAssetId}.svg`);
  manifestAssetIds.add(emptyPopAssetId);
  manifestAssetIds.add(`${emptyPopAssetId}.wav`);
  approvedSoundIds.push(emptyPopAssetId);

  // Write manifest.json into static/assets for both the editor bridge and LMS ScratchProjectAdapter
  const manifest = {
    version: '1.0.0',
    source: 'Jaystarbliss Coding Lab Self-Hosted Original Media Library (CC0 / MIT)',
    assetIds: Array.from(manifestAssetIds).sort(),
    approvedSoundIds,
    counts: {
      sprites: spritesLibrary.length,
      costumes: costumesLibrary.length,
      backdrops: backdropsLibrary.length,
      sounds: soundsLibrary.length,
    },
  };
  fs.writeFileSync(path.join(staticAssetsDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Replace Scratch library JSON catalogs so every library item resolves locally
  writeAndArchive('src/lib/libraries/sprites.json', JSON.stringify(spritesLibrary, null, 2));
  writeAndArchive('src/lib/libraries/costumes.json', JSON.stringify(costumesLibrary, null, 2));
  writeAndArchive('src/lib/libraries/backdrops.json', JSON.stringify(backdropsLibrary, null, 2));
  writeAndArchive('src/lib/libraries/sounds.json', JSON.stringify(soundsLibrary, null, 2));

  // Update default-project to use Robo + Blank Canvas + Pop + Beep (NO Scratch Cat trademark!)
  const defaultProjDir = path.join(GUI_DIR, 'src/lib/default-project');
  const backdropId = blankBackdrop.entry.assetId;
  const robo1 = roboSprite.entry.costumes[0];
  const robo2 = roboSprite.entry.costumes[1];

  fs.writeFileSync(path.join(defaultProjDir, `${backdropId}.svg`), blankBackdrop.svg);
  fs.writeFileSync(path.join(defaultProjDir, `${robo1.assetId}.svg`), roboSprite.svgs[0]);
  fs.writeFileSync(path.join(defaultProjDir, `${robo2.assetId}.svg`), roboSprite.svgs[1]);
  fs.writeFileSync(path.join(defaultProjDir, `${popSound.entry.assetId}.wav`), popSound.buffer);
  fs.writeFileSync(path.join(defaultProjDir, `${beepSound.entry.assetId}.wav`), beepSound.buffer);

  writeAndArchive(
    'src/lib/default-project/index.ts',
    `import projectData from './project-data';
import {TranslatorFunction} from '../../gui-config';
import popWav from '!arraybuffer-loader!./${popSound.entry.assetId}.wav?';
import beepWav from '!arraybuffer-loader!./${beepSound.entry.assetId}.wav?';
import backdrop from '!raw-loader!./${backdropId}.svg?';
import costume1 from '!raw-loader!./${robo1.assetId}.svg?';
import costume2 from '!raw-loader!./${robo2.assetId}.svg?';

declare function require (path: 'fastestsmallesttextencoderdecoder'): {TextEncoder: typeof TextEncoder};

const defaultProject = (translator?: TranslatorFunction) => {
    let _TextEncoder: typeof TextEncoder;
    if (typeof TextEncoder === 'undefined') {
        _TextEncoder = require('fastestsmallesttextencoderdecoder').TextEncoder;
    } else {
        _TextEncoder = TextEncoder;
    }
    const encoder = new _TextEncoder();
    const projectJson = projectData(translator);

    return [{
        id: 0,
        assetType: 'Project',
        dataFormat: 'JSON',
        data: JSON.stringify(projectJson)
    }, {
        id: '${popSound.entry.assetId}',
        assetType: 'Sound',
        dataFormat: 'WAV',
        data: new Uint8Array(popWav)
    }, {
        id: '${beepSound.entry.assetId}',
        assetType: 'Sound',
        dataFormat: 'WAV',
        data: new Uint8Array(beepWav)
    }, {
        id: '${backdropId}',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(backdrop)
    }, {
        id: '${robo1.assetId}',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(costume1)
    }, {
        id: '${robo2.assetId}',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(costume2)
    }];
};

export default defaultProject;
`
  );

  writeAndArchive(
    'src/lib/default-project/project-data.ts',
    `import {defineMessages} from 'react-intl';
import sharedMessages from '../shared-messages';
import {TranslatorFunction} from '../../gui-config';

const messages = defineMessages({
    pop: {
        defaultMessage: 'Pop',
        description: 'Name for the pop sound',
        id: 'gui.defaultProject.pop'
    },
    variable: {
        defaultMessage: 'my variable',
        description: 'Name for the default variable',
        id: 'gui.defaultProject.variable'
    }
});

const defaultTranslator: TranslatorFunction = msgObj => msgObj.defaultMessage;

const projectData = (translateFunction?: TranslatorFunction) => {
    const translator = translateFunction || defaultTranslator;
    return ({
        targets: [
            {
                isStage: true,
                name: 'Stage',
                variables: {
                    '\`jEk@4|i[#Fk?(8x)AV.-my variable': [
                        translator(messages.variable),
                        0
                    ]
                },
                lists: {},
                broadcasts: {},
                blocks: {},
                currentCostume: 0,
                costumes: [
                    {
                        assetId: '${backdropId}',
                        name: translator(sharedMessages.backdrop, {index: 1}),
                        md5ext: '${backdropId}.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 240,
                        rotationCenterY: 180
                    }
                ],
                sounds: [
                    {
                        assetId: '${popSound.entry.assetId}',
                        name: translator(messages.pop),
                        dataFormat: 'wav',
                        format: '',
                        rate: ${popSound.entry.rate},
                        sampleCount: ${popSound.entry.sampleCount},
                        md5ext: '${popSound.entry.md5ext}'
                    }
                ],
                volume: 100
            },
            {
                isStage: false,
                name: 'Robo',
                variables: {},
                lists: {},
                broadcasts: {},
                blocks: {},
                currentCostume: 0,
                costumes: [
                    {
                        assetId: '${robo1.assetId}',
                        name: 'robo-idle',
                        bitmapResolution: 1,
                        md5ext: '${robo1.md5ext}',
                        dataFormat: 'svg',
                        rotationCenterX: ${robo1.rotationCenterX},
                        rotationCenterY: ${robo1.rotationCenterY}
                    },
                    {
                        assetId: '${robo2.assetId}',
                        name: 'robo-wave',
                        bitmapResolution: 1,
                        md5ext: '${robo2.md5ext}',
                        dataFormat: 'svg',
                        rotationCenterX: ${robo2.rotationCenterX},
                        rotationCenterY: ${robo2.rotationCenterY}
                    }
                ],
                sounds: [
                    {
                        assetId: '${beepSound.entry.assetId}',
                        name: 'Beep',
                        dataFormat: 'wav',
                        format: '',
                        rate: ${beepSound.entry.rate},
                        sampleCount: ${beepSound.entry.sampleCount},
                        md5ext: '${beepSound.entry.md5ext}'
                    }
                ],
                volume: 100,
                visible: true,
                x: 0,
                y: 0,
                size: 100,
                direction: 90,
                draggable: false,
                rotationStyle: 'all around'
            }
        ],
        meta: {
            semver: '3.0.0',
            vm: '15.3.0',
            agent: 'CodingLab-SelfHosted'
        }
    });
};

export default projectData;
`
  );

  return { approvedSoundIds };
}

// ============================================================================
// 2. PATCH UPSTREAM SCRATCH-GUI FOR SELF-HOSTED CODING LAB OPERATION
// ============================================================================

function applyCodingLabPatches(approvedSoundIds) {
  // Patch 1: Self-hosted local library asset URLs (zero requests to scratch.mit.edu)
  writeAndArchive(
    'src/lib/legacy-library-asset-url.ts',
    `/**
 * Modified for Coding Lab (AGPL-3.0):
 * Serves approved built-in library assets strictly from same-origin self-hosted static files
 * instead of https://cdn.assets.scratch.mit.edu.
 */
export const buildLibraryAssetUrl = (assetId: string, dataFormat: string, host?: string): string => {
    const cleanHost = host ? host.replace(/\\/+$/, '') : '';
    if (cleanHost) {
        return \`\${cleanHost}/\${assetId}.\${dataFormat}\`;
    }
    return \`static/assets/\${assetId}.\${dataFormat}\`;
};
`
  );

  // Patch 2: Self-hosted local storage (never fetches projects or assets from scratch.mit.edu)
  writeAndArchive(
    'src/lib/legacy-storage.ts',
    `/**
 * Modified for Coding Lab (AGPL-3.0):
 * Configures ScratchStorage to load built-in library assets exclusively from
 * same-origin static/assets/ without calling projects.scratch.mit.edu or assets.scratch.mit.edu.
 */
import {ScratchStorage, Asset} from '@scratch/scratch-storage';
import defaultProject from './default-project';
import {GUIStorage, TranslatorFunction, VirtualMachine, GUICloudVariableProvider} from '../gui-config';
import {LegacyBackpackStorage} from './legacy-backpack-storage';
import CloudProvider from './cloud-provider';
import {buildLibraryAssetUrl} from './legacy-library-asset-url';

export class LegacyStorage implements GUIStorage {
    private projectHost?: string;
    private projectToken?: string;
    private assetHost?: string;
    private translator?: TranslatorFunction;

    readonly scratchStorage = new ScratchStorage();

    readonly backpackStorage = new LegacyBackpackStorage({
        readAuth () {
            return Promise.reject(new Error('Backpack disabled in Coding Lab'));
        }
    });

    readonly cloudVariables = {
        createProvider (
            cloudHost: string,
            vm: VirtualMachine,
            username: string,
            projectId: string
        ): GUICloudVariableProvider {
            return new CloudProvider(cloudHost, vm, username, projectId);
        }
    };

    constructor () {
        this.cacheDefaultProject(this.scratchStorage);
        this.addSelfHostedWebStores(this.scratchStorage);
    }

    setProjectHost (host: string): void {
        this.projectHost = host;
    }

    setProjectToken (token: string): void {
        this.projectToken = token;
    }

    setProjectMetadata (): void {
        // No remote Scratch project metadata requests
    }

    setAssetHost (host: string): void {
        this.assetHost = host;
    }

    getLibraryAssetUrl (assetId: string, dataFormat: string): string {
        return buildLibraryAssetUrl(assetId, dataFormat);
    }

    setTranslatorFunction (translator: TranslatorFunction): void {
        this.translator = translator;
        this.cacheDefaultProject(this.scratchStorage);
    }

    setBackpackHost (): void {
        // Backpack disabled in Coding Lab
    }

    saveProject (): Promise<{id: string | number;}> {
        return Promise.reject(new Error('Direct remote Scratch saving is disabled in Coding Lab.'));
    }

    private cacheDefaultProject (storage: ScratchStorage) {
        const defaultProjectAssets = defaultProject(this.translator);
        defaultProjectAssets.forEach(asset => storage.builtinHelper._store(
            storage.AssetType[asset.assetType],
            storage.DataFormat[asset.dataFormat],
            asset.data,
            asset.id
        ));
    }

    private addSelfHostedWebStores (storage: ScratchStorage) {
        // Resolve against window.location.href so ScratchStorage's fetch-worker (loaded from chunks/)
        // always resolves /coding-lab-editor/static/assets/... instead of /coding-lab-editor/chunks/static/assets/...
        const resolveAssetUrl = (relPath: string): string => {
            if (typeof window !== 'undefined' && window.location && window.location.href) {
                try {
                    return new URL(relPath, window.location.href).href;
                } catch {
                    // fallback below
                }
            }
            return \`/coding-lab-editor/\${relPath}\`;
        };
        storage.addWebStore(
            [storage.AssetType.ImageVector, storage.AssetType.ImageBitmap, storage.AssetType.Sound],
            (asset: Asset) => resolveAssetUrl(\`static/assets/\${asset.assetId}.\${asset.dataFormat}\`)
        );
        storage.addWebStore(
            [storage.AssetType.Sound],
            (asset: Asset) => resolveAssetUrl(\`static/extension-assets/scratch3_music/\${asset.assetId}.\${asset.dataFormat}\`)
        );
    }
}
`
  );

  // Patch 3: SoundTab — remove microphone recording & custom audio upload controls + disable handlers
  const origSoundTab = fs.readFileSync(path.join(GUI_DIR, 'src/containers/sound-tab.jsx'), 'utf8');
  let patchedSoundTab = origSoundTab
    // Disable handleSoundUpload handler completely
    .replace(
      /handleSoundUpload\s*\(e\)\s*\{[\s\S]*?^\s{4}\}/m,
      `handleSoundUpload () {\n        // Disabled in Coding Lab v1: custom audio uploads are not permitted.\n        return;\n    }`
    )
    // Disable handleFileUploadClick handler completely
    .replace(
      /handleFileUploadClick\s*\(\)\s*\{[\s\S]*?^\s{4}\}/m,
      `handleFileUploadClick () {\n        // Disabled in Coding Lab v1: custom audio uploads are not permitted.\n        return;\n    }`
    )
    // Remove upload & record buttons from AssetPanel
    .replace(
      /buttons=\{\[\{[\s\S]*?img:\s*searchIcon[\s\S]*?\}\]\}/m,
      `buttons={[{\n                    title: intl.formatMessage(messages.addSound),\n                    img: addSoundFromLibraryIcon,\n                    onClick: this.handleNewSoundFromLibraryClick\n                }, {\n                    title: intl.formatMessage(messages.surpriseSound),\n                    img: surpriseIcon,\n                    onClick: this.handleSurpriseSound\n                }]}`
    )
    // Remove RecordModal rendering completely
    .replace(
      /\{this\.props\.soundRecorderVisible\s*\?\s*\([\s\S]*?\)\s*:\s*null\}/m,
      `{null}`
    )
    // Disable openSoundRecorder dispatch
    .replace(
      /onNewSoundFromRecordingClick:\s*\(\)\s*=>\s*\{[\s\S]*?\},/m,
      `onNewSoundFromRecordingClick: () => {\n        // Disabled in Coding Lab v1: microphone recording is disabled.\n    },`
    );

  writeAndArchive('src/containers/sound-tab.jsx', patchedSoundTab);

  // Patch 4: file-uploader.js — hard-block soundUpload at runtime
  const origUploader = fs.readFileSync(path.join(GUI_DIR, 'src/lib/file-uploader.js'), 'utf8');
  const patchedUploader = origUploader.replace(
    /const soundUpload = function[\s\S]*?^const spriteUpload = function/m,
    `const soundUpload = function (_fileData, _fileType, _storage, _handleSound, handleError) {\n    if (typeof handleError === 'function') {\n        handleError('Custom audio uploads are disabled in Coding Lab.');\n    }\n};\n\nconst spriteUpload = function`
  );
  writeAndArchive('src/lib/file-uploader.js', patchedUploader);

  // Patch 5: Same-origin postMessage bridge between Scratch VM and CodingLabEditorHost
  writeAndArchive(
    'src/playground/coding-lab-bridge.js',
    `/**
 * CodingLabBridge (AGPL-3.0)
 * Connects the live Scratch 3 VM & Storage inside the self-hosted editor frame
 * to the parent Jaystarbliss CodingLabEditorHost via strict same-origin postMessage.
 */

const APPROVED_BUILTIN_SOUNDS = new Set(${JSON.stringify(approvedSoundIds)});

let activeVm = null;
let isReadOnly = false;
let isInternalLoading = false;
let projectLoaded = false;
let readySent = false;
let readyFallbackTimer = null;
let changeDebounceTimer = null;
let vmPatched = false;

function postToParent(payload, transfer = []) {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
    try {
        window.parent.postMessage(payload, window.location.origin, transfer);
    } catch {
        // Ignore if parent frame is navigating
    }
}

function emitReady() {
    if (!activeVm) return;
    readySent = true;
    if (readyFallbackTimer) {
        clearTimeout(readyFallbackTimer);
        readyFallbackTimer = null;
    }
    postToParent({
        type: 'CODING_LAB_READY',
        version: '15.3.0',
        approvedSoundCount: APPROVED_BUILTIN_SOUNDS.size,
        hasStage: Boolean(activeVm.runtime && activeVm.runtime.getTargetForStage && activeVm.runtime.getTargetForStage())
    });
}

function applyReadOnlyMode(readOnly) {
    isReadOnly = Boolean(readOnly);
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('coding-lab-readonly', isReadOnly);
    }
}

export function notifyCodingLabProjectLoaded() {
    projectLoaded = true;
    if (activeVm) {
        emitReady();
    }
}

export function attachCodingLabVm(vm) {
    if (!vm || activeVm === vm) return;
    activeVm = vm;

    // Enforce v1 sound policy at VM layer: block microphone recordings & non-approved custom sounds
    if (!vmPatched && typeof vm.addSound === 'function') {
        vmPatched = true;
        const origAddSound = vm.addSound.bind(vm);
        vm.addSound = function guardedAddSound(soundObject, optTargetId) {
            const md5 = String(soundObject?.md5 || soundObject?.md5ext || soundObject?.assetId || '')
                .split('.')[0]
                .toLowerCase();
            if (!isInternalLoading && md5 && !APPROVED_BUILTIN_SOUNDS.has(md5)) {
                return Promise.reject(new Error('Custom audio uploads and microphone recordings are disabled in Coding Lab.'));
            }
            return origAddSound(soundObject, optTargetId);
        };
    }

    vm.on('PROJECT_CHANGED', () => {
        if (isInternalLoading || isReadOnly || !projectLoaded) return;
        if (changeDebounceTimer) clearTimeout(changeDebounceTimer);
        changeDebounceTimer = setTimeout(() => {
            postToParent({
                type: 'CODING_LAB_PROJECT_CHANGED',
                timestamp: Date.now()
            });
        }, 700);
    });

    if (projectLoaded || (vm.runtime && vm.runtime.getTargetForStage && vm.runtime.getTargetForStage())) {
        projectLoaded = true;
        emitReady();
    } else {
        readyFallbackTimer = setTimeout(() => {
            if (!readySent) {
                projectLoaded = true;
                emitReady();
            }
        }, 3500);
    }
}

if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('readonly') === '1') {
        applyReadOnlyMode(true);
    }

    window.addEventListener('message', async event => {
        // Strict same-origin security gate
        if (event.origin !== window.location.origin) return;
        const msg = event.data;
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

        if (msg.type === 'CODING_LAB_PING') {
            if (activeVm && (projectLoaded || readySent)) {
                emitReady();
            }
            return;
        }

        if (msg.type === 'CODING_LAB_SET_READ_ONLY') {
            applyReadOnlyMode(Boolean(msg.readOnly));
            return;
        }

        if (!activeVm) {
            if (msg.requestId) {
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: false,
                    error: 'Scratch VM is still initializing.'
                });
            }
            return;
        }

        if (msg.type === 'CODING_LAB_LOAD_SB3') {
            try {
                isInternalLoading = true;
                activeVm.stopAll();
                await activeVm.loadProject(msg.buffer);
                projectLoaded = true;
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: true
                });
            } catch (err) {
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err)
                });
            } finally {
                setTimeout(() => {
                    isInternalLoading = false;
                }, 400);
            }
            return;
        }

        if (msg.type === 'CODING_LAB_EXPORT_SB3') {
            try {
                const sb3ArrayBuffer = await activeVm.saveProjectSb3('arraybuffer');
                const projectJsonString = activeVm.toJSON();
                postToParent(
                    {
                        type: 'CODING_LAB_RESPONSE',
                        requestId: msg.requestId,
                        ok: true,
                        sb3Buffer: sb3ArrayBuffer,
                        projectJsonString
                    },
                    [sb3ArrayBuffer]
                );
            } catch (err) {
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err)
                });
            }
            return;
        }

        if (msg.type === 'CODING_LAB_GET_JSON') {
            try {
                const projectJsonString = activeVm.toJSON();
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: true,
                    projectJsonString
                });
            } catch (err) {
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err)
                });
            }
            return;
        }
    });
}
`
  );

  // Patch 6: render-gui.jsx + index.css — hide Scratch trademark menu bar, mount bridge, load default project ("0") on mount
  writeAndArchive(
    'src/playground/render-gui.jsx',
    `/**
 * Modified for Coding Lab (AGPL-3.0):
 * Renders Scratch GUI without Scratch trademark top menu bar, disables remote Scratch links,
 * triggers defaultProject ("0") initialization on mount (matching upstream HashParserHOC
 * without ever loading remote Scratch project IDs), and attaches CodingLabBridge.
 */
import React from 'react';
import ReactDomClient from 'react-dom/client';
import {compose} from 'redux';
import {connect} from 'react-redux';
import AppStateHOC from '../lib/app-state-hoc.jsx';
import GUI from '../containers/gui.jsx';
import {defaultProjectId, setProjectId} from '../reducers/project-state';
import {attachCodingLabVm, notifyCodingLabProjectLoaded} from './coding-lab-bridge.js';

const DefaultProjectHOC = function (WrappedComponent) {
    class DefaultProjectComponent extends React.Component {
        componentDidMount () {
            this.props.setProjectId(defaultProjectId);
        }
        render () {
            const {
                setProjectId: _setProjectId,
                ...componentProps
            } = this.props;
            return <WrappedComponent {...componentProps} />;
        }
    }
    const mapDispatchToProps = dispatch => ({
        setProjectId: projectId => {
            dispatch(setProjectId(projectId));
        }
    });
    return connect(null, mapDispatchToProps)(DefaultProjectComponent);
};

export default appTarget => {
    GUI.setAppElement(appTarget);

    const WrappedGui = compose(
        AppStateHOC,
        DefaultProjectHOC
    )(GUI);

    const root = ReactDomClient.createRoot(appTarget);
    root.render(
        <WrappedGui
            menuBarHidden
            canEditTitle={false}
            canSave={false}
            canShare={false}
            canRemix={false}
            canCreateNew={false}
            canManageFiles={false}
            canUseCloud={false}
            backpackVisible={false}
            showComingSoon={false}
            onVmInit={attachCodingLabVm}
            onProjectLoaded={notifyCodingLabProjectLoaded}
        />
    );
};
`
  );

  writeAndArchive(
    'src/playground/index.css',
    `html, body, .app {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    background: #f8fafc;
}

* {
    box-sizing: border-box;
}

/* Ensure smooth horizontal + vertical scrolling on phones, tablets, and zoomed screens */
html, body {
    overflow: auto !important;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x pan-y;
}

@media (max-width: 1180px), (max-height: 680px) {
    .app,
    [class*="gui_page-wrapper"],
    [class*="gui_body-wrapper"] {
        overflow: auto !important;
        -webkit-overflow-scrolling: touch;
    }
    [class*="gui_page-wrapper"] {
        min-width: 1024px !important;
        min-height: 640px !important;
    }
}

/* Tutor Read-Only Review Mode: allow Green Flag / Stop / Stage / Tab & Sprite inspection, block workspace mutations */
body.coding-lab-readonly .blocklyToolboxDiv,
body.coding-lab-readonly .blocklyFlyout,
body.coding-lab-readonly [class*="action-menu_menu-container"],
body.coding-lab-readonly [class*="delete-button_delete-button"],
body.coding-lab-readonly [class*="extension-button_extension-button-container"] {
    display: none !important;
    pointer-events: none !important;
}

body.coding-lab-readonly .blocklyBlockCanvas,
body.coding-lab-readonly [class*="paint-editor_editor-container"],
body.coding-lab-readonly [class*="sound-editor_editor-container"] button[class*="effect"] {
    pointer-events: none !important;
}
`
  );
}

// ============================================================================
// 3. BUILD WORKSPACE PACKAGES & EXPORT TO public/coding-lab-editor/
// ============================================================================

function buildScratchEditorBundle() {
  const packagesToBuild = [
    '@scratch/task-herder',
    '@scratch/scratch-storage',
    '@scratch/scratch-svg-renderer',
    '@scratch/scratch-paint',
    '@scratch/scratch-render',
    '@scratch/scratch-vm',
  ];

  for (const pkg of packagesToBuild) {
    console.log(`[CodingLab Build] Building workspace package ${pkg}...`);
    execSync(`npm --workspace ${pkg} run build`, {
      cwd: SCRATCH_REPO,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=960',
      },
    });
    // Remove unused playground build dirs in intermediate packages (gui only consumes dist/)
    const pkgDirName = pkg.replace(/^@scratch\//, '');
    const intermediateBuild = path.join(SCRATCH_REPO, 'packages', pkgDirName, 'build');
    if (fs.existsSync(intermediateBuild)) {
      fs.rmSync(intermediateBuild, { recursive: true, force: true });
    }
  }

  console.log('[CodingLab Build] Building self-hosted @scratch/scratch-gui web bundle (single gui entry, ultra-low-memory)...');
  const leanWebpackConfigPath = path.join(GUI_DIR, 'webpack.coding-lab.config.cjs');
  fs.writeFileSync(
    leanWebpackConfigPath,
    `const upstreamFactory = require('./webpack.config.js');
function patchRules(rules) {
  if (!Array.isArray(rules)) return rules;
  return rules.map((rule) => {
    if (!rule || typeof rule !== 'object') return rule;
    const copy = { ...rule };
    if (copy.loader === 'ts-loader') {
      copy.options = { ...(copy.options || {}), transpileOnly: true };
    }
    if (Array.isArray(copy.use)) {
      copy.use = copy.use.map((u) => {
        if (u === 'ts-loader') return { loader: 'ts-loader', options: { transpileOnly: true } };
        if (u && typeof u === 'object' && u.loader === 'ts-loader') {
          return { ...u, options: { ...(u.options || {}), transpileOnly: true } };
        }
        return u;
      });
    }
    if (Array.isArray(copy.oneOf)) copy.oneOf = patchRules(copy.oneOf);
    if (Array.isArray(copy.rules)) copy.rules = patchRules(copy.rules);
    return copy;
  });
}
module.exports = (env, argv) => {
  const raw = typeof upstreamFactory === 'function' ? upstreamFactory(env, argv) : upstreamFactory;
  const configs = Array.isArray(raw) ? raw : [raw];
  return configs.map((cfg) => {
    const next = {
      ...cfg,
      devtool: false,
      cache: false,
      parallelism: 1,
      optimization: {
        ...(cfg.optimization || {}),
        minimize: false,
      },
      module: cfg.module ? { ...cfg.module, rules: patchRules(cfg.module.rules) } : cfg.module,
    };
    if (next.entry && typeof next.entry === 'object' && !Array.isArray(next.entry) && next.entry.gui) {
      next.entry = { gui: next.entry.gui };
    }
    if (Array.isArray(next.plugins)) {
      next.plugins = next.plugins.filter((p) => {
        const name = p && p.constructor ? p.constructor.name : '';
        if (name === 'SourceMapDevToolPlugin' || name === 'ForkTsCheckerWebpackPlugin') return false;
        if (name === 'HtmlWebpackPlugin' && p.userOptions && p.userOptions.filename && p.userOptions.filename !== 'index.html') {
          return false;
        }
        return true;
      });
    }
    return next;
  });
};
`
  );
  execSync('npx webpack --config webpack.coding-lab.config.cjs --mode production --bail', {
    cwd: GUI_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      CI: 'true',
      NODE_OPTIONS: '--max-old-space-size=1024',
    },
  });
}

function copyOutputToPublic() {
  const buildDir = path.join(GUI_DIR, 'build');
  if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    throw new Error(`Expected built Scratch GUI at ${buildDir}/index.html`);
  }

  fs.rmSync(PUBLIC_OUT_DIR, { recursive: true, force: true });
  ensureDir(PUBLIC_OUT_DIR);

  // Copy required runtime artifacts only (skip unused standalone/player/compatibility example html & js)
  const skipFiles = new Set([
    'standalone.html',
    'guistandalone.js',
    'guistandalone.js.map',
    'blocks-only.html',
    'blocksonly.js',
    'blocksonly.js.map',
    'compatibility-testing.html',
    'compatibilitytesting.js',
    'compatibilitytesting.js.map',
    'site-maintenance.html',
    'sitemaintenance.js',
    'sitemaintenance.js.map',
    'player.html',
    'player.js',
    'player.js.map',
    'gui.js.map',
    'extension-worker.js.map',
  ]);

  function copyFiltered(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      ensureDir(dest);
      for (const entry of fs.readdirSync(src)) {
        if (entry.endsWith('.map')) continue;
        copyFiltered(path.join(src, entry), path.join(dest, entry));
      }
      return;
    }
    const base = path.basename(src);
    if (skipFiles.has(base) || base.endsWith('.map')) return;
    fs.copyFileSync(src, dest);
  }

  copyFiltered(buildDir, PUBLIC_OUT_DIR);

  // Update index.html title to Coding Lab (no Scratch trademark title)
  const indexHtmlPath = path.join(PUBLIC_OUT_DIR, 'index.html');
  let html = fs.readFileSync(indexHtmlPath, 'utf8');
  html = html.replace(/<title>[^<]*<\/title>/i, '<title>Coding Lab</title>');
  fs.writeFileSync(indexHtmlPath, html);

  // Post-build self-hosting patches:
  // 1) Ensure nested @scratch/scratch-storage webpack publicPath is relative ("") so fetch-worker loads under /coding-lab-editor/chunks/
  // 2) Add worker error fallback in PrivateFetchWorkerTool so ProxyTool falls back to main-thread FetchTool if worker fails
  // 3) Patch Paper.js SVG <rect> importer to honor W3C SVG spec (default missing ry=rx and rx=ry) so rounded shapes stay rounded in Costume Editor
  const guiJsPath = path.join(PUBLIC_OUT_DIR, 'gui.js');
  if (fs.existsSync(guiJsPath)) {
    let guiCode = fs.readFileSync(guiJsPath, 'utf8');
    guiCode = guiCode.replace(/(__nested_webpack_require_\d+__\.p\s*=\s*)"\/";/g, '$1"";');
    guiCode = guiCode.replace(
      "solutionPath: '/chunks/mediapipe/face_detection'",
      "solutionPath: 'chunks/mediapipe/face_detection'"
    );
    guiCode = guiCode.replace(
      `        this.worker = worker;\n      }\n    } catch (error) {\n      this._supportError = error;`,
      `        worker.addEventListener('error', error => {\n          this._supportError = error || new Error('Fetch worker failed to load');\n          this._workerSupport = { fetch: false };\n          const pendingJobs = Object.values(this.jobs);\n          this.jobs = {};\n          for (const job of pendingJobs) {\n            job.reject(this._supportError);\n          }\n        });\n        this.worker = worker;\n      }\n    } catch (error) {\n      this._supportError = error;`
    );
    guiCode = guiCode.replace(
      `rect: function(node) {\n\t\t\treturn new Shape.Rectangle(new Rectangle(\n\t\t\t\t\t\tgetPoint(node),\n\t\t\t\t\t\tgetSize(node)\n\t\t\t\t\t), getSize(node, 'rx', 'ry'));\n\t\t\t},`,
      `rect: function(node) {\n\t\t\tvar radius = getSize(node, 'rx', 'ry');\n\t\t\tif (radius.width && !radius.height) radius.height = radius.width;\n\t\t\tif (radius.height && !radius.width) radius.width = radius.height;\n\t\t\treturn new Shape.Rectangle(new Rectangle(\n\t\t\t\t\t\tgetPoint(node),\n\t\t\t\t\t\tgetSize(node)\n\t\t\t\t\t), radius);\n\t\t\t},`
    );
    fs.writeFileSync(guiJsPath, guiCode);
  }

  for (const dir of [path.join(PUBLIC_OUT_DIR, 'static/assets'), path.join(PUBLIC_OUT_DIR, 'chunks')]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.startsWith('paper-') || !file.endsWith('.js')) continue;
      const fullPath = path.join(dir, file);
      let code = fs.readFileSync(fullPath, 'utf8');
      const oldRect = 'rect:function(t){return new S.Rectangle(new v(a(t),o(t)),o(t,"rx","ry"))}';
      const newRect = 'rect:function(t){var e=o(t,"rx","ry");return e.width&&!e.height&&(e.height=e.width),e.height&&!e.width&&(e.width=e.height),new S.Rectangle(new v(a(t),o(t)),e)}';
      code = code.replace(oldRect, newRect);
      code = code.replace(oldRect.replace(/"/g, '\\"'), newRect.replace(/"/g, '\\"'));
      fs.writeFileSync(fullPath, code);
    }
  }

  // Copy AGPL-3.0 LICENSE, TRADEMARK, and documentation into both vendor/ and public/coding-lab-editor/
  for (const legalFile of ['LICENSE', 'TRADEMARK']) {
    const src = path.join(SCRATCH_REPO, legalFile);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(VENDOR_DIR, legalFile));
      fs.copyFileSync(src, path.join(PUBLIC_OUT_DIR, legalFile));
    }
  }
  for (const docFile of ['MODIFICATIONS.md', 'MEDIA_LICENSES.md', 'UPSTREAM_REVISION.md']) {
    const src = path.join(VENDOR_DIR, docFile);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(PUBLIC_OUT_DIR, docFile));
    }
  }

  console.log(`[CodingLab Build] Self-hosted Coding Lab editor bundle written to ${PUBLIC_OUT_DIR}`);
}

console.log('[CodingLab Build] Generating self-hosted original media library...');
const { approvedSoundIds } = buildMediaAssets();
console.log('[CodingLab Build] Applying documented AGPL-3.0 Coding Lab patches...');
applyCodingLabPatches(approvedSoundIds);
buildScratchEditorBundle();
copyOutputToPublic();
console.log('[CodingLab Build] Complete!');
