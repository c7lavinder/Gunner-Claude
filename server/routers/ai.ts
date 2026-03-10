import { z } from "zod";
import { router, protectedProcedure } from "../_core/context";

export const aiRouter = router({
  chat: protectedProcedure
    .input(
      z.object({
        message: z.string(),
        page: z.string(),
        pageContext: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(() => ({ todo: "implement" })),
});
