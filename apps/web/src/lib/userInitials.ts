/** First two letters of a username for avatar initials. */
export function userInitials(username: string | null | undefined): string {
  const cleaned = (username ?? "").trim();
  if (!cleaned) return "?";
  const letters = cleaned.replace(/[^a-zA-Z0-9]/g, "");
  const source = letters.length > 0 ? letters : cleaned;
  return source.slice(0, 2).toUpperCase();
}
