import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-07-20T12:00:00.000Z");

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  mutationErrors: {} as Record<string, Error | null>,
  mutationOptions: {} as Record<string, Record<string, (...args: unknown[]) => unknown>>,
  refetch: vi.fn(),
  invalidatePosts: vi.fn(),
  invalidateSummary: vi.fn(),
  setLocation: vi.fn(),
  toastSuccess: vi.fn(),
}));

function mutation(name: string) {
  return {
    useMutation: (options: Record<string, (...args: unknown[]) => unknown> = {}) => {
      state.mutationOptions[name] = options;
      return {
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isPending: false,
        error: state.mutationErrors[name] ?? null,
        reset: vi.fn(),
      };
    },
  };
}

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      posts: { list: { invalidate: state.invalidatePosts } },
      dashboard: { summary: { invalidate: state.invalidateSummary } },
    }),
    posts: {
      get: { useQuery: () => state.query },
      update: mutation("update"),
      regenerateCopy: mutation("regenerateCopy"),
      generateImage: mutation("generateImage"),
      setStatus: mutation("setStatus"),
      delete: mutation("delete"),
    },
  },
}));

vi.mock("wouter", () => ({
  useRoute: () => [true, { postId: POST_ID }],
  useLocation: () => ["/posts/" + POST_ID, state.setLocation],
}));

vi.mock("sonner", () => ({
  toast: {
    success: state.toastSuccess,
    error: vi.fn(),
  },
}));

import PostEditor from "../client/src/pages/PostEditor";

function ownedPostRecord() {
  return {
    post: {
      id: POST_ID,
      userId: 37,
      businessId: "22222222-2222-4222-8222-222222222222",
      generationRunId: null,
      title: "A useful local update",
      caption: "A complete caption for a helpful Google Business Profile post.",
      hashtags: ["#LocalBusiness", "#Community"],
      callToAction: "Visit our website to learn more.",
      topic: "Community update",
      tone: "Warm and informed",
      audienceAngle: "Local customers",
      imagePrompt: "Photorealistic editorial scene in natural light",
      imageAltText: "A welcoming local business scene in warm natural light.",
      imageUrl: null,
      imageStorageKey: null,
      imageStatus: "pending",
      imageError: null,
      status: "draft",
      scheduledAt: new Date("2026-08-12T15:00:00.000Z"),
      position: 1,
      rejectionReason: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
    business: {
      id: "22222222-2222-4222-8222-222222222222",
      userId: 37,
      name: "North Star Dental",
    },
    brandProfile: {
      toneKeywords: ["warm", "clear", "neighborly"],
    },
  };
}

function renderEditor() {
  return renderToStaticMarkup(createElement(PostEditor));
}

beforeEach(() => {
  vi.clearAllMocks();
  state.mutationErrors = {};
  state.mutationOptions = {};
  state.refetch.mockResolvedValue({ data: undefined });
  state.invalidatePosts.mockResolvedValue(undefined);
  state.invalidateSummary.mockResolvedValue(undefined);
  state.query = {
    data: undefined,
    error: null,
    isPending: false,
    isFetching: false,
    refetch: state.refetch,
  };
});

describe("post editor render states", () => {
  it("shows the loading skeleton without flashing a false not-found message", () => {
    state.query = { ...state.query, isPending: true, isFetching: true };
    const html = renderEditor();

    expect(html).toContain("animate-pulse");
    expect(html).not.toContain("Post not found");
  });

  it("renders the actual not-found state for a protected NOT_FOUND response", () => {
    state.query = {
      ...state.query,
      error: Object.assign(new Error("Post not found"), { data: { code: "NOT_FOUND" } }),
    };
    const html = renderEditor();

    expect(html).toContain("Post not found");
    expect(html).toContain("removed or belong to another account");
  });

  it("renders the ready editor and completes the successful save callback", async () => {
    state.query = { ...state.query, data: ownedPostRecord() };
    const html = renderEditor();

    expect(html).toContain("Refine every detail before it leaves draft");
    expect(html).toContain("North Star Dental");
    expect(html).toContain("Save");

    await state.mutationOptions.update.onSuccess();
    expect(state.refetch).toHaveBeenCalledOnce();
    expect(state.invalidatePosts).toHaveBeenCalledOnce();
    expect(state.invalidateSummary).toHaveBeenCalledOnce();
    expect(state.toastSuccess).toHaveBeenCalledWith("Post saved");
  });

  it("renders a recoverable mutation failure without replacing the editor", () => {
    state.query = { ...state.query, data: ownedPostRecord() };
    state.mutationErrors.update = new Error("Temporary database timeout");
    const html = renderEditor();

    expect(html).toContain("That action didn’t finish");
    expect(html).toContain("Temporary database timeout");
    expect(html).toContain("Your current edits are still here");
    expect(html).toContain("Post copy");
  });
});
