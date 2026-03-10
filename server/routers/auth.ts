import { router, publicProcedure, protectedProcedure } from "../_core/context";

export const authRouter = router({
  login: publicProcedure.mutation(() => ({ todo: "implement" })),
  signup: publicProcedure.mutation(() => ({ todo: "implement" })),
  me: protectedProcedure.query(() => ({ todo: "implement" })),
});
