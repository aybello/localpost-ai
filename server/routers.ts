import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { brandRouter } from "./routers/brand";
import { businessesRouter } from "./routers/businesses";
import { dashboardRouter } from "./routers/dashboard";
import { generationRouter } from "./routers/generation";
import { postsRouter } from "./routers/posts";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  businesses: businessesRouter,
  dashboard: dashboardRouter,
  brand: brandRouter,
  generation: generationRouter,
  posts: postsRouter,
});

export type AppRouter = typeof appRouter;
