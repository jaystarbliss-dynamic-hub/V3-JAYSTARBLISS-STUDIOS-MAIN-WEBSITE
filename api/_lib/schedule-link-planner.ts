/**
 * Pure Per-Session Class Meeting Link Planner & Validator (Part 8)
 *
 * Shared by Netlify Functions (`class-schedules.ts`), client scheduling (`scheduleEngine.ts`),
 * and automated test suites.
 *
 * Guarantees:
 * - Tutors can set a default meeting link on recurring schedule groups AND custom per-week links.
 * - Editing a single occurrence NEVER changes unrelated or historical occurrences.
 * - Updating future defaults NEVER overwrites historical/past or completed class links.
 * - Supports single occurrence, selected future occurrences, future inherited occurrences, or reset to default.
 */

export type MeetingLinkSource = "INHERITED" | "CUSTOM";

export type MeetingLinkUpdateScope =
  | "SINGLE"
  | "SELECTED_FUTURE"
  | "ALL_FUTURE_INHERITED"
  | "ALL_FUTURE"
  | "RESET_TO_DEFAULT";

export interface ScheduleOccurrenceLinkView {
  id: string;
  scheduleGroupId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  meetingLink?: string;
  defaultMeetingLink?: string;
  linkSource?: MeetingLinkSource | string;
  platform?: string;
  tutorId?: string;
  tutorName?: string;
  tutorEmail?: string;
}

export interface MeetingLinkValidationResult {
  valid: boolean;
  normalizedUrl: string;
  platform: string;
  error?: string;
}

export function validateMeetingLinkUrl(rawUrl: string): MeetingLinkValidationResult {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    return { valid: true, normalizedUrl: "", platform: "Online Class" };
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      valid: false,
      normalizedUrl: "",
      platform: "Online Class",
      error: "Please enter a valid HTTPS meeting link (Microsoft Teams, Google Meet, Zoom, etc.).",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      normalizedUrl: "",
      platform: "Online Class",
      error: "Meeting links must use HTTPS for learner security.",
    };
  }

  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return {
      valid: false,
      normalizedUrl: "",
      platform: "Online Class",
      error: "Please enter a valid meeting domain.",
    };
  }

  const host = parsed.hostname.toLowerCase();
  let platform = "Online Class";
  if (host.includes("teams.microsoft.com") || host.includes("teams.live.com")) {
    platform = "Microsoft Teams";
  } else if (host.includes("meet.google.com")) {
    platform = "Google Meet";
  } else if (host.includes("zoom.us") || host.includes("zoom.com")) {
    platform = "Zoom";
  } else if (host.includes("webex.com")) {
    platform = "Webex";
  } else if (host.includes("jitsi") || host.includes("meet.jit.si")) {
    platform = "Jitsi Meet";
  } else if (host.includes("whereby.com")) {
    platform = "Whereby";
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    platform,
  };
}

/**
 * Resolves the exact link and link source for a single scheduled occurrence.
 * Always returns the occurrence-specific link (or inherited default for that occurrence),
 * never blindly using another week's link.
 */
export function resolveOccurrenceMeetingLink(occurrence: Partial<ScheduleOccurrenceLinkView>): {
  effectiveLink: string;
  linkSource: MeetingLinkSource;
  defaultMeetingLink: string;
  isOverridden: boolean;
} {
  const defaultLink = String(occurrence.defaultMeetingLink || "").trim();
  const explicitLink = String(occurrence.meetingLink || "").trim();
  const declaredSource = String(occurrence.linkSource || "").trim().toUpperCase();

  if (declaredSource === "CUSTOM") {
    return {
      effectiveLink: explicitLink,
      linkSource: "CUSTOM",
      defaultMeetingLink: defaultLink,
      isOverridden: Boolean(explicitLink && explicitLink !== defaultLink),
    };
  }

  if (explicitLink && defaultLink && explicitLink !== defaultLink) {
    return {
      effectiveLink: explicitLink,
      linkSource: "CUSTOM",
      defaultMeetingLink: defaultLink,
      isOverridden: true,
    };
  }

  return {
    effectiveLink: explicitLink || defaultLink,
    linkSource: "INHERITED",
    defaultMeetingLink: defaultLink || explicitLink,
    isOverridden: false,
  };
}

const HISTORICAL_STATUSES = new Set(["COMPLETED", "ATTENDED", "ABSENT", "CANCELLED"]);

export function isHistoricalOccurrence(occurrence: Partial<ScheduleOccurrenceLinkView>, nowLagosDateKey: string): boolean {
  const status = String(occurrence.status || "SCHEDULED").trim().toUpperCase();
  if (HISTORICAL_STATUSES.has(status)) return true;
  const occDate = String(occurrence.date || "").trim().slice(0, 10);
  if (!occDate) return false;
  return occDate < nowLagosDateKey;
}

export interface PlannedOccurrencePatch {
  id: string;
  meetingLink: string;
  defaultMeetingLink?: string;
  linkSource: MeetingLinkSource;
  platform: string;
}

/**
 * Pure planner that computes exact per-occurrence Firestore patches for meeting links
 * while strictly guaranteeing historical sessions are never overwritten.
 */
export function planOccurrenceLinkUpdates(params: {
  occurrences: ScheduleOccurrenceLinkView[];
  targetOccurrenceId?: string;
  selectedOccurrenceIds?: string[];
  scope: MeetingLinkUpdateScope;
  newLink: string;
  nowLagosDateKey: string;
}): {
  patches: PlannedOccurrencePatch[];
  skippedHistoricalCount: number;
  skippedCustomOverrideCount: number;
  platform: string;
  normalizedUrl: string;
} {
  const validation = validateMeetingLinkUrl(params.newLink);
  if (params.scope !== "RESET_TO_DEFAULT" && params.newLink.trim() && !validation.valid) {
    throw new Error(validation.error || "Invalid meeting link URL.");
  }

  const normalizedUrl = validation.normalizedUrl;
  const platform = validation.platform;
  const patches: PlannedOccurrencePatch[] = [];
  let skippedHistoricalCount = 0;
  let skippedCustomOverrideCount = 0;

  if (params.scope === "SINGLE") {
    const target = params.occurrences.find((o) => o.id === params.targetOccurrenceId);
    if (!target) return { patches, skippedHistoricalCount, skippedCustomOverrideCount, platform, normalizedUrl };
    if (isHistoricalOccurrence(target, params.nowLagosDateKey)) {
      skippedHistoricalCount += 1;
      return { patches, skippedHistoricalCount, skippedCustomOverrideCount, platform, normalizedUrl };
    }
    const existingDefault = String(target.defaultMeetingLink || target.meetingLink || "").trim();
    const isSameAsDefault = Boolean(existingDefault && normalizedUrl === existingDefault);
    patches.push({
      id: target.id,
      meetingLink: normalizedUrl,
      ...(target.defaultMeetingLink !== undefined ? { defaultMeetingLink: existingDefault } : {}),
      linkSource: isSameAsDefault ? "INHERITED" : "CUSTOM",
      platform,
    });
    return { patches, skippedHistoricalCount, skippedCustomOverrideCount, platform, normalizedUrl };
  }

  if (params.scope === "RESET_TO_DEFAULT") {
    const target = params.occurrences.find((o) => o.id === params.targetOccurrenceId);
    if (!target) return { patches, skippedHistoricalCount, skippedCustomOverrideCount, platform, normalizedUrl };
    if (isHistoricalOccurrence(target, params.nowLagosDateKey)) {
      skippedHistoricalCount += 1;
      return { patches, skippedHistoricalCount, skippedCustomOverrideCount, platform, normalizedUrl };
    }
    const defaultLink = String(target.defaultMeetingLink || "").trim();
    const defVal = validateMeetingLinkUrl(defaultLink);
    patches.push({
      id: target.id,
      meetingLink: defVal.normalizedUrl,
      defaultMeetingLink: defVal.normalizedUrl,
      linkSource: "INHERITED",
      platform: defVal.platform,
    });
    return { patches, skippedHistoricalCount, skippedCustomOverrideCount, platform: defVal.platform, normalizedUrl: defVal.normalizedUrl };
  }

  if (params.scope === "SELECTED_FUTURE") {
    const selectedSet = new Set(params.selectedOccurrenceIds || []);
    if (params.targetOccurrenceId) selectedSet.add(params.targetOccurrenceId);

    for (const occ of params.occurrences) {
      if (!selectedSet.has(occ.id)) continue;
      if (isHistoricalOccurrence(occ, params.nowLagosDateKey)) {
        skippedHistoricalCount += 1;
        continue;
      }
      const existingDefault = String(occ.defaultMeetingLink || "").trim();
      patches.push({
        id: occ.id,
        meetingLink: normalizedUrl,
        ...(existingDefault ? { defaultMeetingLink: existingDefault } : {}),
        linkSource: existingDefault && normalizedUrl === existingDefault ? "INHERITED" : "CUSTOM",
        platform,
      });
    }
    return { patches, skippedHistoricalCount, skippedCustomOverrideCount, platform, normalizedUrl };
  }

  // ALL_FUTURE_INHERITED or ALL_FUTURE
  const preserveCustom = params.scope === "ALL_FUTURE_INHERITED";
  for (const occ of params.occurrences) {
    if (isHistoricalOccurrence(occ, params.nowLagosDateKey)) {
      skippedHistoricalCount += 1;
      continue;
    }
    const resolved = resolveOccurrenceMeetingLink(occ);
    if (preserveCustom && resolved.linkSource === "CUSTOM" && resolved.isOverridden) {
      // Update the stored defaultMeetingLink for future reference, but preserve the tutor's custom link for this week
      skippedCustomOverrideCount += 1;
      patches.push({
        id: occ.id,
        meetingLink: resolved.effectiveLink,
        defaultMeetingLink: normalizedUrl,
        linkSource: "CUSTOM",
        platform: String(occ.platform || platform),
      });
      continue;
    }
    patches.push({
      id: occ.id,
      meetingLink: normalizedUrl,
      defaultMeetingLink: normalizedUrl,
      linkSource: "INHERITED",
      platform,
    });
  }

  return { patches, skippedHistoricalCount, skippedCustomOverrideCount, platform, normalizedUrl };
}
