import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  deletePostForUser,
  getPostForUser,
  listPostsForUser,
  updatePostForUser,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { generatePostVisual } from "../localpost/post-image";
import { regeneratePostCopy } from "../localpost/post-refinement";
import { parseCalendarMonth } from "../localpost/post-generation";

const editableFields = z.object({
  postId: z.string().uuid(),
  title: z.string().trim().min(4).max(160).optional(),
  caption: z.string().trim().min(20).max(1_200).optional(),
  hashtags: z
    .array(z.string().trim().regex(/^#[A-Za-z0-9_]+$/).max(60))
    .min(1)
    .max(12)
    .optional(),
  callToAction: z.string().trim().min(4).max(320).optional(),
  tone: z.string().trim().min(3).max(160).optional(),
  imageAltText: z.string().trim().min(10).max(400).optional(),
  scheduledAt: z.date().nullable().optional(),
});

function monthRange(calendarMonth: string) {
  const { year, monthIndex } = parseCalendarMonth(calendarMonth);
  return {
    from: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0)),
    to: new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0)),
  };
}

export const postsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        businessId: z.string().uuid().optional(),
        calendarMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const range = input.calendarMonth ? monthRange(input.calendarMonth) : {};
      const rows = await listPostsForUser({
        userId: ctx.user.id,
        businessId: input.businessId,
        ...range,
      });
      return rows.map(({ post, businessName }) => ({ ...post, businessName }));
    }),

  get: protectedProcedure
    .input(z.object({ postId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const record = await getPostForUser(ctx.user.id, input.postId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });
      return record;
    }),

  update: protectedProcedure.input(editableFields).mutation(async ({ ctx, input }) => {
    const record = await getPostForUser(ctx.user.id, input.postId);
    if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });
    const { postId, ...changes } = input;
    await updatePostForUser(ctx.user.id, postId, changes);
    return getPostForUser(ctx.user.id, postId);
  }),

  regenerateCopy: protectedProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        toneInstruction: z.string().trim().min(2).max(240).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const record = await getPostForUser(ctx.user.id, input.postId);
      if (!record?.brandProfile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post or brand profile not found." });
      }

      try {
        const revision = await regeneratePostCopy({
          post: record.post,
          business: record.business,
          brandProfile: record.brandProfile,
          toneInstruction: input.toneInstruction,
        });
        await updatePostForUser(ctx.user.id, input.postId, revision);
        return getPostForUser(ctx.user.id, input.postId);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The post copy could not be regenerated. Please try again.",
        });
      }
    }),

  generateImage: protectedProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        editorGuidance: z.string().trim().min(2).max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const record = await getPostForUser(ctx.user.id, input.postId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });

      await updatePostForUser(ctx.user.id, input.postId, {
        imageStatus: "generating",
        imageError: null,
      });

      try {
        const image = await generatePostVisual({
          post: record.post,
          editorGuidance: input.editorGuidance,
        });
        await updatePostForUser(ctx.user.id, input.postId, {
          imageUrl: image.url,
          imageStorageKey: image.key,
          imageStatus: "ready",
          imageError: null,
        });
        return getPostForUser(ctx.user.id, input.postId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Image generation failed.";
        await updatePostForUser(ctx.user.id, input.postId, {
          imageStatus: "failed",
          imageError: message.slice(0, 1_000),
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The post image could not be generated. Please try again.",
        });
      }
    }),

  setStatus: protectedProcedure
    .input(
      editableFields.extend({
        status: z.enum(["draft", "approved", "scheduled", "rejected"]),
        rejectionReason: z.string().trim().min(2).max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const record = await getPostForUser(ctx.user.id, input.postId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });
      if (input.status === "rejected" && !input.rejectionReason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add a reason when rejecting a post." });
      }

      const scheduledAt = input.scheduledAt === undefined ? record.post.scheduledAt : input.scheduledAt;
      if (input.status === "scheduled" && !scheduledAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a date before scheduling." });
      }

      const { postId, status, rejectionReason, ...editableChanges } = input;
      await updatePostForUser(ctx.user.id, postId, {
        ...editableChanges,
        status,
        scheduledAt,
        rejectionReason: status === "rejected" ? rejectionReason : null,
      });
      return getPostForUser(ctx.user.id, postId);
    }),

  delete: protectedProcedure
    .input(z.object({ postId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const record = await getPostForUser(ctx.user.id, input.postId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });
      await deletePostForUser(ctx.user.id, input.postId);
      return { success: true } as const;
    }),
});
