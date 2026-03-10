import { router, protectedProcedure } from "../_core/context";

export const kpiRouter = router({
  getDashboard: protectedProcedure.query(() => ({ todo: "implement" })),
  updateEntry: protectedProcedure.mutation(() => ({ todo: "implement" })),
});
