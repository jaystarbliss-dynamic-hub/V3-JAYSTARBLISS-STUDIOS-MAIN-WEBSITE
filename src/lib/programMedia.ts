import technologyContainerBg from '../assets/images/container_technology_1795178515854.jpg';
import designGraphicsContainerBg from '../assets/images/container_design_graphics_1795178514978.jpg';
import musicContainerBg from '../assets/images/container_music_1795178513565.jpg';
import academicsContainerBg from '../assets/images/container_academics_1795178515384.jpg';
import {
  normalizeCanonicalRootKey,
  resolveProgramCanonicalRoot,
  type CanonicalRootKey,
  type ProgramRecord,
} from './programHierarchy';

export const PROGRAM_CONTAINER_BACKGROUNDS: Record<CanonicalRootKey, string> = {
  technology: technologyContainerBg,
  'design-graphics': designGraphicsContainerBg,
  music: musicContainerBg,
  academics: academicsContainerBg,
};

export function getContainerBackgroundByRoot(rootOrCategory?: string | null): string {
  const normalized = normalizeCanonicalRootKey(rootOrCategory);
  if (normalized && PROGRAM_CONTAINER_BACKGROUNDS[normalized]) {
    return PROGRAM_CONTAINER_BACKGROUNDS[normalized];
  }
  const raw = String(rootOrCategory || '').toLowerCase();
  if (raw.includes('music') || raw.includes('piano') || raw.includes('vocal') || raw.includes('audio')) {
    return PROGRAM_CONTAINER_BACKGROUNDS.music;
  }
  if (raw.includes('design') || raw.includes('graphic') || raw.includes('creative') || raw.includes('ui') || raw.includes('art')) {
    return PROGRAM_CONTAINER_BACKGROUNDS['design-graphics'];
  }
  if (raw.includes('academ') || raw.includes('math') || raw.includes('exam') || raw.includes('waec') || raw.includes('jamb') || raw.includes('science')) {
    return PROGRAM_CONTAINER_BACKGROUNDS.academics;
  }
  return PROGRAM_CONTAINER_BACKGROUNDS.technology;
}

/**
 * Returns the best cover/background image for a programme or programme container:
 * prefers an uploaded featuredImage URL (non-empty), falling back to the
 * matching bespoke canonical studio container background image.
 */
export function resolveProgramBackgroundImage(
  program: Pick<
    ProgramRecord,
    'featuredImage' | 'primaryRootKey' | 'categoryId' | 'rootProgramId' | 'parentProgramId' | 'title' | 'slug' | 'id'
  >,
  programsMap?: Map<string, ProgramRecord>,
  explicitRootKey?: CanonicalRootKey | null
): string {
  const uploaded = String(program?.featuredImage || '').trim();
  if (uploaded) {
    return uploaded;
  }

  if (explicitRootKey && PROGRAM_CONTAINER_BACKGROUNDS[explicitRootKey]) {
    return PROGRAM_CONTAINER_BACKGROUNDS[explicitRootKey];
  }

  if (programsMap && program && 'id' in program && program.id) {
    const full = programsMap.get(program.id) || (program as ProgramRecord);
    const resolved = resolveProgramCanonicalRoot(full, programsMap);
    if (resolved.rootKey) {
      return PROGRAM_CONTAINER_BACKGROUNDS[resolved.rootKey];
    }
  }

  return getContainerBackgroundByRoot(
    program?.primaryRootKey || program?.categoryId || program?.title || program?.slug
  );
}
