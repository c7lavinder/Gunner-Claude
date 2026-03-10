import { z } from "zod";
import { router, protectedProcedure } from "../_core/context";

export const callsRouter = router({
  list: protectedProcedure.query(() => []),
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(() => ({ todo: "implement" })),
});
