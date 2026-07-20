import { describe, expect, it } from "vitest";
import { brandAnalysisSchema } from "./brand-analysis";

const validAnalysis = {
  businessName: "Harbor Dental",
  industry: "Family dentistry",
  brandSummary:
    "A neighborhood dental practice focused on calm, straightforward care for families and busy professionals.",
  brandVoice: "Warm, clear, and reassuring without sounding overly casual or clinical.",
  toneKeywords: ["warm", "reassuring", "clear"],
  brandColors: ["#185B64", "#E8F2EF"],
  messagingThemes: ["preventive care", "comfortable visits"],
  audienceInsights: "Parents and professionals who value clear explanations and a calm appointment experience.",
  audienceSegments: ["local families", "busy professionals"],
  services: ["preventive dentistry", "restorative dentistry"],
  keywords: ["family dentist", "gentle dental care"],
  keyDifferentiators: ["clear treatment explanations"],
  visualStyle: "Bright, natural-light practice photography with approachable staff and uncluttered rooms.",
  imageGuidance: "Use believable, photorealistic scenes with natural light and calm patient interactions.",
  contentPillars: ["prevention", "patient education", "team expertise"],
  avoidTopics: ["fear-based messaging"],
  confidenceScore: 84,
};

describe("brandAnalysisSchema", () => {
  it("accepts a complete editable brand profile", () => {
    expect(brandAnalysisSchema.parse(validAnalysis)).toEqual(validAnalysis);
  });

  it("rejects non-hex brand colors", () => {
    expect(() =>
      brandAnalysisSchema.parse({ ...validAnalysis, brandColors: ["teal"] })
    ).toThrow();
  });

  it("rejects confidence scores outside the supported range", () => {
    expect(() =>
      brandAnalysisSchema.parse({ ...validAnalysis, confidenceScore: 101 })
    ).toThrow();
  });
});
