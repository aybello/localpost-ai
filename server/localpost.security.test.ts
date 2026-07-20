import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const dbMocks = vi.hoisted(() => ({
  getPostForUser: vi.fn(),
  updatePostForUser: vi.fn(),
  getBusinessForUser: vi.fn(),
  listPostsForUser: vi.fn(),
  createGenerationRunForUser: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getPostForUser: dbMocks.getPostForUser,
    updatePostForUser: dbMocks.updatePostForUser,
    getBusinessForUser: dbMocks.getBusinessForUser,
    listPostsForUser: dbMocks.listPostsForUser,
    createGenerationRunForUser: dbMocks.createGenerationRunForUser,
  };
});

import { appRouter } from "./routers";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
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

function postRecord() {
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
    brandProfile: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authenticated ownership boundaries", () => {
  it("queries posts through the authenticated user id and hides missing ownership as not found", async () => {
    dbMocks.getPostForUser.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createContext(37));

    await expect(caller.posts.get({ postId: POST_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(dbMocks.getPostForUser).toHaveBeenCalledWith(37, POST_ID);
  });

  it("persists inline edits atomically with an approval transition", async () => {
    dbMocks.getPostForUser.mockResolvedValue(postRecord());
    dbMocks.updatePostForUser.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createContext(37));

    await caller.posts.setStatus({
      postId: POST_ID,
      status: "approved",
      title: "A refined local update",
      caption: "This refined caption stays attached to the approval transition and remains long enough.",
      hashtags: ["#LocalBusiness", "#Helpful"],
      callToAction: "Book a visit today.",
      tone: "Clear and neighborly",
      imageAltText: "A bright and welcoming neighborhood business interior.",
      scheduledAt: new Date("2026-08-14T15:00:00.000Z"),
    });

    expect(dbMocks.updatePostForUser).toHaveBeenCalledWith(
      37,
      POST_ID,
      expect.objectContaining({
        status: "approved",
        title: "A refined local update",
        hashtags: ["#LocalBusiness", "#Helpful"],
        rejectionReason: null,
      })
    );
  });

  it("requires a rejection reason and a date for scheduled status", async () => {
    const record = postRecord();
    record.post.scheduledAt = null;
    dbMocks.getPostForUser.mockResolvedValue(record);
    const caller = appRouter.createCaller(createContext(37));

    await expect(
      caller.posts.setStatus({ postId: POST_ID, status: "rejected" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.posts.setStatus({ postId: POST_ID, status: "scheduled", scheduledAt: null })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.updatePostForUser).not.toHaveBeenCalled();
  });
});

describe("monthly generation integrity", () => {
  it("rejects a second plan for the same business and month before invoking AI", async () => {
    dbMocks.getBusinessForUser.mockResolvedValue({
      business: { id: BUSINESS_ID, userId: 37, name: "North Star Dental" },
      brandProfile: { id: "brand-profile" },
    });
    dbMocks.listPostsForUser.mockResolvedValue([{ post: postRecord().post, businessName: "North Star Dental" }]);
    const caller = appRouter.createCaller(createContext(37));

    await expect(
      caller.generation.createMonthlyPlan({
        businessId: BUSINESS_ID,
        calendarMonth: "2026-08",
        targetPostCount: 14,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(dbMocks.listPostsForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 37, businessId: BUSINESS_ID })
    );
    expect(dbMocks.createGenerationRunForUser).not.toHaveBeenCalled();
  });
});
