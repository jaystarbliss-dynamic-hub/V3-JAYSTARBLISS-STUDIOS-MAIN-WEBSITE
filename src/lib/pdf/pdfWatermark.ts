import type jsPDF from 'jspdf';

export const PERMANENT_WATERMARK_ASSET_PATH = '/FINAL_LOGO_JDI-removebg-preview.png';
export const DEFAULT_WATERMARK_OPACITY = 0.11;
export const DEFAULT_WATERMARK_SCALE_RATIO = 0.64;

export interface LoadedWatermarkAsset {
  dataUrl: string;
  width: number;
  height: number;
}

let cachedAsset: LoadedWatermarkAsset | null = null;
let pendingLoad: Promise<LoadedWatermarkAsset | null> | null = null;

/**
 * Converts a light/white-stroked transparent PNG into a dark/black-stroked PNG
 * only when the non-transparent pixels are predominantly bright (luminance > 160),
 * preserving exact geometry, anti-aliasing, and alpha transparency without distortion.
 */
function normalizeDarkWatermarkPixels(rgba: Uint8ClampedArray | Uint8Array): void {
  let sumLum = 0;
  let visibleCount = 0;

  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a > 20) {
      sumLum += (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
      visibleCount += 1;
    }
  }

  if (visibleCount === 0) return;
  const avgLum = sumLum / visibleCount;

  if (avgLum > 160) {
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] > 0) {
        rgba[i] = 255 - rgba[i];
        rgba[i + 1] = 255 - rgba[i + 1];
        rgba[i + 2] = 255 - rgba[i + 2];
      }
    }
  }
}

async function loadWatermarkInBrowser(): Promise<LoadedWatermarkAsset | null> {
  try {
    const response = await fetch(PERMANENT_WATERMARK_ASSET_PATH, { cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Watermark image decode failed'));
        image.src = objectUrl;
      });

      const width = img.naturalWidth || 500;
      const height = img.naturalHeight || 500;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      normalizeDarkWatermarkPixels(imageData.data);
      ctx.putImageData(imageData, 0, 0);

      return {
        dataUrl: canvas.toDataURL('image/png'),
        width,
        height,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

async function loadWatermarkInNode(): Promise<LoadedWatermarkAsset | null> {
  try {
    const fsMod = 'node:fs/promises';
    const pathMod = 'node:path';
    const sharpMod = 'sharp';
    const fs: any = await import(/* @vite-ignore */ fsMod);
    const path: any = await import(/* @vite-ignore */ pathMod);
    const proc: any = (globalThis as any).process;
    const cwd = typeof proc?.cwd === 'function' ? proc.cwd() : '.';
    const filePath = path.resolve(cwd, 'public', 'FINAL_LOGO_JDI-removebg-preview.png');
    const rawBuffer: any = await fs.readFile(filePath);

    try {
      const sharpImport: any = await import(/* @vite-ignore */ sharpMod);
      const sharpFn = sharpImport.default || sharpImport;
      const { data, info } = await sharpFn(rawBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const rgba = new Uint8Array(data);
      normalizeDarkWatermarkPixels(rgba);

      const pngBuffer: any = await sharpFn(rgba, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .png()
        .toBuffer();

      return {
        dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
        width: info.width || 500,
        height: info.height || 500,
      };
    } catch {
      return {
        dataUrl: `data:image/png;base64,${rawBuffer.toString('base64')}`,
        width: 500,
        height: 500,
      };
    }
  } catch {
    return null;
  }
}

export async function loadOfficialWatermarkAsset(): Promise<LoadedWatermarkAsset | null> {
  if (cachedAsset) return cachedAsset;
  if (pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    const loaded =
      typeof window !== 'undefined' && typeof document !== 'undefined'
        ? await loadWatermarkInBrowser()
        : await loadWatermarkInNode();

    if (loaded) {
      cachedAsset = loaded;
    }
    return loaded;
  })();

  try {
    return await pendingLoad;
  } finally {
    pendingLoad = null;
  }
}

export function getCachedWatermarkAsset(): LoadedWatermarkAsset | null {
  return cachedAsset;
}

export function preloadOfficialWatermark(): void {
  if (typeof window !== 'undefined' && !cachedAsset && !pendingLoad) {
    void loadOfficialWatermarkAsset();
  }
}

export interface DrawWatermarkOptions {
  opacity?: number;
  scaleRatio?: number;
  offsetY?: number;
}

export function drawPermanentPageWatermark(
  doc: jsPDF,
  asset: LoadedWatermarkAsset | null,
  options: DrawWatermarkOptions = {}
): void {
  if (!asset?.dataUrl) return;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const minDim = Math.min(pageWidth, pageHeight);
  const targetWidth = minDim * (options.scaleRatio ?? DEFAULT_WATERMARK_SCALE_RATIO);
  const aspect = asset.width > 0 && asset.height > 0 ? asset.width / asset.height : 1;
  const targetHeight = targetWidth / aspect;

  const x = (pageWidth - targetWidth) / 2;
  const y = (pageHeight - targetHeight) / 2 + (options.offsetY ?? 4);
  const opacity = options.opacity ?? DEFAULT_WATERMARK_OPACITY;

  const anyDoc = doc as any;
  const canUseGState = typeof anyDoc.GState === 'function' && typeof anyDoc.setGState === 'function';

  if (typeof anyDoc.saveGraphicsState === 'function') {
    anyDoc.saveGraphicsState();
  }

  try {
    if (canUseGState) {
      anyDoc.setGState(new anyDoc.GState({ opacity }));
    }
    doc.addImage(asset.dataUrl, 'PNG', x, y, targetWidth, targetHeight);
  } catch {
    // Non-fatal if image insertion fails on an unusual runtime
  } finally {
    if (canUseGState) {
      anyDoc.setGState(new anyDoc.GState({ opacity: 1 }));
    }
    if (typeof anyDoc.restoreGraphicsState === 'function') {
      anyDoc.restoreGraphicsState();
    }
  }
}
