import { z } from "zod";
import type { BrandProfile, Business } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";

export const POST_GENERATION_MODEL = "gpt-5.5";
export const MIN_MONTHLY_POSTS = 12;
export const MAX_MONTHLY_POSTS = 16;

const hashtagSchema = z
  .string()
  .trim()
  .regex(/^#[A-Za-z0-9_]+$/)
  .max(60);

export const generatedPostDraftSchema = z.object({
  title: z.string().trim().min(4).max(160),
  caption: z.string().trim().min(80).max(1_200),
  hashtags: z.array(hashtagSchema).min(3).max(8),
  callToAction: z.string().trim().min(8).max(320),
  topic: z.string().trim().min(4).max(200),
  tone: z.string().trim().min(3).max(160),
  audienceAngle: z.string().trim().min(10).max(500),
  imageConcept: z.string().trim().min(20).max(800),
  imageAltText: z.string().trim().min(10).max(400),
});

export type GeneratedPostDraft = z.infer<typeof generatedPostDraftSchema>;

export type PlannedPost = GeneratedPostDraft & {
  scheduledAt: Date;
  position: number;
  imagePrompt: string;
};

export function validateTargetPostCount(targetPostCount: number): number {
  if (!Number.isInteger(targetPostCount)) {
    throw new Error("Monthly post count must be a whole number.");
  }
  if (targetPostCount < MIN_MONTHLY_POSTS || targetPostCount > MAX_MONTHLY_POSTS) {
    throw new Error(
      `Monthly post count must be between ${MIN_MONTHLY_POSTS} and ${MAX_MONTHLY_POSTS}.`
    );
  }
  return targetPostCount;
}

export function parseCalendarMonth(calendarMonth: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(calendarMonth);
  if (!match) throw new Error("Calendar month must use YYYY-MM format.");
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}

export function buildMonthlySchedule(calendarMonth: string, count: number): Date[] {
  validateTargetPostCount(count);
  const { year, monthIndex } = parseCalendarMonth(calendarMonth);
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const startDay = 2;
  const endDay = Math.max(startDay, daysInMonth - 1);
  const span = endDay - startDay;

  return Array.from({ length: count }, (_, index) => {
    const ratio = count === 1 ? 0 : index / (count - 1);
    const day = Math.round(startDay + span * ratio);
    return new Date(Date.UTC(year, monthIndex, day, 15, 0, 0));
  });
}

function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function assertDiverseTopics(posts: GeneratedPostDraft[]): void {
  const normalized = posts.map(post => normalizeTopic(post.topic));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("The generated plan repeated a topic. Please generate the month again.");
  }

  for (let left = 0; left < normalized.length; left += 1) {
    const leftTokens = new Set(normalized[left]?.split(" ").filter(Boolean));
    for (let right = left + 1; right < normalized.length; right += 1) {
      const rightTokens = new Set(normalized[right]?.split(" ").filter(Boolean));
      const shared = Array.from(leftTokens).filter(token => rightTokens.has(token)).length;
      const smaller = Math.min(leftTokens.size, rightTokens.size);
      if (smaller >= 3 && shared / smaller > 0.8) {
        throw new Error("The generated plan contained overly similar topics.");
      }
    }
  }
}

export function buildPhotorealisticImagePrompt(args: {
  post: GeneratedPostDraft;
  business: Business;
  brandProfile: BrandProfile;
}): string {
  const colors = args.brandProfile.brandColors.slice(0, 4).join(", ");
  return [
    "Create a polished, photorealistic square editorial photograph for a local business Google Business Profile post.",
    `Business context: ${args.business.industry}; ${args.business.name}.`,
    `Post topic: ${args.post.topic}.`,
    `Scene concept: ${args.post.imageConcept}`,
    `Brand aesthetic: ${args.brandProfile.visualStyle}`,
    `Additional visual guidance: ${args.brandProfile.imageGuidance}`,
    colors ? `Use the brand palette (${colors}) subtly through props, wardrobe, or environment rather than as graphic overlays.` : "Use a cohesive, natural color palette that fits the brand.",
    "Use believable people, spaces, materials, lighting, and anatomy. Favor natural light, authentic local-business detail, and a premium commercial-photography finish.",
    "Do not include text, captions, watermarks, UI, badges, phone numbers, signage with invented wording, or fabricated logos. Do not make before-and-after, medical, financial, or performance claims.",
  ].join("\n");
}

function responseText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(part => part && typeof part === "object" && "type" in part && part.type === "text")
      .map(part => (part as { text?: string }).text ?? "")
      .join("");
  }
  throw new Error("The content model returned an empty response.");
}

function schemaForCount(targetPostCount: number) {
  return {
    type: "object",
    properties: {
      posts: {
        type: "array",
        minItems: targetPostCount,
        maxItems: targetPostCount,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            caption: { type: "string" },
            hashtags: {
              type: "array",
              minItems: 3,
              maxItems: 8,
              items: { type: "string", pattern: "^#[A-Za-z0-9_]+$" },
            },
            callToAction: { type: "string" },
            topic: { type: "string" },
            tone: { type: "string" },
            audienceAngle: { type: "string" },
            imageConcept: { type: "string" },
            imageAltText: { type: "string" },
          },
          required: [
            "title",
            "caption",
            "hashtags",
            "callToAction",
            "topic",
            "tone",
            "audienceAngle",
            "imageConcept",
            "imageAltText",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["posts"],
    additionalProperties: false,
  } as const;
}

export async function generateMonthlyContent(args: {
  business: Business;
  brandProfile: BrandProfile;
  calendarMonth: string;
  targetPostCount: number;
}): Promise<PlannedPost[]> {
  const targetPostCount = validateTargetPostCount(args.targetPostCount);
  parseCalendarMonth(args.calendarMonth);

  const prompt = `Create exactly ${targetPostCount} distinct Google Business Profile posts for ${args.calendarMonth}.

BUSINESS FACTS
Name: ${args.business.name}
Industry: ${args.business.industry}
Location: ${[args.business.city, args.business.state, args.business.country].filter(Boolean).join(", ")}
User-provided differentiators: ${args.business.keyDifferentiators.join("; ") || "None supplied"}

EDITED BRAND PROFILE — SOURCE OF TRUTH
Brand summary: ${args.brandProfile.brandSummary}
Brand voice: ${args.brandProfile.brandVoice}
Tone keywords: ${args.brandProfile.toneKeywords.join(", ")}
Messaging themes: ${args.brandProfile.messagingThemes.join("; ")}
Audience: ${args.brandProfile.audienceInsights}
Audience segments: ${args.brandProfile.audienceSegments.join("; ")}
Services: ${args.brandProfile.services.join("; ")}
Keywords: ${args.brandProfile.keywords.join(", ")}
Differentiators: ${args.brandProfile.keyDifferentiators.join("; ")}
Content pillars: ${args.brandProfile.contentPillars.join("; ")}
Topics to avoid: ${args.brandProfile.avoidTopics.join("; ") || "None specified"}
Visual style: ${args.brandProfile.visualStyle}
Image guidance: ${args.brandProfile.imageGuidance}

REQUIREMENTS
Return exactly ${targetPostCount} posts. Every post must include a complete caption, 3–8 hashtags, a direct but natural call-to-action, a concise topic, tone metadata, an audience angle, a photorealistic scene concept, and useful image alt text. Make the month varied: rotate education, service awareness, differentiators, behind-the-scenes concepts, local relevance, FAQs, seasonal context where genuinely appropriate, and trust-building brand stories. Do not repeat topics or merely paraphrase the same idea.

Do not invent promotions, discounts, deadlines, events, customer quotes, ratings, certifications, awards, years of experience, statistics, service areas, or capabilities. Do not make regulated health, legal, financial, safety, or guaranteed-outcome claims. Avoid engagement bait. Hashtags must start with # and contain only letters, numbers, or underscores. Captions should be useful and ready to publish, not outlines.`;

  const result = await invokeLLM({
    model: POST_GENERATION_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a careful local-business content strategist. Return only JSON matching the supplied schema and use only provided business facts.",
      },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "monthly_gbp_content_plan",
        strict: true,
        schema: schemaForCount(targetPostCount),
      },
    },
  });

  const raw = JSON.parse(responseText(result.choices[0]?.message.content));
  const plan = z
    .object({ posts: z.array(generatedPostDraftSchema).length(targetPostCount) })
    .parse(raw).posts;
  assertDiverseTopics(plan);

  const schedule = buildMonthlySchedule(args.calendarMonth, targetPostCount);
  return plan.map((post, index) => ({
    ...post,
    scheduledAt: schedule[index]!,
    position: index,
    imagePrompt: buildPhotorealisticImagePrompt({
      post,
      business: args.business,
      brandProfile: args.brandProfile,
    }),
  }));
}
