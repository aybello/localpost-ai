import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createGenerationRunForUser,
  getBusinessForUser,
  getGenerationRunForUser,
  insertGeneratedPostsForUser,
  listPostsForUser,
  updateGenerationRunForUser,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import {
  generateMonthlyContent,
  MAX_MONTHLY_POSTS,
  MIN_MONTHLY_POSTS,
  POST_GENERATION_MODEL,
} from "../localpost/post-generation";

const createMonthlyInput = z.object({
  businessId: z.string().uuid(),
  calendarMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  targetPostCount: z.number().int().min(MIN_MONTHLY_POSTS).max(MAX_MONTHLY_POSTS),
});

export const generationRouter = router({
  getRun: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const run = await getGenerationRunForUser(ctx.user.id, input.runId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Generation run not found." });
      return run;
    }),

  createMonthlyPlan: protectedProcedure
    .input(createMonthlyInput)
    .mutation(async ({ ctx, input }) => {
      const record = await getBusinessForUser(ctx.user.id, input.businessId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Business not found." });
      if (!record.brandProfile) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Complete brand analysis before generating a content month.",
        });
      }

      const [year, month] = input.calendarMonth.split("-").map(Number);
      const existingPosts = await listPostsForUser({
        userId: ctx.user.id,
        businessId: input.businessId,
        from: new Date(Date.UTC(year, month - 1, 1)),
        to: new Date(Date.UTC(year, month, 1)),
      });
      if (existingPosts.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This business already has a content plan for the selected month.",
        });
      }

      const runId = await createGenerationRunForUser(ctx.user.id, {
        businessId: input.businessId,
        calendarMonth: input.calendarMonth,
        targetPostCount: input.targetPostCount,
        generatedPostCount: 0,
        progressPercent: 10,
        status: "generating",
        generationModel: POST_GENERATION_MODEL,
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null,
      });

      try {
        const plan = await generateMonthlyContent({
          business: record.business,
          brandProfile: record.brandProfile,
          calendarMonth: input.calendarMonth,
          targetPostCount: input.targetPostCount,
        });

        const posts = await insertGeneratedPostsForUser(
          ctx.user.id,
          plan.map(post => ({
            businessId: input.businessId,
            generationRunId: runId,
            title: post.title,
            caption: post.caption,
            hashtags: post.hashtags,
            callToAction: post.callToAction,
            topic: post.topic,
            tone: post.tone,
            audienceAngle: post.audienceAngle,
            imagePrompt: post.imagePrompt,
            imageAltText: post.imageAltText,
            imageUrl: null,
            imageStorageKey: null,
            imageStatus: "pending" as const,
            imageError: null,
            status: "draft" as const,
            scheduledAt: post.scheduledAt,
            position: post.position,
            rejectionReason: null,
          }))
        );

        await updateGenerationRunForUser(ctx.user.id, runId, {
          status: "completed",
          generatedPostCount: posts.length,
          progressPercent: 100,
          errorMessage: null,
          completedAt: new Date(),
        });

        return { runId, posts };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Monthly generation failed.";
        await updateGenerationRunForUser(ctx.user.id, runId, {
          status: "failed",
          progressPercent: 0,
          errorMessage: message.slice(0, 2_000),
          completedAt: new Date(),
        });

        if (error instanceof z.ZodError || /generated plan|content model/i.test(message)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The generated plan did not pass quality checks. Please try again.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The content month could not be generated. Please try again.",
        });
      }
    }),
});
