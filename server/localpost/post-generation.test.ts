import { describe, expect, it } from "vitest";
import {
  assertDiverseTopics,
  buildMonthlySchedule,
  generatedPostDraftSchema,
  validateTargetPostCount,
} from "./post-generation";

const draft = {
  title: "A practical guide to preventive care",
  caption:
    "Small preventive steps can make routine care feel much more manageable. Our team explains what to expect and helps you choose a sensible next step for your needs.",
  hashtags: ["#LocalBusiness", "#HelpfulGuide", "#CommunityCare"],
  callToAction: "Contact our team to ask which next step fits your needs.",
  topic: "Preventive care basics",
  tone: "Warm and educational",
  audienceAngle: "Local families who want straightforward guidance.",
  imageConcept: "A welcoming professional explaining a simple care plan in a bright, modern local office.",
  imageAltText: "A professional speaking with a customer in a naturally lit local office.",
};

describe("monthly post planning", () => {
  it("accepts only the supported 12–16 monthly volume", () => {
    expect(validateTargetPostCount(12)).toBe(12);
    expect(validateTargetPostCount(16)).toBe(16);
    expect(() => validateTargetPostCount(11)).toThrow();
    expect(() => validateTargetPostCount(17)).toThrow();
    expect(() => validateTargetPostCount(12.5)).toThrow();
  });

  it("builds the requested number of chronological UTC dates inside the month", () => {
    const dates = buildMonthlySchedule("2026-02", 14);
    expect(dates).toHaveLength(14);
    expect(dates.every(date => date.getUTCFullYear() === 2026 && date.getUTCMonth() === 1)).toBe(true);
    expect(dates.every((date, index) => index === 0 || date >= dates[index - 1]!)).toBe(true);
  });

  it("requires every post to include caption, hashtags, CTA, tone, topic, and image direction", () => {
    expect(generatedPostDraftSchema.parse(draft)).toEqual(draft);
    expect(() => generatedPostDraftSchema.parse({ ...draft, callToAction: "" })).toThrow();
    expect(() => generatedPostDraftSchema.parse({ ...draft, hashtags: [] })).toThrow();
  });

  it("rejects repeated topics", () => {
    expect(() => assertDiverseTopics([draft, { ...draft }])).toThrow();
    expect(() =>
      assertDiverseTopics([
        draft,
        { ...draft, topic: "Meet the team", title: "Meet our local team" },
      ])
    ).not.toThrow();
  });
});
