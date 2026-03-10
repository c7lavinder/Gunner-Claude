import { router, protectedProcedure } from "../_core/context";

export const gamificationRouter = router({
  getLeaderboard: protectedProcedure.query(() => ({ todo: "implement" })),
  getBadges: protectedProcedure.query(() => ({ todo: "implement" })),
});
