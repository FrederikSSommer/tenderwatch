# TenderWatch

EU public procurement intelligence SaaS. Monitors TED (Tenders Electronic Daily) for relevant tenders, matches them to user profiles using a two-stage AI pipeline, and delivers daily/weekly email digests.

## Stack

- **Framework**: Next.js 16.2 (App Router), React 19, TypeScript 5
- **Styling**: Tailwind CSS v4 — automatic dark mode via `prefers-color-scheme` overrides in `globals.css`
- **Database**: Supabase (Postgres + RLS + Auth)
- **AI**: Anthropic Claude Sonnet (`claude-sonnet-4-20250514`) via `@anthropic-ai/sdk`
- **Email**: Resend (`onboarding@resend.dev` for now)
- **Payments**: Stripe (wired but not enforced yet)
- **Deploy**: Vercel with cron jobs

## Architecture

```
src/
  app/
    (auth)/          Login, signup (OTP + Google OAuth)
    (dashboard)/     Protected routes: feed, profiles, dashboard, settings, etc.
    api/
      ai/            Claude endpoints (suggest-cpv, summarize, onboarding/*)
      cron/          Background jobs (ingest-ted, match-and-notify, cleanup)
      backfill/      Manual historical tender backfill
    demo/            Unauthenticated demo mode
    try/             Public onboarding wizard
  components/        UI components (TenderCard, ProfileEditor, OnboardingWizardV2, etc.)
  lib/
    ai/              relevance-score.ts (Stage 1 scorer)
    matching/        engine.ts (full pipeline: Stage 1 + Stage 2 Claude rerank)
    ted/             TED API client, parser, ingestion
    notifications/   email-digest.ts (HTML email via Resend)
    supabase/        client, server, middleware, types
```

## Key files

- `src/lib/matching/engine.ts` — Core matching pipeline. Stage 1 cheap CPV/keyword filter (threshold 5) → Stage 2 Claude rerank (strict literal-match prompt). Blending: 80% AI + 20% Stage 1. Feeds followed titles as positive examples and dismissed titles as negative examples to Claude.
- `src/lib/ai/relevance-score.ts` — Stage 1 scorer. CPV normalization (`padEnd(8, '0')`), skips broad CPVs ending in `000000`, topic-gated bonuses.
- `src/lib/ted/parser.ts` — Parses TED API v3 responses into normalized tender rows.
- `src/components/OnboardingWizardV2.tsx` — 7-phase AI-guided wizard: basics → sectors → buyers → tender swiping → generate → review → done.
- `src/components/TenderCard.tsx` — Feed card with follow, dismiss, AI reason display.
- `src/lib/notifications/email-digest.ts` — HTML email with responsive layout, score badges, AI one-liners.

## Database tables

- `tenders` — Ingested from TED. CPV codes, buyer, value, deadline, AI summary.
- `monitoring_profiles` — User profiles: CPV codes, keywords, exclude_keywords, countries, description, value range.
- `matches` — Tender×profile pairs: relevance_score, matched_cpv, matched_keywords, ai_reason, bookmarked, dismissed.
- `subscriptions` — Plan, status, email_frequency (daily/weekly/off).
- `companies` — User company name and country.
- `notifications` — Email/push log.

## Cron jobs (vercel.json)

- `6am` — `/api/cron/ingest-ted` — Fetch new tenders from TED API
- `7am` — `/api/cron/match-and-notify` — Run matching pipeline + send email digests
- `3am Sunday` — `/api/cron/cleanup` — Database maintenance

## Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

## Conventions

- Supabase service-role client for cron/backfill (bypasses RLS). Anon client for user-facing pages.
- Paginated Supabase queries (`.range()`) for large result sets — default limit is 1000 rows.
- Cache batching in groups of 500 for `.in()` queries to avoid PostgREST URL limits.
- Claude assistant-prefill technique: send `[` as assistant message to force JSON array output.
- CPV codes always 8-digit padded: `normCpv = (c) => c.replace(/-\d+$/, '').padEnd(8, '0')`
- "Follow" (not "Subscribe") for bookmarked tenders throughout UI.
- Dark mode is CSS-based in `globals.css` — no per-component `dark:` classes needed.

## Build & run

```bash
nvm use 20          # Requires Node >= 20.9
npm run dev         # Dev server
npm run build       # Production build
```

## Migrations

Run in Supabase SQL Editor. Files in `supabase/migrations/`:
1. `001_followed_buyers.sql` — (legacy, can be dropped)
2. `002_matches_ai_reason.sql`
3. `003_profile_description.sql`
4. `004_matches_dismissed.sql`
5. `005_email_frequency.sql`

@AGENTS.md
