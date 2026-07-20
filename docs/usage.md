# LocalPost AI — Usage and Delivery Notes

LocalPost AI is an authenticated content studio for creating and managing Google Business Profile content. Each account’s businesses, brand evidence, brand profiles, generation runs, posts, image metadata, and lifecycle changes are stored under that authenticated user’s identifier.

## Core workflow

| Stage | What the user does | What the application persists |
|---|---|---|
| Business onboarding | Enter a business name, public website, industry, preferred tone, differentiators, and optional location details. | A user-owned business record and website-analysis status. |
| Brand analysis | Start the website analysis and wait for the public-site evidence to be processed. | The extracted evidence snapshot and a structured, editable brand profile. |
| Brand review | Refine the summary, voice, palette, themes, audiences, services, keywords, differentiators, visual direction, and topics to avoid. | The confirmed profile used as the source of truth for future content. |
| Monthly planning | Select a month and request between 12 and 16 posts. | A tracked generation run and a non-duplicated monthly set of draft posts. |
| Visual creation | Allow the calendar to create visuals or retry only posts whose visuals are pending or failed. | Photorealistic image URLs, storage keys, status, alt text, and recoverable error metadata. |
| Editorial review | Edit copy inline, regenerate only copy fields, adjust tone, regenerate an image, and approve, reject, schedule, or return a post to draft. | Atomic copy and lifecycle updates that do not discard unsaved editor fields. |

## Product boundaries

The application manages **content readiness and scheduling state**, but it does not currently connect to the Google Business Profile publishing API. Marking a post as scheduled records its intended publication time and status inside LocalPost AI; it does not publish the post to Google automatically.

Website analysis intentionally accepts only public HTTP or HTTPS pages. The scraper blocks private and local network destinations, constrains redirects, response size, and request duration, and treats all website text as untrusted evidence rather than executable instructions.

AI generation is performed on demand through the project’s server-side built-in integrations. Brand analysis and monthly copy use the selected structured language model, while post visuals use the configured image model and persistent object storage. If an image request fails, the post remains available and records a retryable failed state.

## Validation summary

| Check | Release result |
|---|---|
| Automated test suite | 61 tests passed across authentication, scraping safety, normalization, generation bounds, tenant isolation, workflow orchestration, UI state logic, and image retries. |
| TypeScript | `pnpm check` completed without errors. |
| Production build | `pnpm build` completed successfully with route-level and vendor code splitting. |
| Database | All LocalPost AI persistence tables were verified in the active database after the migration was applied. |
| Responsive interface | The overview, onboarding, calendar, brand profile, post editor recovery, and true not-found states were reviewed at desktop, tablet, and mobile breakpoints. |

## Local development

From the project root, run `pnpm dev` for development, `pnpm test` for the active Vitest suite, `pnpm check` for TypeScript validation, and `pnpm build` for the production bundle. Environment variables and AI credentials remain managed by the hosting platform and should not be committed to the repository.

## Publishing

A delivery checkpoint makes the current version reviewable and publishable from the project interface. Publishing itself should be initiated with the **Publish** control in the management interface after reviewing the preview.
