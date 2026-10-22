export declare function normalizeStudentUsername(value: unknown): string;
export declare function hashStudentAccessCode(value: unknown): string;
export declare function matchesStudentCredentials(
  profiles: readonly (Record<string, unknown> | null | undefined)[],
  suppliedCode: string,
  identifier?: string
): boolean;
