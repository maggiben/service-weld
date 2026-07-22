# 013 — Public Landing Page (`apps/www`)

> Marketing / corporate landing page for **Service Weld S.R.L.** — an established industrial gas supplier (cylinder rental, refill, exchange, welding supplies).
> **Hosted separately** from the authenticated back-office (`006` / `apps/web`).
> **Convention:** `MUST` = mandatory, `SHOULD` = strong default, `MAY` = optional.

## Purpose

Deliver a premium, corporate public landing page that communicates professionalism, reliability, industrial experience, trust, and long-term stability. The page is the company’s public face for prospects and employees (login CTA), not a SaaS-style product marketing site.

The design language MUST age well (think Siemens, Air Liquide, Praxair, Linde, Lincoln Electric) — not a trendy startup landing.

## Domains & apps

| Surface             | App                      | Domain (production)           | Local   |
| ------------------- | ------------------------ | ----------------------------- | ------- |
| Marketing / landing | `@weld/www` (`apps/www`) | `https://serviceweld.com`     | `:3003` |
| Back-office + login | `@weld/web` (`apps/web`) | `https://app.serviceweld.com` | `:3001` |
| Field PWA           | `@weld/field`            | (ops choice)                  | `:3002` |
| API                 | `@weld/api`              | (ops choice)                  | `:3000` |

- Landing Login CTAs MUST point at **`NEXT_PUBLIC_APP_URL` + `/login`** (absolute cross-origin URL), not a same-origin `/login`.
- The marketing app MUST remain **decoupled** from `@weld/web`, `@weld/api-client`, and `@weld/domain` so a designer can change copy/layout/imagery without the back-office.

Cloudflare (or another reverse proxy) terminates TLS and routes apex → www, `app.` → web.

## Requirements

### Content & structure

- R1. Implement a complete public landing page with these sections, in order:
  1. **Hero** — company logo, professional headline, short description, primary CTA (**Login** → app `/login`), secondary CTA (**Contact Us** → contact section). Login is for employees now; later also customers once ordering ships.
  2. **About the company** — industrial gases, cylinder rental, exchange, refills, welding supplies. Copy MUST sound like an established industrial firm (no marketing fluff).
  3. **Products & Services** — professional cards for: Cylinder Refills, Cylinder Exchange, Cylinder Rental, Industrial Gases, Welding Accessories, Safety Equipment.
  4. **Why choose us** — real strengths only: years of experience, large customer base, reliable supply, fast service, industrial expertise, personalized attention. **MUST NOT invent numbers or fake statistics.**
  5. **Customer testimonials** — only from verifiable public sources; summarize honestly; cite original source in code comments. If none found, ship a clearly marked placeholder section.
  6. **Contact** — address, phone numbers, email, business hours. **MUST verify** before publishing.
  7. **Interactive map** — embedded map (Google Maps or equivalent) with address and a directions control.
  8. **Footer** — only verified official links (Facebook, Instagram, LinkedIn, WhatsApp, Google Business, website). Omit any URL that cannot be verified.
- R2. Products context for copy and SEO: Oxygen, Argon, CO₂, Nitrogen, Acetylene, mixed shielding gases, welding accessories, regulators, hoses, safety equipment.
- R3. Use official company photos under `apps/www/public/landing/` wherever appropriate. If more imagery is needed, use explicit placeholders — never invent fake photos or stock that pretends to be company-owned.
- R4. Primary colors MUST come from Service Weld branding / theme tokens in `@weld/www`.

### Design philosophy

- R5. Avoid AI-looking / gimmicky patterns: parallax, exaggerated animations, infinite-scroll effects, pervasive glassmorphism, floating blobs, oversized gradients, flashy transitions, unnecessary illustrations, oversized cards, fake stats, marketing buzzwords.
- R6. Prefer: generous whitespace, strong typography, subtle shadows, restrained color, excellent alignment, responsive layout, accessibility, fast loading.

### Technical

- R7. Implement in **`apps/www`** (Next.js App Router), **not** inside `apps/web`. Keep dependencies minimal (Next, React, MUI, i18next). No API client / domain packages.
- R8. Support light and dark themes.
- R9. Fully responsive; semantic HTML; WCAG AA.
- R10. Performance: optimize and lazy-load below-the-fold images; target Lighthouse **> 90** on Performance, Accessibility, Best Practices, and SEO; optimize for Core Web Vitals.
- R11. SEO MUST include: document title, meta description, Open Graph, Twitter cards, and JSON-LD including **LocalBusiness** structured data. Canonical / OG URL use `NEXT_PUBLIC_SITE_URL`.
- R12. i18n: user-facing strings via react-i18next (`es` default / `en`) in the `landing` namespace — no hard-coded copy in components.
- R13. Login CTA MUST navigate to `{NEXT_PUBLIC_APP_URL}/login` (production: `https://app.serviceweld.com/login`).

### Implementation process (recommended)

- R14. Prefer **four staged passes** when redesigning (structure → design → content → SEO/perf).

## Constraints

- C1. This is **not** a startup pitch page. Tone and visuals MUST read as a real industrial supplier.
- C2. **Never fabricate** testimonials, review names, statistics, or social/profile URLs.
- C3. Contact and social data MUST be verified against official sources before inclusion; unverified items are omitted or left as explicit TODOs.
- C4. Do not couple `@weld/www` to back-office packages; do not introduce unrelated UI libraries without a decision.
- C5. Quality gates apply: `@weld/www` is in the ≥80% coverage list (`scripts/check-coverage.mjs`).
- C6. Map embeds MUST not block first paint; load map iframe lazily (below the fold).

## Acceptance Criteria

- AC1. Visiting `serviceweld.com` (or local `:3003`) shows all eight sections (testimonials MAY be a labeled placeholder).
- AC2. Hero shows logo, headline, short description; **Login** goes to the **app** login URL; **Contact Us** reaches the contact section.
- AC3. Products & Services renders the six required service cards with professional, non-gimmicky styling.
- AC4. Why choose us contains no invented numbers or fake KPIs.
- AC5. Every contact field and footer social link is verified, or is an explicit placeholder/TODO.
- AC6. Map shows the company location with address and a directions affordance.
- AC7. Page includes title, description, OG, Twitter metadata, and LocalBusiness JSON-LD.
- AC8. Light/dark themes work; layout usable from xs through xl.
- AC9. Below-the-fold images are lazy-loaded; landing images are appropriately sized/encoded.
- AC10. Lighthouse scores **> 90** on Performance, Accessibility, Best Practices, and SEO — or deviations documented.
- AC11. No hard-coded user-facing strings; `es` / `en` keys cover landing copy.
- AC12. `@weld/www` builds and deploys independently of `@weld/web`.

## Edge Cases

- E1. No reliable public reviews → testimonials placeholder (never fabricated quotes).
- E2. Unverified social profile → omit from footer.
- E3. Map blocked / slow → contact block still usable.
- E4. Designer-only checkout of `apps/www` MUST be enough to run `pnpm --filter @weld/www dev` after root `pnpm install`.
- E5. Missing `/landing` assets → labeled placeholders; never fake “company” stock.

## Dependencies

- Internal: Next.js App Router + MUI (same stack family as `006`), brand assets under `apps/www/public/`.
- External: verified contact details; map embed; Cloudflare DNS/TLS for apex + `app.` subdomain; `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`.

## Implementation Notes

### Layout

```
apps/www/
  app/page.tsx                 # metadata + JSON-LD + LandingPage
  src/views/landing/           # sections
  src/locales/{es,en}/landing.json
  public/landing/              # optimized photos
  Dockerfile                   # independent image
```

### Env

- `NEXT_PUBLIC_SITE_URL=https://serviceweld.com`
- `NEXT_PUBLIC_APP_URL=https://app.serviceweld.com`

### Out of scope

- Customer self-service ordering UI (D-1 CLIENT is Phase 2).
- CMS — locale files / static content are enough unless a later decision says otherwise.
