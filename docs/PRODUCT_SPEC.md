# TenderRadar — Product Specification v0.1
**PWA · SaaS · EU Public Procurement Intelligence**

---

## 1. Product Overview

**TenderRadar** is a progressive web app that makes EU public procurement intelligence fast, structured, and actionable. It connects to the TED (Tenders Electronic Daily) API, surfaces relevant opportunities through saved search agents, summarises tender documents with AI, and provides a bid pipeline CRM to manage active pursuits — all in a polished, team-ready workspace.

### Problem it solves
TED is comprehensive but painful to use: raw search UX, no persistent filters, no alerts, no pipeline management, and dense documents with no summarisation. TenderRadar wraps TED data in a product that BD and procurement professionals actually want to use daily.

### Target users
- BD managers and procurement teams at companies bidding on EU public contracts
- Maritime, defence, infrastructure, engineering, and consultancy sectors
- Individual freelance procurement consultants
- Any organisation above the EU threshold (~€140k)

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 14** (App Router) | SSR + API routes in one repo, excellent PWA support, fast DX |
| Database & Auth | **Supabase** | Postgres, row-level security, auth, realtime, storage — all in one |
| Styling | **Tailwind CSS + shadcn/ui** | Fastest path to polished, consistent UI |
| AI | **Anthropic Claude API** (claude-sonnet-4) | Tender summarisation and relevance scoring |
| Email | **Resend** | Simple transactional email API with React Email templates |
| Push Notifications | **Web Push (VAPID)** via Next.js API route | Native PWA push, no native app needed |
| Background Jobs | **Supabase Edge Functions + pg_cron** | Poll TED API on schedule, trigger alerts |
| Payments | **Stripe** | Freemium subscription management |
| Deployment | **Vercel** | Zero-config Next.js deployment, Edge Functions |

---

## 3. Information Architecture

```
/                        → Landing page (marketing)
/login                   → Auth (email magic link + Google OAuth)
/app/dashboard           → Home — summary of agents, pipeline, activity
/app/discover            → TED tender search & browse
/app/agents              → Saved search agents management
/app/tenders/[id]        → Single tender detail + AI summary
/app/pipeline            → Bid pipeline (kanban + list view)
/app/pipeline/[id]       → Single bid workspace
/app/buyers              → Followed contracting authorities
/app/workspace           → Team settings, members, roles
/app/settings            → User preferences, notifications, billing
/app/settings/billing    → Stripe subscription management
```

---

## 4. Feature Specification

### 4.1 Dashboard

**Purpose:** Single-screen situational awareness for the user's procurement landscape.

**Widgets:**
- **New matches today** — count of new tenders matched by all agents since last login, with quick-view list
- **Pipeline summary** — count of bids by stage (Qualifying → Bidding → Submitted → Won/Lost), total estimated value
- **Active agents** — list of search agents with last match count and last run time
- **Followed buyers** — list of contracting authorities with recent activity indicator
- **Upcoming deadlines** — next 5 submission deadlines from active pipeline bids
- **Recent activity feed** — team activity log (new matches, status changes, comments)

**Freemium gate:** Free tier shows last 7 days only. Pro shows 90 days.

---

### 4.2 Tender Discovery

**Purpose:** Search and browse TED procurement notices with a dramatically better UX than TED itself.

**Search interface:**
- Full-text keyword search
- Filter panel:
  - CPV code (Common Procurement Vocabulary) — searchable dropdown with category labels
  - Country / region
  - Contracting authority (buyer)
  - Notice type (Contract Notice, Prior Information Notice, Contract Award)
  - Contract value range (min/max)
  - Publication date range
  - Submission deadline range
  - Procedure type (Open, Restricted, Negotiated)
- Sort by: relevance, publication date, deadline, contract value

**Results list:**
- Tender title, buyer name, country flag, CPV badge, publication date, deadline
- Contract value (if published)
- AI relevance score badge (Pro tier) — 1–10 based on saved agent criteria
- "Save to pipeline" quick action
- "Follow buyer" quick action

**Freemium gate:** Free tier: 20 results/day, no relevance scoring. Pro: unlimited.

---

### 4.3 Tender Detail Page

**Purpose:** Full tender information plus AI-generated intelligence layer.

**Sections:**
- **Header:** Title, buyer, reference number, CPV codes, publication/deadline dates, contract value, procedure type
- **AI Summary** (Pro): 3–5 bullet point summary of key requirements, eligibility criteria, and evaluation factors — generated on demand via Claude API from the tender XML
- **AI Relevance Assessment** (Pro): Short paragraph explaining why this tender is/isn't a fit relative to the user's saved agent criteria
- **Full notice:** Rendered HTML of the original TED notice (all official languages supported)
- **Documents:** Links to attached procurement documents
- **Actions:**
  - Add to pipeline (with stage selector)
  - Follow buyer
  - Share with team member
  - Export to PDF
- **Team activity:** Comments thread visible to workspace members

---

### 4.4 Search Agents

**Purpose:** Persistent, automated saved searches that run on a schedule and alert the user to new matches.

**Agent configuration:**
- Name (e.g. "Naval vessels Denmark")
- Keywords (include / exclude)
- CPV codes (one or many)
- Countries
- Contracting authorities (optional)
- Contract value range
- Notice types
- Alert frequency: instant, daily digest, weekly digest

**Agent list view:**
- Name, last run, matches (today / all time), active/paused toggle
- Quick-edit and delete

**Freemium gate:** Free: 2 agents, daily digest only. Pro: unlimited agents, instant alerts.

---

### 4.5 Email Alerts

**Purpose:** Notify users of new tender matches without requiring them to open the app.

**Implementation:**
- Supabase Edge Function polls TED search API every hour using each active agent's parameters
- New matches stored in `tender_matches` table
- Supabase pg_cron triggers alert job based on agent frequency setting
- Resend sends React Email template:
  - Subject: "3 new tenders match [Agent Name]"
  - Body: summary cards for each match (title, buyer, deadline, value, AI summary snippet)
  - CTA: "View in TenderRadar" deeplink

**Unsubscribe:** One-click unsubscribe per agent, managed in settings.

---

### 4.6 Mobile Push Notifications

**Purpose:** Real-time alerts on mobile and desktop without email friction.

**Implementation:**
- PWA Web Push via VAPID keys, handled by Next.js API route `/api/push/send`
- User subscribes to push on first login (permission prompt)
- Subscription stored in Supabase `push_subscriptions` table
- Same alert job that sends email also triggers push for instant-frequency agents
- Push payload: tender title, buyer, deadline — tap opens tender detail

**Freemium gate:** Free: push for daily digest only. Pro: instant push.

---

### 4.7 Bid Pipeline

**Purpose:** CRM-style workspace to manage tenders from qualification through to outcome.

**Stages (customisable):**
1. Qualifying
2. Go / No-Go
3. Bidding
4. Submitted
5. Won / Lost

**Kanban view:** Drag-and-drop cards between stages. Card shows title, buyer, deadline, assigned team member, estimated value.

**List view:** Sortable table with all fields visible. Bulk actions (move stage, assign, export).

**Bid record (detail):**
- Linked TED tender
- Internal reference / title
- Stage + status
- Assigned owner + collaborators
- Estimated contract value (internal estimate, may differ from published value)
- Submission deadline with countdown
- Go/No-Go decision log (with rationale)
- Notes / comments thread (team-visible)
- File attachments (via Supabase Storage)
- Activity log (stage changes, comments, assignments)

**Freemium gate:** Free: 3 active bids. Pro: unlimited.

---

### 4.8 Followed Buyers

**Purpose:** Track specific contracting authorities regardless of search agents — useful for key target clients.

**Features:**
- Search and follow any buyer from TED's authority register
- Buyer profile page: name, country, recent notices, award history
- Alert when followed buyer publishes any new notice
- On dashboard: "Buyers with activity this week" widget

---

### 4.9 Team Collaboration (Workspace)

**Purpose:** Shared environment for BD teams to work together on discovery and pipeline.

**Workspace model:**
- Each account belongs to one workspace
- Workspace has members with roles: Admin, Member, Viewer
- Agents, pipeline, and followed buyers are workspace-scoped (shared by default)
- Personal agents can be flagged as private

**Invitation flow:**
- Admin invites by email
- Invited user creates account and joins workspace
- Supabase row-level security enforces workspace isolation

**Freemium gate:** Free: 1 user (solo). Pro: up to 5 seats. Enterprise: unlimited.

---

## 5. Freemium Tier Structure

| Feature | Free | Pro (€49/mo) | Enterprise |
|---|---|---|---|
| Search agents | 2 | Unlimited | Unlimited |
| Alert frequency | Daily only | Instant | Instant |
| AI summaries | — | ✓ | ✓ |
| AI relevance scoring | — | ✓ | ✓ |
| Active pipeline bids | 3 | Unlimited | Unlimited |
| Discovery results/day | 20 | Unlimited | Unlimited |
| Team members | 1 | 5 | Unlimited |
| Push notifications | Daily | Instant | Instant |
| Data history | 7 days | 90 days | Unlimited |

---

## 6. Data Model (Supabase)

```sql
-- Core entities
workspaces          (id, name, plan, stripe_customer_id, created_at)
users               (id, workspace_id, email, role, push_subscription)
agents              (id, workspace_id, created_by, name, filters_json, alert_frequency, active)
tenders             (id, ted_reference, title, buyer, country, cpv_codes, value, deadline, published_at, xml_url, summary_ai, fetched_at)
tender_matches      (id, agent_id, tender_id, score_ai, matched_at, alerted)
pipeline_bids       (id, workspace_id, tender_id, stage, owner_id, value_estimate, go_nogo, notes)
bid_comments        (id, bid_id, user_id, body, created_at)
bid_files           (id, bid_id, user_id, storage_path, filename)
followed_buyers     (id, workspace_id, ted_buyer_id, buyer_name)
push_subscriptions  (id, user_id, endpoint, keys_json)
```

---

## 7. PWA Configuration

**manifest.json:**
- `display: standalone`
- App icons (192px, 512px, maskable)
- Theme colour matching brand
- `start_url: /app/dashboard`

**Service Worker:**
- Offline shell for `/app/dashboard` and `/app/pipeline`
- Background sync for push notification delivery
- Cache strategy: network-first for API, cache-first for static assets

**Install prompt:** Custom "Add to Home Screen" banner shown after 2nd login session.

---

## 8. Design Direction

**Aesthetic:** Refined intelligence tool — dark-first, high information density, confident typography. Think Bloomberg Terminal meets Linear. Not a colourful consumer app.

**Palette:**
- Background: deep navy `#0A0F1E`
- Surface: `#111827`
- Accent: electric blue `#2563EB`
- Success/Won: `#10B981`
- Warning/Deadline: `#F59E0B`
- Danger/Lost: `#EF4444`
- Text primary: `#F9FAFB`
- Text secondary: `#6B7280`

**Typography:**
- Display / headings: **Syne** (geometric, distinctive)
- Body / data: **IBM Plex Sans** (legible, technical credibility)

**Key UX principles:**
- Zero unnecessary clicks to reach new matches
- Deadlines always prominent — urgency is the product
- AI features feel native, not bolted on
- Mobile experience first-class — field BD teams use phones

---

## 9. Build Phases

### Phase 1 — Foundation (Week 1–2)
- Next.js project setup, Supabase schema, auth (magic link + Google)
- PWA manifest + service worker baseline
- TED API integration (search + notice fetch)
- Basic discover page with filters
- Tender detail page (no AI yet)

### Phase 2 — Core Value (Week 3–4)
- Search agents (create, edit, run)
- Supabase Edge Function: hourly TED polling
- Email alerts via Resend
- AI tender summary (Claude API integration)
- Dashboard v1

### Phase 3 — Pipeline + Team (Week 5–6)
- Bid pipeline (kanban + list)
- Bid detail workspace
- Team invitations + workspace RLS
- Followed buyers

### Phase 4 — Polish + Monetisation (Week 7–8)
- Push notifications (VAPID)
- Stripe integration + freemium gates
- AI relevance scoring
- Mobile UX refinement
- Landing page

---

## 10. Open Questions to Resolve Before Build

1. **Brand name** — is TenderRadar a working title or final?
2. **AI relevance scoring** — should this be per-agent (scored against agent criteria) or per-user-profile (scored against a broader company profile)?
3. **TED API rate limits** — the free TED API has fair-use constraints. At scale, do we need to cache aggressively or negotiate enterprise access?
4. **eForms vs legacy XML** — TED switched to eForms in Nov 2022. The spec assumes both schemas must be handled. Confirm this is in scope for v1.
5. **GDPR / data residency** — Supabase EU region (Frankfurt) should be selected. Confirm no additional requirements for enterprise customers.
6. **Languages** — TED notices are in all EU official languages. Is v1 English-only UI with multilingual notice rendering, or full i18n?
