import { z } from "zod";
import type { BrandProfile, Business, GeneratedPost } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { POST_GENERATION_MODEL } from "./post-generation";

const hashtagSchema = z
  .string()
  .trim()
  .regex(/^#[A-Za-z0-9_]+$/)
  .max(60);

export const postCopyRevisionSchema = z.object({
  caption: z.string().trim().min(80).max(1_200),
  hashtags: z.array(hashtagSchema).min(3).max(8),
  callToAction: z.string().trim().min(8).max(320),
  tone: z.string().trim().min(3).max(160),
});

function responseText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(part => part && typeof part === "object" && "type" in part && part.type === "text")
      .map(part => (part as { text?: string }).text ?? "")
      .join("");
  }
  throw new Error("The copy model returned an empty response.");
}

export async function regeneratePostCopy(args: {
  post: GeneratedPost;
  business: Business;
  brandProfile: BrandProfile;
  toneInstruction?: string;
}) {
  const prompt = `Revise the copy for one Google Business Profile post while preserving its factual topic and intent.

BUSINESS
Name: ${args.business.name}
Industry: ${args.business.industry}
Location: ${[args.business.city, args.business.state, args.business.country].filter(Boolean).join(", ")}

BRAND
Voice: ${args.brandProfile.brandVoice}
Tone keywords: ${args.brandProfile.toneKeywords.join(", ")}
Audience: ${args.brandProfile.audienceInsights}
Differentiators: ${args.brandProfile.keyDifferentiators.join("; ")}
Topics to avoid: ${args.brandProfile.avoidTopics.join("; ") || "None specified"}

CURRENT POST
Topic: ${args.post.topic}
Caption: ${args.post.caption}
Hashtags: ${args.post.hashtags.join(" ")}
Call-to-action: ${args.post.callToAction}
Current tone: ${args.post.tone}
Requested tone adjustment: ${args.toneInstruction?.trim() || "Improve clarity while retaining the current brand tone"}

Return a complete revised caption, 3–8 hashtags, a natural call-to-action, and concise tone metadata. Do not add promotions, deadlines, customer quotes, ratings, awards, certifications, statistics, service areas, or capabilities not present above. Hashtags must begin with # and contain only letters, numbers, or underscores.`;

  const result = await invokeLLM({
    model: POST_GENERATION_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a careful local-business copy editor. Return only JSON matching the supplied schema and never invent business facts.",
      },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "gbp_post_copy_revision",
        strict: true,
        schema: {
          type: "object",
          properties: {
            caption: { type: "string" },
            hashtags: {
              type: "array",
              minItems: 3,
              maxItems: 8,
              items: { type: "string", pattern: "^#[A-Za-z0-9_]+$" },
            },
            callToAction: { type: "string" },
            tone: { type: "string" },
          },
          required: ["caption", "hashtags", "callToAction", "tone"],
          additionalProperties: false,
        },
      },
    },
  });

  return postCopyRevisionSchema.parse(
    JSON.parse(responseText(result.choices[0]?.message.content))
  );
}
