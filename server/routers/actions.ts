import { z } from "zod";
import { router, protectedProcedure } from "../_core/context";

export const actionsRouter = router({
  execute: protectedProcedure
    .input(
      z.object({
        type: z.string(),
        from: z.record(z.string(), z.unknown()),
        to: z.record(z.string(), z.unknown()),
        payload: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(() => ({ todo: "implement" })),
});
