import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeLLM = vi.hoisted(() => vi.fn());

vi.mock("../_core/llm", () => ({ invokeLLM }));

import { analyzeBrandEvidence } from "./brand-analysis";

const modelAnalysis = {
  businessName: "Model-proposed business name",
  industry: "Model-proposed industry",
  brandSummary:
    "A neighborhood practice focused on clear guidance, comfortable appointments, and useful local education.",
  brandVoice: "Warm, precise, and reassuring without becoming overly promotional or clinical.",
  toneKeywords: [" warm ", "clear", "neighborly"],
  brandColors: [" #185B64 ", "#185b64", "#112233"],
  messagingThemes: ["preventive confidence", "comfortable visits"],
  audienceInsights:
    "Local families and busy professionals value transparent explanations and a calm, convenient experience.",
  audienceSegments: ["local families", "busy professionals"],
  services: ["preventive care", "family care"],
  keywords: ["family dentist", "preventive care"],
  keyDifferentiators: [
    "comfort-first visits",
    "Clear explanations",
    "Same-week availability",
    "Modern equipment",
    "Family scheduling",
    "Central location",
    "Transparent estimates",
    "Gentle approach",
    "Multilingual team",
    "Digital forms",
    "Early appointments",
    "Local referrals",
  ],
  visualStyle: "Bright, natural-light editorial photography with believable local environments and people.",
  imageGuidance: "Use photorealistic scenes, natural light, authentic environments, and no invented logos or claims.",
  contentPillars: ["education", "community trust", "service clarity"],
  avoidTopics: ["fear-based messaging", "unsupported health claims"],
  confidenceScore: 88,
};

beforeEach(() => {
  vi.clearAllMocks();
  invokeLLM.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(modelAnalysis) } }],
  });
});

describe("structured brand-analysis normalization", () => {
  it("uses sanitized user facts, trims model fields, and merges colors without case-insensitive duplicates", async () => {
    const result = await analyzeBrandEvidence({
      businessName: "  North Star Dental  ",
      industry: "  Family dentistry  ",
      tonePreference: "Warm and reassuring",
      keyDifferentiators: [" Comfort-first visits ", "comfort-first visits", "Local team"],
      city: "Austin",
      state: "Texas",
      scrape: {
        sourceUrl: "https://northstardental.example/",
        title: "North Star Dental",
        description: "Comfort-first local dentistry",
        text: "Public website evidence about preventive care and a welcoming patient experience.",
        detectedColors: ["#112233", "#445566", "#778899", "#AABBCC", "#DDEEFF", "#010203", "#040506"],
      } as any,
    });

    expect(result.businessName).toBe("North Star Dental");
    expect(result.industry).toBe("Family dentistry");
    expect(result.toneKeywords[0]).toBe("warm");
    expect(result.brandColors).toEqual([
      "#185B64",
      "#112233",
      "#445566",
      "#778899",
      "#AABBCC",
      "#DDEEFF",
      "#010203",
      "#040506",
    ]);
    expect(new Set(result.brandColors.map(color => color.toLowerCase())).size).toBe(
      result.brandColors.length
    );
  });

  it("prioritizes trusted website evidence over model-generated palette guesses", async () => {
    const result = await analyzeBrandEvidence({
      businessName: "AfroPuppy Yoga",
      industry: "Yoga and wellness",
      keyDifferentiators: [],
      scrape: {
        sourceUrl: "https://afropuppyyoga.ca/",
        title: "AfroPuppy Yoga",
        description: "Movement and wellness",
        text: "Public website evidence about yoga, movement, and wellness services.",
        detectedColors: ["#4A7C59", "#D4A853", "#F5F0E8", "#778899"],
        metadata: {
          colorEvidence: [
            {
              color: "#4A7C59",
              source: "css-variable",
              confidence: "high",
              score: 98,
              occurrences: 5,
              contexts: [":root --brand-primary"],
            },
            {
              color: "#D4A853",
              source: "stylesheet",
              confidence: "medium",
              score: 71,
              occurrences: 3,
              contexts: [".button background-color"],
            },
            {
              color: "#F5F0E8",
              source: "stylesheet",
              confidence: "low",
              score: 42,
              occurrences: 1,
              contexts: [".surface background-color"],
            },
          ],
        },
      } as any,
    });

    expect(result.brandColors.slice(0, 4)).toEqual([
      "#4A7C59",
      "#D4A853",
      "#185B64",
      "#112233",
    ]);
    const request = invokeLLM.mock.calls[0]?.[0];
    expect(request.messages[1].content).toContain(
      "#4A7C59 | confidence: high | source: css-variable | score: 98"
    );
    expect(request.messages[1].content).toContain(
      "preserve those colors in their ranked order"
    );
  });

  it("deduplicates preferred differentiators, preserves their priority, and enforces the 12-item bound", async () => {
    const result = await analyzeBrandEvidence({
      businessName: "North Star Dental",
      industry: "Family dentistry",
      keyDifferentiators: [" Comfort-first visits ", "comfort-first visits", "Local team"],
      scrape: {
        sourceUrl: "https://northstardental.example/",
        title: "North Star Dental",
        description: "Comfort-first local dentistry",
        text: "Public website evidence about preventive care and a welcoming patient experience.",
        detectedColors: [],
      } as any,
    });

    expect(result.keyDifferentiators.slice(0, 2)).toEqual(["Comfort-first visits", "Local team"]);
    expect(result.keyDifferentiators).toHaveLength(12);
    expect(
      new Set(result.keyDifferentiators.map(value => value.toLowerCase())).size
    ).toBe(result.keyDifferentiators.length);
  });
});
