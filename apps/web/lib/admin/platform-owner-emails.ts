// NOTE: workshop_users.role = 'owner' means owner of a specific client workshop.
// It is NOT equivalent to platform owner (Filò admin).
// Platform ownership is determined solely by Cricchetto_PLATFORM_OWNER_EMAILS.

export function getPlatformOwnerEmails(): Set<string> {
  const raw = process.env.Cricchetto_PLATFORM_OWNER_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformOwnerEmail(email: string): boolean {
  return getPlatformOwnerEmails().has(email.toLowerCase());
}
