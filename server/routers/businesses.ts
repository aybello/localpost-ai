import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createBusinessForUser,
  deleteBusinessForUser,
  getBusinessForUser,
  listBusinessesForUser,
  saveCompletedBrandAnalysis,
  saveFailedWebsiteAnalysis,
  setBusinessStatus,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import {
  analyzeBrandEvidence,
  BRAND_ANALYSIS_MODEL,
  BrandAnalysisValidationError,
} from "../localpost/brand-analysis";
import {
  normalizeWebsiteUrl,
  scrapeBusinessWebsite,
  WebsiteScrapeError,
} from "../localpost/scraper";

const onboardingInput = z.object({
  name: z.string().trim().min(2).max(200),
  websiteUrl: z.string().trim().min(4).max(2_048),
  industry: z.string().trim().min(2).max(160),
  tonePreference: z.string().trim().max(160).optional().nullable(),
  keyDifferentiators: z.array(z.string().trim().min(2).max(180)).max(10).default([]),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().min(2).max(120).default("United States"),
});

function toProfileValues(analysis: Awaited<ReturnType<typeof analyzeBrandEvidence>>) {
  return {
    brandSummary: analysis.brandSummary,
    brandVoice: analysis.brandVoice,
    toneKeywords: analysis.toneKeywords,
    brandColors: analysis.brandColors,
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
    confidenceScore: analysis.confidenceScore,
    isConfirmed: 0,
  };
}

async function runAnalysis(args: {
  userId: number;
  businessId: string;
  input: z.infer<typeof onboardingInput>;
}) {
  const normalizedUrl = normalizeWebsiteUrl(args.input.websiteUrl).toString();

  try {
    const scrape = await scrapeBusinessWebsite(normalizedUrl);
    const analysis = await analyzeBrandEvidence({
      businessName: args.input.name,
      industry: args.input.industry,
      tonePreference: args.input.tonePreference,
      keyDifferentiators: args.input.keyDifferentiators,
      city: args.input.city,
      state: args.input.state,
      scrape,
    });

    await saveCompletedBrandAnalysis({
      userId: args.userId,
      businessId: args.businessId,
      sourceUrl: scrape.sourceUrl,
      sourceTitle: scrape.title,
      scrapedText: scrape.text,
      sourceMetadata: scrape.metadata,
      analysisResult: analysis,
      analysisModel: BRAND_ANALYSIS_MODEL,
      profile: toProfileValues(analysis),
    });

    return analysis;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brand analysis failed.";
    await saveFailedWebsiteAnalysis({
      userId: args.userId,
      businessId: args.businessId,
      sourceUrl: normalizedUrl,
      errorMessage: message.slice(0, 2_000),
      analysisModel: BRAND_ANALYSIS_MODEL,
    }).catch(() => setBusinessStatus(args.userId, args.businessId, "error"));

    if (error instanceof WebsiteScrapeError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    if (error instanceof BrandAnalysisValidationError || error instanceof z.ZodError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "The analysis response could not be structured reliably after an automatic retry.",
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "The analysis service is temporarily unavailable. Please try again in a moment.",
    });
  }
}

export const businessesRouter = router({
  list: protectedProcedure.query(({ ctx }) => listBusinessesForUser(ctx.user.id)),

  get: protectedProcedure
    .input(z.object({ businessId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const record = await getBusinessForUser(ctx.user.id, input.businessId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Business not found." });
      return record;
    }),

  onboard: protectedProcedure.input(onboardingInput).mutation(async ({ ctx, input }) => {
    const websiteUrl = normalizeWebsiteUrl(input.websiteUrl).toString();
    const businessId = await createBusinessForUser(ctx.user.id, { ...input, websiteUrl });
    const analysis = await runAnalysis({
      userId: ctx.user.id,
      businessId,
      input: { ...input, websiteUrl },
    });
    return { businessId, analysis };
  }),

  reanalyze: protectedProcedure
    .input(z.object({ businessId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const record = await getBusinessForUser(ctx.user.id, input.businessId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Business not found." });
      await setBusinessStatus(ctx.user.id, input.businessId, "analyzing");
      const analysis = await runAnalysis({
        userId: ctx.user.id,
        businessId: input.businessId,
        input: {
          name: record.business.name,
          websiteUrl: record.business.websiteUrl,
          industry: record.business.industry,
          tonePreference: record.business.tonePreference,
          keyDifferentiators: record.business.keyDifferentiators,
          city: record.business.city,
          state: record.business.state,
          country: record.business.country,
        },
      });
      return { businessId: input.businessId, analysis };
    }),

  delete: protectedProcedure
    .input(z.object({ businessId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const record = await getBusinessForUser(ctx.user.id, input.businessId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Business not found." });
      await deleteBusinessForUser(ctx.user.id, input.businessId);
      return { success: true } as const;
    }),
});
