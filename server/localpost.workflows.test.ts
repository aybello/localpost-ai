import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectRetryableImageIds } from "../client/src/lib/post-images";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  createBusinessForUser: vi.fn(),
  saveCompletedBrandAnalysis: vi.fn(),
  saveFailedWebsiteAnalysis: vi.fn(),
  setBusinessStatus: vi.fn(),
  getBusinessForUser: vi.fn(),
  updateBrandProfileForUser: vi.fn(),
  getPostForUser: vi.fn(),
  updatePostForUser: vi.fn(),
  scrapeBusinessWebsite: vi.fn(),
  analyzeBrandEvidence: vi.fn(),
  generatePostVisual: vi.fn(),
  createGenerationRunForUser: vi.fn(),
  insertGeneratedPostsForUser: vi.fn(),
  listPostsForUser: vi.fn(),
  updateGenerationRunForUser: vi.fn(),
  generateMonthlyContent: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    createBusinessForUser: mocks.createBusinessForUser,
    saveCompletedBrandAnalysis: mocks.saveCompletedBrandAnalysis,
    saveFailedWebsiteAnalysis: mocks.saveFailedWebsiteAnalysis,
    setBusinessStatus: mocks.setBusinessStatus,
    getBusinessForUser: mocks.getBusinessForUser,
    updateBrandProfileForUser: mocks.updateBrandProfileForUser,
    getPostForUser: mocks.getPostForUser,
    updatePostForUser: mocks.updatePostForUser,
    createGenerationRunForUser: mocks.createGenerationRunForUser,
    insertGeneratedPostsForUser: mocks.insertGeneratedPostsForUser,
    listPostsForUser: mocks.listPostsForUser,
    updateGenerationRunForUser: mocks.updateGenerationRunForUser,
  };
});

vi.mock("./localpost/scraper", async () => {
  const actual = await vi.importActual<typeof import("./localpost/scraper")>("./localpost/scraper");
  return { ...actual, scrapeBusinessWebsite: mocks.scrapeBusinessWebsite };
});

vi.mock("./localpost/brand-analysis", async () => {
  const actual = await vi.importActual<typeof import("./localpost/brand-analysis")>("./localpost/brand-analysis");
  return { ...actual, analyzeBrandEvidence: mocks.analyzeBrandEvidence };
});

vi.mock("./localpost/post-image", async () => {
  const actual = await vi.importActual<typeof import("./localpost/post-image")>("./localpost/post-image");
  return { ...actual, generatePostVisual: mocks.generatePostVisual };
});

vi.mock("./localpost/post-generation", async () => {
  const actual = await vi.importActual<typeof import("./localpost/post-generation")>("./localpost/post-generation");
  return { ...actual, generateMonthlyContent: mocks.generateMonthlyContent };
});

import { BrandAnalysisValidationError } from "./localpost/brand-analysis";
import { appRouter } from "./routers";

const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const POST_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-07-20T12:00:00.000Z");

function createContext(userId = 37): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      email: `user-${userId}@example.com`,
      name: `User ${userId}`,
      loginMethod: "manus",
      role: "user",
      createdAt: NOW,
      updatedAt: NOW,
      lastSignedIn: NOW,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const analysis = {
  brandSummary: "A trusted neighborhood dental practice focused on calm, clear, family-friendly care.",
  brandVoice: "Warm, reassuring, locally grounded, and specific without sounding clinical or promotional.",
  toneKeywords: ["warm", "clear", "neighborly"],
  brandColors: ["#0B7A61", "#F4EBDD"],
  messagingThemes: ["Preventive confidence", "Comfort-first care"],
  audienceInsights: "Local families want convenient care, transparent explanations, and a welcoming experience.",
  audienceSegments: ["Local families", "Anxious patients"],
  services: ["Preventive dentistry", "Family dentistry"],
  keywords: ["family dentist", "preventive care"],
  keyDifferentiators: ["Calm appointments", "Clear treatment guidance"],
  visualStyle: "Photorealistic, naturally lit neighborhood moments with calm editorial composition.",
  imageGuidance: "Use real environments, warm daylight, diverse local families, and no text overlays or logos.",
  contentPillars: ["Helpful education", "Community trust", "Service clarity"],
  avoidTopics: ["Fear-based messaging", "Unsupported medical claims"],
  confidenceScore: 91,
};

function ownedBusinessRecord() {
  return {
    business: {
      id: BUSINESS_ID,
      userId: 37,
      name: "North Star Dental",
      websiteUrl: "https://northstardental.example/",
      industry: "Dentistry",
      tonePreference: "Warm and reassuring",
      keyDifferentiators: ["Comfort-first visits"],
      city: "Austin",
      state: "Texas",
      country: "United States",
      status: "ready" as const,
      lastAnalyzedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
    brandProfile: {
      id: "33333333-3333-4333-8333-333333333333",
      businessId: BUSINESS_ID,
      userId: 37,
      ...analysis,
      isConfirmed: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    latestAnalysis: null,
  };
}

function ownedPostRecord() {
  return {
    post: {
      id: POST_ID,
      userId: 37,
      businessId: BUSINESS_ID,
      generationRunId: null,
      title: "A useful local update",
      caption: "A complete caption with enough detail for a helpful Google Business Profile post.",
      hashtags: ["#LocalBusiness", "#Community"],
      callToAction: "Visit our website to learn more.",
      topic: "Community update",
      tone: "Warm and informed",
      audienceAngle: "Local customers",
      imagePrompt: "Photorealistic editorial scene in natural light",
      imageAltText: "A welcoming local business scene in warm natural light.",
      imageUrl: null,
      imageStorageKey: null,
      imageStatus: "pending" as const,
      imageError: null,
      status: "draft" as const,
      scheduledAt: new Date("2026-08-12T15:00:00.000Z"),
      position: 1,
      rejectionReason: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
    business: { id: BUSINESS_ID, userId: 37, name: "North Star Dental" },
    brandProfile: ownedBusinessRecord().brandProfile,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("guided onboarding workflow", () => {
  it("normalizes the URL, analyzes public evidence, and persists a user-scoped editable profile", async () => {
    mocks.createBusinessForUser.mockResolvedValue(BUSINESS_ID);
    mocks.scrapeBusinessWebsite.mockResolvedValue({
      sourceUrl: "https://northstardental.example/",
      title: "North Star Dental",
      text: "Family-focused preventive dental care in Austin with calm appointments and clear guidance.",
      metadata: { description: "Comfort-first family dentistry" },
    });
    mocks.analyzeBrandEvidence.mockResolvedValue(analysis);
    mocks.saveCompletedBrandAnalysis.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createContext());
    const result = await caller.businesses.onboard({
      name: "North Star Dental",
      websiteUrl: "northstardental.example",
      industry: "Dentistry",
      tonePreference: "Warm and reassuring",
      keyDifferentiators: ["Comfort-first visits"],
      city: "Austin",
      state: "Texas",
      country: "United States",
    });

    expect(result).toEqual({ businessId: BUSINESS_ID, analysis });
    expect(mocks.createBusinessForUser).toHaveBeenCalledWith(
      37,
      expect.objectContaining({ websiteUrl: "https://northstardental.example/" })
    );
    expect(mocks.scrapeBusinessWebsite).toHaveBeenCalledWith("https://northstardental.example/");
    expect(mocks.saveCompletedBrandAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 37,
        businessId: BUSINESS_ID,
        profile: expect.objectContaining({ brandSummary: analysis.brandSummary, isConfirmed: 0 }),
      })
    );
  });

  it("maps an exhausted structured-output repair to concise onboarding copy", async () => {
    mocks.createBusinessForUser.mockResolvedValue(BUSINESS_ID);
    mocks.scrapeBusinessWebsite.mockResolvedValue({
      sourceUrl: "https://northstardental.example/",
      title: "North Star Dental",
      text: "Public business evidence.",
      metadata: {},
      detectedColors: [],
    });
    mocks.analyzeBrandEvidence.mockRejectedValue(new BrandAnalysisValidationError());
    mocks.saveFailedWebsiteAnalysis.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createContext());
    await expect(
      caller.businesses.onboard({
        name: "North Star Dental",
        websiteUrl: "northstardental.example",
        industry: "Dentistry",
        tonePreference: "Warm and reassuring",
        keyDifferentiators: [],
        city: "Austin",
        state: "Texas",
        country: "United States",
      })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "The analysis response could not be structured reliably after an automatic retry.",
    });
    expect(mocks.saveFailedWebsiteAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 37,
        businessId: BUSINESS_ID,
        errorMessage: "Brand analysis output failed validation after one repair attempt.",
      })
    );
  });
});

describe("editable brand review workflow", () => {
  it("confirms a profile and normalizes palette values without crossing the user boundary", async () => {
    mocks.getBusinessForUser.mockResolvedValue(ownedBusinessRecord());
    mocks.updateBrandProfileForUser.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createContext());

    await caller.brand.update({
      businessId: BUSINESS_ID,
      brandSummary: analysis.brandSummary,
      brandVoice: analysis.brandVoice,
      toneKeywords: analysis.toneKeywords,
      brandColors: ["#0b7a61", "#f4ebdd"],
      messagingThemes: analysis.messagingThemes,
      audienceInsights: analysis.audienceInsights,
      audienceSegments: analysis.audienceSegments,
      services: analysis.services,
      keywords: analysis.keywords,
      keyDifferentiators: analysis.keyDifferentiators,
      visualStyle: analysis.visualStyle,
      imageGuidance: analysis.imageGuidance,
      contentPillars: analysis.contentPillars,
      avoidTopics: analysis.avoidTopics,
      isConfirmed: true,
    });

    expect(mocks.getBusinessForUser).toHaveBeenCalledWith(37, BUSINESS_ID);
    expect(mocks.updateBrandProfileForUser).toHaveBeenCalledWith(
      37,
      BUSINESS_ID,
      expect.objectContaining({ brandColors: ["#0B7A61", "#F4EBDD"], isConfirmed: 1 })
    );
  });
});

describe("successful monthly planning workflow", () => {
  it("creates exactly 12 persisted drafts with pending visuals and completes tracked progress", async () => {
    const plan = Array.from({ length: 12 }, (_, index) => ({
      title: `Helpful local update ${index + 1}`,
      caption: `A complete and useful local-business caption for planned post ${index + 1}.`,
      hashtags: ["#LocalBusiness", `#Topic${index + 1}`],
      callToAction: "Visit our website to learn more.",
      topic: `Distinct topic ${index + 1}`,
      tone: "Warm and informed",
      audienceAngle: "Local customers",
      imagePrompt: `Photorealistic editorial scene ${index + 1} in natural light`,
      imageAltText: `A welcoming local-business scene for post ${index + 1}.`,
      scheduledAt: new Date(Date.UTC(2026, 7, index + 2, 15, 0, 0)),
      position: index + 1,
    }));
    const persistedPosts = plan.map((post, index) => ({
      id: `post-${index + 1}`,
      ...post,
      imageStatus: "pending" as const,
      status: "draft" as const,
    }));

    mocks.getBusinessForUser.mockResolvedValue(ownedBusinessRecord());
    mocks.listPostsForUser.mockResolvedValue([]);
    mocks.createGenerationRunForUser.mockResolvedValue(RUN_ID);
    mocks.generateMonthlyContent.mockResolvedValue(plan);
    mocks.insertGeneratedPostsForUser.mockResolvedValue(persistedPosts);
    mocks.updateGenerationRunForUser.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createContext());
    const result = await caller.generation.createMonthlyPlan({
      businessId: BUSINESS_ID,
      calendarMonth: "2026-08",
      targetPostCount: 12,
    });

    expect(result).toEqual({ runId: RUN_ID, posts: persistedPosts });
    expect(mocks.generateMonthlyContent).toHaveBeenCalledWith(
      expect.objectContaining({ calendarMonth: "2026-08", targetPostCount: 12 })
    );
    expect(mocks.insertGeneratedPostsForUser).toHaveBeenCalledWith(
      37,
      expect.arrayContaining([
        expect.objectContaining({
          generationRunId: RUN_ID,
          imageStatus: "pending",
          status: "draft",
        }),
      ])
    );
    expect(mocks.insertGeneratedPostsForUser.mock.calls[0]?.[1]).toHaveLength(12);
    expect(mocks.updateGenerationRunForUser).toHaveBeenLastCalledWith(
      37,
      RUN_ID,
      expect.objectContaining({
        status: "completed",
        generatedPostCount: 12,
        progressPercent: 100,
      })
    );
  });
});

describe("recoverable visual generation workflow", () => {
  it("persists a failed image attempt and allows a later retry to reach ready state", async () => {
    mocks.getPostForUser.mockResolvedValue(ownedPostRecord());
    mocks.updatePostForUser.mockResolvedValue(undefined);
    mocks.generatePostVisual
      .mockRejectedValueOnce(new Error("Temporary image service timeout"))
      .mockResolvedValueOnce({
        url: "https://storage.example/generated-post.png",
        key: "users/37/posts/generated-post.png",
        prompt: "Photorealistic neighborhood business scene",
      });

    const caller = appRouter.createCaller(createContext());
    await expect(caller.posts.generateImage({ postId: POST_ID })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    await expect(
      caller.posts.generateImage({ postId: POST_ID, editorGuidance: "Use softer morning light" })
    ).resolves.toBeDefined();

    expect(mocks.updatePostForUser.mock.calls).toEqual([
      [37, POST_ID, { imageStatus: "generating", imageError: null }],
      [37, POST_ID, { imageStatus: "failed", imageError: "Temporary image service timeout" }],
      [37, POST_ID, { imageStatus: "generating", imageError: null }],
      [
        37,
        POST_ID,
        {
          imageUrl: "https://storage.example/generated-post.png",
          imageStorageKey: "users/37/posts/generated-post.png",
          imageStatus: "ready",
          imageError: null,
        },
      ],
    ]);
    expect(mocks.generatePostVisual).toHaveBeenLastCalledWith(
      expect.objectContaining({ editorGuidance: "Use softer morning light" })
    );
  });
});

describe("protected calendar visual batch retry workflow", () => {
  it("runs selected pending and failed visuals through the protected procedure and retries a failed attempt", async () => {
    const pendingId = POST_ID;
    const failedId = "55555555-5555-4555-8555-555555555555";
    const selectedIds = selectRetryableImageIds([
      { id: pendingId, imageStatus: "pending" },
      { id: failedId, imageStatus: "failed" },
      { id: "66666666-6666-4666-8666-666666666666", imageStatus: "ready" },
    ]);

    mocks.getPostForUser.mockImplementation(async (_userId: number, postId: string) => {
      const record = ownedPostRecord();
      return {
        ...record,
        post: {
          ...record.post,
          id: postId,
          imageStatus: postId === failedId ? ("failed" as const) : ("pending" as const),
        },
      };
    });
    mocks.updatePostForUser.mockResolvedValue(undefined);
    mocks.generatePostVisual
      .mockRejectedValueOnce(new Error("Temporary image service timeout"))
      .mockResolvedValueOnce({
        url: "https://storage.example/failed-post-ready.png",
        key: "users/37/posts/failed-post-ready.png",
        prompt: "Photorealistic local business scene",
      })
      .mockResolvedValueOnce({
        url: "https://storage.example/pending-post-ready.png",
        key: "users/37/posts/pending-post-ready.png",
        prompt: "Photorealistic local business scene with softer light",
      });

    expect(selectedIds).toEqual([pendingId, failedId]);
    const caller = appRouter.createCaller(createContext());
    const firstBatch = await Promise.allSettled(
      selectedIds.map(postId => caller.posts.generateImage({ postId }))
    );

    expect(firstBatch.map(result => result.status)).toEqual(["rejected", "fulfilled"]);
    expect(mocks.updatePostForUser).toHaveBeenCalledWith(37, pendingId, {
      imageStatus: "failed",
      imageError: "Temporary image service timeout",
    });
    expect(mocks.updatePostForUser).toHaveBeenCalledWith(
      37,
      failedId,
      expect.objectContaining({ imageStatus: "ready", imageError: null })
    );

    await expect(
      caller.posts.generateImage({ postId: pendingId, editorGuidance: "Use softer morning light" })
    ).resolves.toBeDefined();
    expect(mocks.updatePostForUser).toHaveBeenLastCalledWith(
      37,
      pendingId,
      expect.objectContaining({
        imageStatus: "ready",
        imageError: null,
        imageUrl: "https://storage.example/pending-post-ready.png",
      })
    );
  });
});
