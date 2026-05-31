import "server-only";

interface HeaderGetter {
  get(name: string): string | null;
}

/**
 * Extracts the client IP from standard proxy headers.
 * On Vercel, x-forwarded-for is set by the platform and cannot be spoofed.
 * In other environments, this value may be user-controlled — use with awareness.
 */
export function extractClientIp(headerStore: HeaderGetter): string {
  const xff = headerStore.get("x-forwarded-for");
  return xff ? xff.split(",")[0].trim() : (headerStore.get("x-real-ip") ?? "unknown");
}
