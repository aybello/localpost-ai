# LocalPost AI

**AI-powered Google Business Profile content that learns a business before it writes.**

[Try the live product](https://localpost-ai.ay-b.chatgpt.site)

Local businesses know they should post regularly on Google, but creating useful, on-brand content every week takes time most owners do not have. LocalPost AI studies a business website, builds a structured brand profile, and generates locally relevant Google Business Profile posts with matching visuals.

## What it does

1. A business owner provides a business name and public website.
2. GPT-5.6 analyzes the website's services, audience, service areas, differentiators, voice, customer themes, and visual identity.
3. LocalPost turns that evidence into an editable brand profile and content strategy.
4. GPT-5.6 creates a month of locally relevant post concepts and copy.
5. GPT Image 2 generates a photorealistic visual for each post.
6. The owner reviews, edits, schedules, and approves posts in a visual content calendar.

The public competition deployment can be used without creating an account or entering an API key.

## Key features

- Evidence-grounded website and brand analysis
- Editable brand profile and content strategy
- Dynamic, explainable Brand Strength scoring
- Monthly Google Business Profile content generation
- GPT Image 2 visual generation
- Calendar-based review and scheduling
- Draft, approval, and publishing workflows
- Responsive dashboard
- User-scoped persistence and protected server procedures
- Automated regression and release tests

## How GPT-5.6 is used

GPT-5.6 is central to the product. It performs structured brand analysis, synthesizes website evidence into a usable strategy, creates distinct local post concepts, matches the business voice, and produces structured fields used by the image-generation pipeline. GPT Image 2 creates the accompanying visuals.

## How Codex was used

Codex accelerated the full development lifecycle:

- Translated the product concept into a full-stack architecture
- Implemented onboarding, brand analysis, persistence, generation, and editing workflows
- Built the responsive product interface
- Diagnosed production rendering, validation, scraping, colour-extraction, and timeout failures
- Added automated tests and release checks
- Helped validate real-business onboarding and generation flows
- Prepared and deployed the working competition build

## Technology

- React 19 and TypeScript
- Vite and Tailwind CSS
- Express and tRPC
- Drizzle ORM with MySQL
- GPT-5.6-compatible structured generation
- GPT Image 2
- Vitest

## Local setup

### Prerequisites

- Node.js 22 or newer
- pnpm 10
- MySQL-compatible database
- Compatible AI and object-storage credentials

### Installation

```bash
git clone https://github.com/aybello/localpost-ai.git
cd localpost-ai
pnpm install
cp .env.example .env
pnpm db:push
pnpm dev
```

The development server starts at `http://localhost:3000` unless that port is unavailable.

### Environment variables

Copy `.env.example` to `.env` and provide values for the services you use. Never commit real credentials.

## Testing

```bash
pnpm check
pnpm test
pnpm build
```

## Licence

Released under the [MIT License](LICENSE).

## Author

Built by [Ay Bello](https://github.com/aybello) for OpenAI Build Week.
