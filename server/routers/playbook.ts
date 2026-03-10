import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/context";
import {
  SOFTWARE_PLAYBOOK,
  getIndustryPlaybook,
  getTenantPlaybook,
  getUserPlaybook,
  resolveTerminology,
  resolveRoles,
  resolveStages,
  resolveCallTypes,
  resolveAlgorithmConfig,
} from "../services/playbooks";

export const playbookRouter = router({
  getConfig: protectedProcedure.query(({ ctx }) => {
    const tenant = getTenantPlaybook(ctx.user.tenantId);
    const industry = getIndustryPlaybook(tenant?.industryCode ?? "default");
    return {
      terminology: resolveTerminology(industry, tenant),
      roles: resolveRoles(industry, tenant),
      stages: resolveStages(industry, tenant),
      callTypes: resolveCallTypes(industry),
      algorithm: resolveAlgorithmConfig(industry, tenant),
    };
  }),

  getIndustry: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => getIndustryPlaybook(input.code)),

  getTenant: protectedProcedure.query(({ ctx }) =>
    getTenantPlaybook(ctx.user.tenantId)
  ),

  getUser: protectedProcedure.query(({ ctx }) =>
    getUserPlaybook(ctx.user.userId, ctx.user.tenantId)
  ),

  getSoftware: publicProcedure.query(() => SOFTWARE_PLAYBOOK),
});
