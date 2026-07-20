import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  brandProfiles,
  businesses,
  generatedPosts,
  generationRuns,
  InsertBrandProfile,
  InsertBusiness,
  InsertGeneratedPost,
  InsertGenerationRun,
  InsertUser,
  users,
  websiteAnalyses,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  return db;
}

async function assertBusinessOwned(userId: number, businessId: string) {
  const db = await requireDb();
  const rows = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(and(eq(businesses.id, businessId), eq(businesses.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new Error("Business ownership validation failed.");
}

async function assertGenerationRunOwned(
  userId: number,
  runId: string,
  expectedBusinessId?: string
) {
  const db = await requireDb();
  const rows = await db
    .select({ businessId: generationRuns.businessId })
    .from(generationRuns)
    .where(and(eq(generationRuns.id, runId), eq(generationRuns.userId, userId)))
    .limit(1);
  if (!rows[0] || (expectedBusinessId && rows[0].businessId !== expectedBusinessId)) {
    throw new Error("Generation run ownership validation failed.");
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  textFields.forEach(field => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export type CreateBusinessInput = {
  name: string;
  websiteUrl: string;
  industry: string;
  tonePreference?: string | null;
  keyDifferentiators: string[];
  city?: string | null;
  state?: string | null;
  country?: string;
};

export async function createBusinessForUser(userId: number, input: CreateBusinessInput) {
  const db = await requireDb();
  const id = randomUUID();
  const values: InsertBusiness = {
    id,
    userId,
    name: input.name,
    websiteUrl: input.websiteUrl,
    industry: input.industry,
    tonePreference: input.tonePreference ?? null,
    keyDifferentiators: input.keyDifferentiators,
    city: input.city ?? null,
    state: input.state ?? null,
    country: input.country || "United States",
    status: "analyzing",
  };
  await db.insert(businesses).values(values);
  return id;
}

export async function setBusinessStatus(
  userId: number,
  businessId: string,
  status: "draft" | "analyzing" | "ready" | "error"
) {
  const db = await requireDb();
  await db
    .update(businesses)
    .set({ status })
    .where(and(eq(businesses.id, businessId), eq(businesses.userId, userId)));
}

export async function saveCompletedBrandAnalysis(args: {
  userId: number;
  businessId: string;
  sourceUrl: string;
  sourceTitle: string;
  scrapedText: string;
  sourceMetadata: Record<string, unknown>;
  analysisResult: Record<string, unknown>;
  analysisModel: string;
  profile: Omit<InsertBrandProfile, "id" | "userId" | "businessId" | "createdAt" | "updatedAt">;
}) {
  await assertBusinessOwned(args.userId, args.businessId);
  const db = await requireDb();
  const profileId = randomUUID();

  await db.transaction(async tx => {
    await tx.insert(websiteAnalyses).values({
      id: randomUUID(),
      businessId: args.businessId,
      userId: args.userId,
      sourceUrl: args.sourceUrl,
      sourceTitle: args.sourceTitle || null,
      scrapedText: args.scrapedText,
      sourceMetadata: args.sourceMetadata,
      analysisResult: args.analysisResult,
      analysisModel: args.analysisModel,
      status: "completed",
    });

    await tx
      .insert(brandProfiles)
      .values({
        id: profileId,
        businessId: args.businessId,
        userId: args.userId,
        ...args.profile,
      })
      .onDuplicateKeyUpdate({
        set: {
          brandSummary: args.profile.brandSummary,
          brandVoice: args.profile.brandVoice,
          toneKeywords: args.profile.toneKeywords,
          brandColors: args.profile.brandColors,
          messagingThemes: args.profile.messagingThemes,
          audienceInsights: args.profile.audienceInsights,
          audienceSegments: args.profile.audienceSegments,
          services: args.profile.services,
          keywords: args.profile.keywords,
          keyDifferentiators: args.profile.keyDifferentiators,
          visualStyle: args.profile.visualStyle,
          imageGuidance: args.profile.imageGuidance,
          contentPillars: args.profile.contentPillars,
          avoidTopics: args.profile.avoidTopics,
          confidenceScore: args.profile.confidenceScore,
        },
      });

    await tx
      .update(businesses)
      .set({ status: "ready", lastAnalyzedAt: new Date() })
      .where(and(eq(businesses.id, args.businessId), eq(businesses.userId, args.userId)));
  });

  return profileId;
}

export async function saveFailedWebsiteAnalysis(args: {
  userId: number;
  businessId: string;
  sourceUrl: string;
  errorMessage: string;
  analysisModel: string;
}) {
  await assertBusinessOwned(args.userId, args.businessId);
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.insert(websiteAnalyses).values({
      id: randomUUID(),
      businessId: args.businessId,
      userId: args.userId,
      sourceUrl: args.sourceUrl,
      sourceTitle: null,
      scrapedText: "",
      sourceMetadata: {},
      analysisResult: {},
      analysisModel: args.analysisModel,
      status: "failed",
      errorMessage: args.errorMessage,
    });
    await tx
      .update(businesses)
      .set({ status: "error" })
      .where(and(eq(businesses.id, args.businessId), eq(businesses.userId, args.userId)));
  });
}

export async function getBusinessForUser(userId: number, businessId: string) {
  const db = await requireDb();
  const rows = await db
    .select({ business: businesses, brandProfile: brandProfiles })
    .from(businesses)
    .leftJoin(
      brandProfiles,
      and(eq(brandProfiles.businessId, businesses.id), eq(brandProfiles.userId, userId))
    )
    .where(and(eq(businesses.id, businessId), eq(businesses.userId, userId)))
    .limit(1);
  const record = rows[0];
  if (!record) return undefined;

  const analyses = await db
    .select({
      sourceUrl: websiteAnalyses.sourceUrl,
      sourceMetadata: websiteAnalyses.sourceMetadata,
      createdAt: websiteAnalyses.createdAt,
    })
    .from(websiteAnalyses)
    .where(
      and(
        eq(websiteAnalyses.businessId, businessId),
        eq(websiteAnalyses.userId, userId),
        eq(websiteAnalyses.status, "completed")
      )
    )
    .orderBy(desc(websiteAnalyses.createdAt))
    .limit(1);

  return { ...record, latestAnalysis: analyses[0] ?? null };
}

export async function listBusinessesForUser(userId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ business: businesses, brandProfile: brandProfiles })
    .from(businesses)
    .leftJoin(
      brandProfiles,
      and(eq(brandProfiles.businessId, businesses.id), eq(brandProfiles.userId, userId))
    )
    .where(eq(businesses.userId, userId))
    .orderBy(desc(businesses.updatedAt));

  const postCounts = await db
    .select({ businessId: generatedPosts.businessId, total: count() })
    .from(generatedPosts)
    .where(eq(generatedPosts.userId, userId))
    .groupBy(generatedPosts.businessId);
  const countMap = new Map(postCounts.map(row => [row.businessId, Number(row.total)]));

  return rows.map(row => ({
    ...row,
    postCount: countMap.get(row.business.id) ?? 0,
  }));
}

export async function updateBrandProfileForUser(
  userId: number,
  businessId: string,
  changes: Partial<
    Pick<
      InsertBrandProfile,
      | "brandSummary"
      | "brandVoice"
      | "toneKeywords"
      | "brandColors"
      | "messagingThemes"
      | "audienceInsights"
      | "audienceSegments"
      | "services"
      | "keywords"
      | "keyDifferentiators"
      | "visualStyle"
      | "imageGuidance"
      | "contentPillars"
      | "avoidTopics"
      | "isConfirmed"
    >
  >
) {
  const db = await requireDb();
  const result = await db
    .update(brandProfiles)
    .set(changes)
    .where(and(eq(brandProfiles.businessId, businessId), eq(brandProfiles.userId, userId)));
  return result;
}

export async function deleteBusinessForUser(userId: number, businessId: string) {
  const db = await requireDb();
  return db
    .delete(businesses)
    .where(and(eq(businesses.id, businessId), eq(businesses.userId, userId)));
}

export async function createGenerationRunForUser(
  userId: number,
  values: Omit<InsertGenerationRun, "id" | "userId" | "createdAt" | "updatedAt">
) {
  await assertBusinessOwned(userId, values.businessId);
  const db = await requireDb();
  const id = randomUUID();
  await db.insert(generationRuns).values({ id, userId, ...values });
  return id;
}

export async function updateGenerationRunForUser(
  userId: number,
  runId: string,
  changes: Partial<
    Pick<
      InsertGenerationRun,
      | "status"
      | "generatedPostCount"
      | "progressPercent"
      | "errorMessage"
      | "startedAt"
      | "completedAt"
    >
  >
) {
  const db = await requireDb();
  return db
    .update(generationRuns)
    .set(changes)
    .where(and(eq(generationRuns.id, runId), eq(generationRuns.userId, userId)));
}

export async function getGenerationRunForUser(userId: number, runId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(generationRuns)
    .where(and(eq(generationRuns.id, runId), eq(generationRuns.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function insertGeneratedPostsForUser(
  userId: number,
  posts: Array<Omit<InsertGeneratedPost, "id" | "userId" | "createdAt" | "updatedAt">>
) {
  if (!posts.length) return [];
  const businessIds = Array.from(new Set(posts.map(post => post.businessId)));
  for (const businessId of businessIds) {
    await assertBusinessOwned(userId, businessId);
  }
  for (const post of posts) {
    if (post.generationRunId) {
      await assertGenerationRunOwned(userId, post.generationRunId, post.businessId);
    }
  }
  const db = await requireDb();
  const rows = posts.map(post => ({ ...post, id: randomUUID(), userId }));
  await db.insert(generatedPosts).values(rows);
  return rows;
}

export async function listPostsForUser(args: {
  userId: number;
  businessId?: string;
  from?: Date;
  to?: Date;
}) {
  const db = await requireDb();
  const predicates = [eq(generatedPosts.userId, args.userId)];
  if (args.businessId) predicates.push(eq(generatedPosts.businessId, args.businessId));
  if (args.from) predicates.push(gte(generatedPosts.scheduledAt, args.from));
  if (args.to) predicates.push(lt(generatedPosts.scheduledAt, args.to));

  return db
    .select({ post: generatedPosts, businessName: businesses.name })
    .from(generatedPosts)
    .innerJoin(businesses, eq(generatedPosts.businessId, businesses.id))
    .where(and(...predicates))
    .orderBy(asc(generatedPosts.scheduledAt), asc(generatedPosts.position));
}

export async function getPostForUser(userId: number, postId: string) {
  const db = await requireDb();
  const rows = await db
    .select({ post: generatedPosts, business: businesses, brandProfile: brandProfiles })
    .from(generatedPosts)
    .innerJoin(
      businesses,
      and(eq(generatedPosts.businessId, businesses.id), eq(businesses.userId, userId))
    )
    .leftJoin(
      brandProfiles,
      and(eq(brandProfiles.businessId, businesses.id), eq(brandProfiles.userId, userId))
    )
    .where(and(eq(generatedPosts.id, postId), eq(generatedPosts.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function updatePostForUser(
  userId: number,
  postId: string,
  changes: Partial<
    Pick<
      InsertGeneratedPost,
      | "title"
      | "caption"
      | "hashtags"
      | "callToAction"
      | "tone"
      | "imagePrompt"
      | "imageAltText"
      | "imageUrl"
      | "imageStorageKey"
      | "imageStatus"
      | "imageError"
      | "status"
      | "scheduledAt"
      | "rejectionReason"
    >
  >
) {
  const db = await requireDb();
  return db
    .update(generatedPosts)
    .set(changes)
    .where(and(eq(generatedPosts.id, postId), eq(generatedPosts.userId, userId)));
}

export async function deletePostForUser(userId: number, postId: string) {
  const db = await requireDb();
  return db
    .delete(generatedPosts)
    .where(and(eq(generatedPosts.id, postId), eq(generatedPosts.userId, userId)));
}

export async function getDashboardSummary(userId: number) {
  const db = await requireDb();
  const [businessTotalRow] = await db
    .select({ value: count() })
    .from(businesses)
    .where(eq(businesses.userId, userId));
  const [postTotalRow] = await db
    .select({ value: count() })
    .from(generatedPosts)
    .where(eq(generatedPosts.userId, userId));
  const [approvedTotalRow] = await db
    .select({ value: count() })
    .from(generatedPosts)
    .where(and(eq(generatedPosts.userId, userId), eq(generatedPosts.status, "approved")));
  const [readyImageRow] = await db
    .select({ value: count() })
    .from(generatedPosts)
    .where(and(eq(generatedPosts.userId, userId), eq(generatedPosts.imageStatus, "ready")));

  const upcoming = await db
    .select({ post: generatedPosts, businessName: businesses.name })
    .from(generatedPosts)
    .innerJoin(businesses, eq(generatedPosts.businessId, businesses.id))
    .where(and(eq(generatedPosts.userId, userId), gte(generatedPosts.scheduledAt, new Date())))
    .orderBy(asc(generatedPosts.scheduledAt))
    .limit(4);

  const latestRuns = await db
    .select({ run: generationRuns, businessName: businesses.name })
    .from(generationRuns)
    .innerJoin(businesses, eq(generationRuns.businessId, businesses.id))
    .where(eq(generationRuns.userId, userId))
    .orderBy(desc(generationRuns.createdAt))
    .limit(4);

  return {
    businessCount: Number(businessTotalRow?.value ?? 0),
    postCount: Number(postTotalRow?.value ?? 0),
    approvedCount: Number(approvedTotalRow?.value ?? 0),
    readyImageCount: Number(readyImageRow?.value ?? 0),
    upcoming,
    latestRuns,
  };
}

export async function countPostsForRun(userId: number, runId: string) {
  const db = await requireDb();
  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(generatedPosts)
    .where(and(eq(generatedPosts.userId, userId), eq(generatedPosts.generationRunId, runId)));
  return Number(row?.value ?? 0);
}
