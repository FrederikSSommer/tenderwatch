# TenderWatch — Product Specification v0.2
**PWA · SaaS · EU Public Procurement Intelligence**

---

## 1. Product Overview

**TenderWatch** is a progressive web app that makes EU public procurement intelligence fast, structured, and actionable. It connects to the TED (Tenders Electronic Daily) API, surfaces relevant opportunities through AI-powered monitoring profiles, summarises tender documents with AI, and provides a bid pipeline CRM to manage active pursuits — all in a polished, team-ready workspace.

### Problem it solves
TED is comprehensive but painful to use: raw search UX, no persistent filters, no alerts, no pipeline management, and dense documents with no summarisation. TenderWatch wraps TED data in a product that BD and procurement professionals actually want to use daily.

### Target users
- BD managers and procurement teams at companies bidding on EU public contracts
- Maritime, defence, infrastructure, engineering, and consultancy sectors
- Individual freelance procurement consultants
- Any organisation above the EU threshold (~€140k)

---

## 2. Tech Stack

| Layer | Choice | Status |
|---|---|---|
| Framework | **Next.js** (App Router) | BUILT |
| Database & Auth | **Supabase** (Postgres, RLS, auth) | BUILT |
| Styling | **Tailwind CSS** | BUILT |
| AI | **Anthropic Claude API** (claude-sonnet-4-20250514) | BUILT |
| Email | **Resend** | BUILT (notifications) |
| Background Jobs | **Vercel Cron** + Next.js API routes | BUILT |
| Payments | **Stripe** | BUILT (webhooks, pricing page) |
| Deployment | **Vercel** | BUILT |
| Push Notifications | Web Push (VAPID) | NOT STARTED |

---

## 3. Information Architecture

```
/                           → Landing page (marketing)              BUILT
/login                      → Auth (email + OAuth)                  BUILT
/signup                     → Signup                                BUILT
/demo/*                     → Full demo mode (no auth)              BUILT

(dashboard) routes — auth required:
/dashboard                  → Home summary                          BUILT
/feed                       → Tender feed (matched tenders)         BUILT
/profiles                   → Monitoring profiles management        BUILT
/profiles/new               → AI-powered profile wizard             BUILT
/tender/[id]                → Tender detail + AI summary            BUILT
/buyers                     → Followed contracting authorities      BUILT
/bookmarks                  → Followed tenders                      BUILT
/calendar                   → Deadline calendar                     BUILT
/settings                   → User preferences                      BUILT
/onboarding                 → New user onboarding                   BUILT

NOT YET BUILT:
/discover                   → TED search & browse                   NOT STARTED
/pipeline                   → Bid pipeline (kanban + list)          NOT STARTED
/pipeline/[id]              → Single bid workspace                  NOT STARTED
/workspace                  → Team settings, members, roles         NOT STARTED
```

---

## 4. Feature Specification — Status Tracker

### 4.1 Dashboard — BUILT
- New matches today count
- Pipeline summary (placeholder)
- Upcoming deadlines from followed tenders
- Recent activity

### 4.2 Tender Discovery — PARTIAL
**Built:**
- Tender feed with relevance-ranked results from monitoring profiles
- Filter by profile
- AI relevance score badge on each card
- AI one-liner reason on each card explaining why it matches

**Not built:**
- Full-text TED search & browse (independent of profiles)
- Advanced filter panel (CPV, country, buyer, notice type, value range, date, procedure)
- Sort by relevance/date/deadline/value
- "Save to pipeline" quick action from results

### 4.3 Tender Detail Page — BUILT
- Header with title, buyer, CPV codes, dates, value
- AI Summary (on-demand via Claude API)
- Follow button
- TED link to original notice

**Not built:**
- AI relevance assessment paragraph (per-profile explanation)
- Full rendered TED notice HTML
- Document links/attachments
- Team comments thread
- Export to PDF
- Add to pipeline action

### 4.4 Monitoring Profiles (replaces "Search Agents") — BUILT
- AI-powered wizard for profile creation (company description, sectors, buyers, countries)
- Auto-generates CPV codes, keywords, exclude keywords
- Example tender preview with like/dislike feedback
- Edit and delete profiles
- Active/paused toggle

**Architecture (BUILT):**
- Two-stage matching pipeline:
  - Stage 1: Cheap CPV/keyword pre-filter (threshold 5)
  - Stage 2: Claude AI re-rank with strict literal-match prompt
- Broad TED ingestion (all EU, no per-user filtering)
- CPV code normalization (8-digit, prefix matching)
- Topic-gated bonuses (country/value only count with topic signal)
- Match caching with ai_reason backfill
- Learned signals from followed tenders (CPV + keyword patterns)

**Not built:**
- Alert frequency setting (instant/daily/weekly)
- Agent-style per-profile notification controls

### 4.5 Email Alerts — PARTIAL
**Built:**
- Daily cron: ingest-ted → match-and-notify pipeline
- Notification system (notified flag, notified_at timestamp)

**Not built:**
- Resend email templates with tender cards
- Configurable frequency (instant/daily/weekly digest)
- One-click unsubscribe per profile

### 4.6 Mobile Push Notifications — NOT STARTED
- PWA Web Push via VAPID
- Push subscription storage
- Instant alerts for followed profiles

### 4.7 Bid Pipeline — NOT STARTED
- Kanban view (Qualifying → Go/No-Go → Bidding → Submitted → Won/Lost)
- List view with sortable table
- Bid detail workspace (linked tender, notes, files, activity log)
- Go/No-Go decision log

### 4.8 Followed Buyers — BUILT
- Search and follow contracting authorities
- Buyer list page
- TED search terms per buyer

**Not built:**
- Buyer profile page (recent notices, award history)
- Alert on new notices from followed buyer
- Dashboard widget for buyer activity

### 4.9 Team Collaboration — NOT STARTED
- Workspace model with roles (Admin, Member, Viewer)
- Shared agents, pipeline, followed buyers
- Invite by email
- Row-level security per workspace

### 4.10 Backfill & Ingestion — BUILT
- Manual backfill (1–90 days, triggered from UI)
- Daily cron ingestion (EU-wide, no filters)
- Shared `tenders` table with upsert on conflict
- Paginated Supabase queries (handles 3000+ tenders)
- Diagnostic logging (score distribution, cache stats, Stage 1/2 metrics)

### 4.11 Onboarding Wizard — BUILT
- Multi-step wizard: basics → sectors → buyers → tenders → review → done
- AI-generated CPV codes and keywords from company description
- TED API preview with Claude re-rank (shared scoring pipeline)
- Ingests preview tenders into shared pool
- BackfillButton to populate feed after profile creation

---

## 5. Freemium Tier Structure

| Feature | Free | Pro (€49/mo) | Enterprise |
|---|---|---|---|
| Monitoring profiles | 2 | Unlimited | Unlimited |
| Alert frequency | Daily only | Instant | Instant |
| AI summaries | — | Yes | Yes |
| AI relevance scoring | — | Yes | Yes |
| Active pipeline bids | 3 | Unlimited | Unlimited |
| Discovery results/day | 20 | Unlimited | Unlimited |
| Team members | 1 | 5 | Unlimited |
| Push notifications | Daily | Instant | Instant |
| Data history | 7 days | 90 days | Unlimited |

**Status:** Stripe integration built (webhooks, pricing page). Freemium gates not yet enforced in app.

---

## 6. Data Model (Supabase) — Current

```sql
-- BUILT
monitoring_profiles    (id, user_id, name, cpv_codes[], keywords[], exclude_keywords[],
                        countries[], min_value_eur, max_value_eur, active, created_at)
tenders               (id, source, external_id, title, description, buyer_name,
                        buyer_country, cpv_codes[], procedure_type, tender_type,
                        estimated_value_eur, currency, submission_deadline,
                        publication_date, document_url, ted_url, language,
                        ai_summary, ai_summary_generated_at, raw_data, created_at)
matches               (id, tender_id, profile_id, user_id, relevance_score,
                        matched_cpv[], matched_keywords[], ai_reason,
                        notified, notified_at, seen, bookmarked, created_at)
followed_buyers       (id, user_id, buyer_name, buyer_country, ted_search_term, created_at)

-- NOT YET BUILT
workspaces            (id, name, plan, stripe_customer_id)
pipeline_bids         (id, workspace_id, tender_id, stage, owner_id, value_estimate, ...)
bid_comments          (id, bid_id, user_id, body, created_at)
bid_files             (id, bid_id, user_id, storage_path, filename)
push_subscriptions    (id, user_id, endpoint, keys_json)
```

---

## 7. Design Direction

**Current state:** Light theme with clean card-based layout. Functional but not yet matching the spec's "dark-first intelligence tool" aesthetic.

**Spec target:**
- Background: deep navy `#0A0F1E`
- Surface: `#111827`
- Accent: electric blue `#2563EB`
- Typography: Syne (headings) + IBM Plex Sans (body)
- High information density, Bloomberg Terminal meets Linear

---

## 8. Build Phases — Updated

### Phase 1 — Foundation: COMPLETE
- Next.js setup, Supabase schema, auth
- TED API integration (search + notice fetch)
- Tender feed and detail pages
- Demo mode

### Phase 2 — Core Value: MOSTLY COMPLETE
- Monitoring profiles with AI wizard (replaces search agents)
- Two-stage matching pipeline (CPV/keyword + Claude re-rank)
- AI tender summaries (Claude API)
- AI one-liner reasons on feed cards
- Dashboard v1
- Daily cron: ingest → match → notify
- Manual backfill

### Phase 3 — Pipeline + Team: NOT STARTED
- Bid pipeline (kanban + list)
- Bid detail workspace
- Team invitations + workspace RLS
- Followed buyers (profile page, alerts)

### Phase 4 — Polish + Monetisation: PARTIAL
- Stripe integration: BUILT
- Pricing page: BUILT
- Freemium gates: NOT ENFORCED
- Push notifications: NOT STARTED
- Dark theme: NOT STARTED
- Landing page: BUILT
- Mobile refinement: NOT STARTED

---

## 9. Recommended Next Steps (Priority Order)

### High Impact — Revenue Enablers
1. **Enforce freemium gates** — limit profiles, AI summaries, and history by plan tier
2. **Email alerts via Resend** — daily digest with tender cards and deeplinks (key retention driver)
3. **Tender Discovery page** — full-text TED search independent of profiles (core value prop)

### Medium Impact — Product Completeness
4. **Bid Pipeline** — kanban + list view, basic bid workspace (Phase 3 core)
5. **Buyer profiles** — show recent notices and award history for followed buyers
6. **Alert frequency controls** — instant/daily/weekly per profile

### Lower Priority — Polish
7. **Dark theme** — match spec design direction
8. **Push notifications** — PWA Web Push
9. **Team/workspace features** — multi-user collaboration
10. **Mobile UX refinement** — responsive optimizations

---

## 10. Open Questions

1. ~~Brand name~~ → **TenderWatch** (resolved)
2. ~~AI relevance scoring~~ → **Per-profile** with learned signals from followed tenders (resolved)
3. **TED API rate limits** — currently doing broad EU-wide ingestion. At scale, may need caching strategy or enterprise TED access.
4. **eForms vs legacy XML** — current parser handles TED v3 API format. Legacy XML not in scope.
5. **GDPR / data residency** — Supabase region TBD. Confirm for enterprise customers.
6. **Languages** — UI is English-only. TED notices rendered in original language with English preferred.
