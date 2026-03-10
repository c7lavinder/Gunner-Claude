import { router, protectedProcedure } from "../_core/context";

export const settingsRouter = router({
  getWorkspace: protectedProcedure.query(() => ({ todo: "implement" })),
  updateWorkspace: protectedProcedure.mutation(() => ({ todo: "implement" })),
});
