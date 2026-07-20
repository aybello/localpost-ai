import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getBusinessForUser, updateBrandProfileForUser } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const boundedList = z.array(z.string().trim().min(1).max(180)).max(12);

const updateProfileInput = z.object({
  businessId: z.string().uuid(),
  brandSummary: z.string().trim().min(20).max(1_200),
  brandVoice: z.string().trim().min(20).max(800),
  toneKeywords: boundedList,
  brandColors: z.array(z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/)).max(8),
  messagingThemes: boundedList,
  audienceInsights: z.string().trim().min(20).max(1_000),
  audienceSegments: boundedList,
  services: boundedList,
  keywords: boundedList,
  keyDifferentiators: boundedList,
  visualStyle: z.string().trim().min(20).max(800),
  imageGuidance: z.string().trim().min(20).max(1_000),
  contentPillars: boundedList,
  avoidTopics: boundedList,
  isConfirmed: z.boolean().default(true),
});

export const brandRouter = router({
  update: protectedProcedure.input(updateProfileInput).mutation(async ({ ctx, input }) => {
    const record = await getBusinessForUser(ctx.user.id, input.businessId);
    if (!record?.brandProfile) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Brand profile not found." });
    }

    const { businessId, isConfirmed, ...changes } = input;
    await updateBrandProfileForUser(ctx.user.id, businessId, {
      ...changes,
      brandColors: changes.brandColors.map(color => color.toUpperCase()),
      isConfirmed: isConfirmed ? 1 : 0,
    });

    return getBusinessForUser(ctx.user.id, businessId);
  }),
});
