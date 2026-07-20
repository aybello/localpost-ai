# LocalPost AI Architecture

**Author:** Manus AI  
**Status:** Implementation baseline

LocalPost AI is an authenticated, multi-tenant content workspace. Every persistent product record belongs to a user either directly or through a business owned by that user. Server procedures never accept ownership as authoritative input; they derive the current user from the authenticated request and add ownership predicates to every query and mutation.

## Domain vocabulary

| Entity | Purpose | Ownership boundary |
|---|---|---|
| User | Authenticated account provided by the platform identity layer | Root tenant |
| Business | A local business being managed in the workspace | Directly references one user |
| Brand profile | Editable, AI-assisted description of the business’s voice, visual identity, audience, services, themes, and differentiators | One-to-one with a business |
| Website analysis | Immutable-ish evidence snapshot from a website crawl and the corresponding structured AI result | Belongs to a business and its owner |
| Generation run | Tracks one monthly request, target post count, progress, completion, and failure details | Belongs to a business and its owner |
| Generated post | One calendar item containing caption, hashtags, call-to-action, topic, tone, image prompt, image reference, schedule, and lifecycle status | Belongs to a business, generation run, and owner |

## Core relationships

A user can own many businesses. A business has one current editable brand profile and many analysis snapshots, generation runs, and posts. A generation run produces between 12 and 16 posts for one calendar month. Posts retain explicit `userId` and `businessId` fields so ownership checks remain simple and auditable even when querying posts directly.

## AI workflow

The onboarding service validates and fetches a public website, extracts bounded readable evidence, and asks GPT‑5.5 for a strict JSON brand profile. The saved profile remains editable and is the source of truth for subsequent generation. Monthly generation asks GPT‑5.5 for a diverse 12–16 item content plan in one structured response. Each item includes a caption, hashtags, call-to-action, topic, tone, and photorealistic image direction. GPT Image 2 generates each requested visual on demand and stores it in the platform’s object storage; the database stores only the returned URL and key-like reference.

## Request and workload boundaries

Website analysis and monthly text generation run synchronously behind explicit user actions with bounded input sizes and clear progress states. Image generation is intentionally per-post or small-batch rather than attempting 12–16 expensive image requests inside one long server request. This keeps the default hosting request window predictable and lets users regenerate individual visuals without repeating text generation. Calendar scheduling in the initial scope is persisted workflow state; it does not publish automatically to Google Business Profile.

## Security invariants

| Invariant | Enforcement |
|---|---|
| Users cannot read or mutate another user’s data | Protected procedures derive `ctx.user.id`; database helpers require both record ID and user ID |
| Website fetching cannot target internal infrastructure | Only public HTTP/HTTPS destinations are accepted; localhost, private, loopback, link-local, and reserved IP ranges are rejected before fetch and after redirects |
| Scraped content cannot exhaust the request | Timeouts, redirect limits, content-type checks, byte limits, page-count limits, and normalized text caps are applied |
| AI output cannot bypass data contracts | Strict JSON Schema responses are parsed and validated again with Zod before persistence |
| Generated media is not stored in the database | Object storage holds bytes; relational rows hold metadata and URL references |
| Secrets remain private | LLM and image helpers are called only from server-side procedures and services |

## Product-state conventions

Generation runs use `queued`, `analyzing`, `generating`, `completed`, or `failed`. Posts use `draft`, `approved`, `scheduled`, or `rejected`. Scheduled timestamps are stored as UTC timestamps and rendered in the browser’s local time. Deleting a business cascades its relational data; generated objects become unreachable when their metadata references are removed.
