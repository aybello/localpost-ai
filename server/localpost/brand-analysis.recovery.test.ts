import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeLLM = vi.hoisted(() => vi.fn());

vi.mock("../_core/llm", () => ({ invokeLLM }));

import {
  analyzeBrandEvidence,
  BrandAnalysisValidationError,
} from "./brand-analysis";

const validAnalysis = {
  businessName: "North Star Dental",
  industry: "Family dentistry",
  brandSummary:
    "A neighborhood dental practice focused on comfortable visits, clear guidance, and useful local education.",
  brandVoice:
    "Warm, precise, and reassuring without becoming overly promotional or overly clinical.",
  toneKeywords: ["warm", "clear", "neighborly"],
  brandColors: ["#185B64", "#112233"],
  messagingThemes: ["preventive confidence", "comfortable visits"],
  audienceInsights:
    "Local families and busy professionals value transparent explanations and a calm, convenient experience.",
  audienceSegments: ["local families", "busy professionals"],
  services: ["preventive care", "family care"],
  keywords: ["family dentist", "preventive care"],
  keyDifferentiators: ["comfort-first visits", "clear explanations"],
  visualStyle:
    "Bright, natural-light editorial photography with believable local environments and people.",
  imageGuidance:
    "Use photorealistic scenes, natural light, authentic environments, and no invented logos or claims.",
  contentPillars: ["education", "community trust", "service clarity"],
  avoidTopics: ["fear-based messaging", "unsupported health claims"],
  confidenceScore: 88,
};

const input = {
  businessName: "North Star Dental",
  industry: "Family dentistry",
  tonePreference: "Warm and reassuring",
  keyDifferentiators: ["Local team"],
  city: "Austin",
  state: "Texas",
  scrape: {
    sourceUrl: "https://northstardental.example/",
    title: "North Star Dental",
    description: "Comfort-first local dentistry",
    text: "Public website evidence about preventive care and a welcoming patient experience.",
    detectedColors: ["#112233", "#445566"],
  } as any,
};

function response(content: string) {
  return { choices: [{ message: { content } }] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("brand-analysis structured-output recovery", () => {
  it("normalizes an oversized model color array without requiring another model call", async () => {
    invokeLLM.mockResolvedValueOnce(
      response(
        JSON.stringify({
          ...validAnalysis,
          brandColors: [
            "#185B64",
            "#112233",
            "#223344",
            "#334455",
            "#445566",
            "#556677",
            "#667788",
            "#778899",
            "#8899AA",
            "#99AABB",
            "#abc",
            "not-a-color",
          ],
          toneKeywords: Array.from({ length: 18 }, (_, index) => `Tone ${index + 1}`),
          confidenceScore: 108.4,
        })
      )
    );

    const result = await analyzeBrandEvidence(input);

    expect(result.brandColors).toHaveLength(8);
    expect(result.brandColors).toEqual([
      "#185B64",
      "#112233",
      "#223344",
      "#334455",
      "#445566",
      "#556677",
      "#667788",
      "#778899",
    ]);
    expect(result.toneKeywords).toHaveLength(12);
    expect(result.confidenceScore).toBe(100);
    expect(invokeLLM).toHaveBeenCalledTimes(1);
  });

  it("makes one fresh repair request when normalized output still cannot pass validation", async () => {
    invokeLLM
      .mockResolvedValueOnce(response(JSON.stringify({ businessName: "Incomplete" })))
      .mockResolvedValueOnce(response(JSON.stringify(validAnalysis)));

    const result = await analyzeBrandEvidence(input);

    expect(result.brandSummary).toContain("neighborhood dental practice");
    expect(invokeLLM).toHaveBeenCalledTimes(2);
    const repairRequest = invokeLLM.mock.calls[1]?.[0];
    expect(repairRequest.messages[1].content).toContain("REPAIR ATTEMPT");
  });

  it("raises a sanitized domain error after the single repair attempt is exhausted", async () => {
    invokeLLM.mockResolvedValue(response("not valid json"));

    await expect(analyzeBrandEvidence(input)).rejects.toBeInstanceOf(
      BrandAnalysisValidationError
    );
    expect(invokeLLM).toHaveBeenCalledTimes(2);
  });
});
