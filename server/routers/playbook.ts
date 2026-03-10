import { router, publicProcedure, protectedProcedure } from "../_core/context";

export const playbookRouter = router({
  getIndustry: publicProcedure.query(() => ({ todo: "implement" })),
  getTenant: protectedProcedure.query(() => ({ todo: "implement" })),
  getUser: protectedProcedure.query(() => ({ todo: "implement" })),
});
