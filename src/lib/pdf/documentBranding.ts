export type RgbTuple = [number, number, number];

export const JDI_INSTITUTION_NAME = 'JAYSTARBLISS DYNAMIC INSTITUTE';
export const JDI_INSTITUTION_SUBTITLE = 'INSTITUTE OF DIGITAL INNOVATION & CREATIVE ARTS';

export const JDI_CONTACTS = Object.freeze({
  email: 'jaystarblissstudios@gmail.com',
  handle: '@jaystarbliss_studios',
  website: 'www.jaystarblissstudios.com',
  verifyUrl: 'jaystarbliss-studios.name.ng/verify',
  portalUrl: 'jaystarbliss-studios.name.ng/portal',
});

export const JDI_COLORS = Object.freeze({
  NAVY_PRIMARY: [12, 35, 64] as RgbTuple,       // #0C2340
  NAVY_DEEP: [6, 19, 38] as RgbTuple,           // #061326
  NAVY_STEEL: [25, 59, 104] as RgbTuple,        // #193B68
  NAVY_ROYAL: [30, 64, 175] as RgbTuple,        // #1E40AF
  CRIMSON: [185, 28, 28] as RgbTuple,           // #B91C1C
  GOLD_ACCENT: [180, 83, 9] as RgbTuple,        // #B45309
  IVORY_BG: [254, 253, 250] as RgbTuple,        // #FEFDFA
  WHITE: [255, 255, 255] as RgbTuple,
  INK_DARK: [15, 23, 42] as RgbTuple,           // #0F172A
  INK_BODY: [51, 65, 85] as RgbTuple,           // #334155
  INK_MUTED: [100, 116, 139] as RgbTuple,       // #64748B
  INK_LIGHT: [148, 163, 184] as RgbTuple,       // #94A3B8
  ICE_BG: [238, 245, 252] as RgbTuple,          // #EEF5FC
  ICE_BORDER: [191, 219, 254] as RgbTuple,      // #BFDBFE
  CREAM_BG: [254, 252, 232] as RgbTuple,        // #FEFCE8
  CREAM_BORDER: [253, 224, 71] as RgbTuple,     // #FDE047
  AMBER_TITLE: [133, 77, 14] as RgbTuple,       // #854D0E
  AMBER_BODY: [113, 63, 18] as RgbTuple,        // #713F12
  SOFT_TINT: [248, 250, 252] as RgbTuple,       // #F8FAFC
  BORDER_LIGHT: [226, 232, 240] as RgbTuple,    // #E2E8F0
  BORDER_MID: [203, 213, 225] as RgbTuple,      // #CBD5E1
  EMERALD_TEXT: [4, 120, 87] as RgbTuple,       // #047857
  EMERALD_BADGE: [16, 185, 129] as RgbTuple,    // #10B981
  EMERALD_BG: [236, 253, 245] as RgbTuple,      // #ECFDF5
  EMERALD_BORDER: [167, 243, 208] as RgbTuple,  // #A7F3D0
  AMBER_BADGE: [217, 119, 6] as RgbTuple,       // #D97706
  CRIMSON_BADGE: [190, 18, 60] as RgbTuple,     // #BE123C
});

export const PDF_LAYOUT = Object.freeze({
  MARGIN_X: 15,
  HEADER_BANNER_HEIGHT: 20,
  CONTENT_TOP_SUBPAGE_Y: 36,
  FOOTER_RESERVED_HEIGHT: 28,
});

/**
 * Generates a deterministic institutional reference number from a prefix and record identifier.
 */
export function formatDocumentRefNo(prefix = 'JDI', seed?: string | number | null): string {
  const cleanPrefix =
    String(prefix || 'JDI')
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .replace(/^-+|-+$/g, '')
      .slice(0, 10) || 'JDI';

  const rawSeed = String(seed ?? '').trim();
  if (rawSeed) {
    const cleanAlpha = rawSeed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (cleanAlpha.startsWith(`${cleanPrefix}`) && cleanAlpha.length >= 8 && cleanAlpha.length <= 16) {
      return `${cleanPrefix}-${cleanAlpha.slice(cleanPrefix.length)}`;
    }
    if (rawSeed.toUpperCase().startsWith('JDI-') && rawSeed.length <= 22) {
      return rawSeed.toUpperCase();
    }
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < rawSeed.length; i += 1) {
      const ch = rawSeed.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
    }
    const token = `${h1.toString(36)}${h2.toString(36)}`
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .padEnd(11, 'X')
      .slice(0, 11);
    return `${cleanPrefix}-${token}`;
  }

  const timeToken = Date.now().toString(36).toUpperCase().padStart(8, '0').slice(-8);
  const randToken = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(3, '0');
  return `${cleanPrefix}-${timeToken}${randToken}`;
}

export function formatShortDateDDMMYY(input?: Date | string | number | { toDate?: () => Date } | null): string {
  const d = coerceValidDate(input) || new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export function formatDisplayDateTime(input?: Date | string | number | { toDate?: () => Date } | null): string {
  const d = coerceValidDate(input);
  if (!d) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatLongDate(input?: Date | string | number | { toDate?: () => Date } | null): string {
  const d = coerceValidDate(input) || new Date();
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function coerceValidDate(input?: Date | string | number | { toDate?: () => Date } | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof (input as { toDate?: () => Date })?.toDate === 'function') {
    try {
      const converted = (input as { toDate: () => Date }).toDate();
      return Number.isNaN(converted.getTime()) ? null : converted;
    } catch {
      return null;
    }
  }
  if (typeof (input as { seconds?: number })?.seconds === 'number') {
    const d = new Date((input as { seconds: number }).seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(input as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats Naira monetary amounts using ASCII-safe "NGN " prefix for WinAnsi jsPDF fonts.
 */
export function formatPdfCurrency(val: number | string | undefined): string {
  const num = typeof val === 'number' ? val : Number(val || 0);
  const safeNum = Number.isFinite(num) ? num : 0;
  return `NGN ${safeNum.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Sanitizes strings before rendering in WinAnsi Helvetica / Times / Courier jsPDF fonts
 * so currency symbols or Unicode glyphs never render as corrupted characters.
 */
export function sanitizePdfText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/\u20A6/g, 'NGN ')
    .replace(/[\u2713\u2714]/g, 'Verified:')
    .replace(/[\u2605\u2606]/g, '*')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}
