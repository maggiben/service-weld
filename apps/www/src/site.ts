/**
 * Cross-origin URLs for the split between marketing site and back-office.
 * - serviceweld.com      → this app (@weld/www)
 * - app.serviceweld.com  → @weld/web (login + back-office)
 */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3003"
  );
}

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3001"
  );
}

export function appLoginUrl(): string {
  return `${appUrl()}/login`;
}
