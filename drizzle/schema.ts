import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing the Manus authentication flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const businesses = mysqlTable(
  "businesses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    websiteUrl: varchar("websiteUrl", { length: 2048 }).notNull(),
    industry: varchar("industry", { length: 160 }).notNull(),
    tonePreference: varchar("tonePreference", { length: 160 }),
    keyDifferentiators: json("keyDifferentiators").$type<string[]>().notNull(),
    city: varchar("city", { length: 120 }),
    state: varchar("state", { length: 120 }),
    country: varchar("country", { length: 120 }).default("United States").notNull(),
    status: mysqlEnum("status", ["draft", "analyzing", "ready", "error"])
      .default("draft")
      .notNull(),
    lastAnalyzedAt: timestamp("lastAnalyzedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    ownerIdx: index("businesses_owner_idx").on(table.userId),
    ownerStatusIdx: index("businesses_owner_status_idx").on(table.userId, table.status),
  })
);

export const brandProfiles = mysqlTable(
  "brand_profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    businessId: varchar("businessId", { length: 36 })
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brandSummary: text("brandSummary").notNull(),
    brandVoice: text("brandVoice").notNull(),
    toneKeywords: json("toneKeywords").$type<string[]>().notNull(),
    brandColors: json("brandColors").$type<string[]>().notNull(),
    messagingThemes: json("messagingThemes").$type<string[]>().notNull(),
    audienceInsights: text("audienceInsights").notNull(),
    audienceSegments: json("audienceSegments").$type<string[]>().notNull(),
    services: json("services").$type<string[]>().notNull(),
    keywords: json("keywords").$type<string[]>().notNull(),
    keyDifferentiators: json("keyDifferentiators").$type<string[]>().notNull(),
    visualStyle: text("visualStyle").notNull(),
    imageGuidance: text("imageGuidance").notNull(),
    contentPillars: json("contentPillars").$type<string[]>().notNull(),
    avoidTopics: json("avoidTopics").$type<string[]>().notNull(),
    confidenceScore: int("confidenceScore").default(0).notNull(),
    isConfirmed: int("isConfirmed").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    businessUnique: uniqueIndex("brand_profiles_business_unique").on(table.businessId),
    ownerIdx: index("brand_profiles_owner_idx").on(table.userId),
  })
);

export const websiteAnalyses = mysqlTable(
  "website_analyses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    businessId: varchar("businessId", { length: 36 })
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceUrl: varchar("sourceUrl", { length: 2048 }).notNull(),
    sourceTitle: varchar("sourceTitle", { length: 500 }),
    scrapedText: text("scrapedText").notNull(),
    sourceMetadata: json("sourceMetadata").$type<Record<string, unknown>>().notNull(),
    analysisResult: json("analysisResult").$type<Record<string, unknown>>().notNull(),
    analysisModel: varchar("analysisModel", { length: 80 }).notNull(),
    status: mysqlEnum("status", ["completed", "failed"]).notNull(),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    businessCreatedIdx: index("website_analyses_business_created_idx").on(
      table.businessId,
      table.createdAt
    ),
    ownerIdx: index("website_analyses_owner_idx").on(table.userId),
  })
);

export const generationRuns = mysqlTable(
  "generation_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    businessId: varchar("businessId", { length: 36 })
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calendarMonth: varchar("calendarMonth", { length: 7 }).notNull(),
    targetPostCount: int("targetPostCount").notNull(),
    generatedPostCount: int("generatedPostCount").default(0).notNull(),
    progressPercent: int("progressPercent").default(0).notNull(),
    status: mysqlEnum("status", ["queued", "analyzing", "generating", "completed", "failed"])
      .default("queued")
      .notNull(),
    generationModel: varchar("generationModel", { length: 80 }).notNull(),
    errorMessage: text("errorMessage"),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    ownerMonthIdx: index("generation_runs_owner_month_idx").on(
      table.userId,
      table.calendarMonth
    ),
    businessMonthIdx: index("generation_runs_business_month_idx").on(
      table.businessId,
      table.calendarMonth
    ),
  })
);

export const generatedPosts = mysqlTable(
  "generated_posts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    businessId: varchar("businessId", { length: 36 })
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    generationRunId: varchar("generationRunId", { length: 36 }).references(
      () => generationRuns.id,
      { onDelete: "set null" }
    ),
    title: varchar("title", { length: 160 }).notNull(),
    caption: text("caption").notNull(),
    hashtags: json("hashtags").$type<string[]>().notNull(),
    callToAction: varchar("callToAction", { length: 320 }).notNull(),
    topic: varchar("topic", { length: 200 }).notNull(),
    tone: varchar("tone", { length: 160 }).notNull(),
    audienceAngle: text("audienceAngle").notNull(),
    imagePrompt: text("imagePrompt").notNull(),
    imageAltText: text("imageAltText").notNull(),
    imageUrl: varchar("imageUrl", { length: 2048 }),
    imageStorageKey: varchar("imageStorageKey", { length: 1024 }),
    imageStatus: mysqlEnum("imageStatus", ["pending", "generating", "ready", "failed"])
      .default("pending")
      .notNull(),
    imageError: text("imageError"),
    status: mysqlEnum("status", ["draft", "approved", "scheduled", "rejected"])
      .default("draft")
      .notNull(),
    scheduledAt: timestamp("scheduledAt"),
    position: int("position").default(0).notNull(),
    rejectionReason: text("rejectionReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    ownerScheduleIdx: index("generated_posts_owner_schedule_idx").on(
      table.userId,
      table.scheduledAt
    ),
    businessScheduleIdx: index("generated_posts_business_schedule_idx").on(
      table.businessId,
      table.scheduledAt
    ),
    runIdx: index("generated_posts_run_idx").on(table.generationRunId),
    ownerStatusIdx: index("generated_posts_owner_status_idx").on(table.userId, table.status),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Business = typeof businesses.$inferSelect;
export type InsertBusiness = typeof businesses.$inferInsert;
export type BrandProfile = typeof brandProfiles.$inferSelect;
export type InsertBrandProfile = typeof brandProfiles.$inferInsert;
export type WebsiteAnalysis = typeof websiteAnalyses.$inferSelect;
export type InsertWebsiteAnalysis = typeof websiteAnalyses.$inferInsert;
export type GenerationRun = typeof generationRuns.$inferSelect;
export type InsertGenerationRun = typeof generationRuns.$inferInsert;
export type GeneratedPost = typeof generatedPosts.$inferSelect;
export type InsertGeneratedPost = typeof generatedPosts.$inferInsert;
