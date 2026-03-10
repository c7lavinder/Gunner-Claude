import { router, protectedProcedure } from "../_core/context";

export const trainingRouter = router({
  getMaterials: protectedProcedure.query(() => ({ todo: "implement" })),
  startRoleplay: protectedProcedure.mutation(() => ({ todo: "implement" })),
});
