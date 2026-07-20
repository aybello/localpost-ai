import { getDashboardSummary } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const dashboardRouter = router({
  summary: protectedProcedure.query(({ ctx }) => getDashboardSummary(ctx.user.id)),
});
