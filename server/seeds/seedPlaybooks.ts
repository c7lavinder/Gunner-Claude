import { db } from "../_core/db";
import { industryPlaybooks } from "../../drizzle/schema";
import { ALL_INDUSTRY_PLAYBOOKS } from "./industries";
import { eq } from "drizzle-orm";

export async function seedIndustryPlaybooks() {
  let inserted = 0;
  let skipped = 0;

  for (const pb of ALL_INDUSTRY_PLAYBOOKS) {
    const [existing] = await db
      .select({ id: industryPlaybooks.id })
      .from(industryPlaybooks)
      .where(eq(industryPlaybooks.code, pb.code))
      .limit(1);

    if (existing) {
      await db
        .update(industryPlaybooks)
        .set({
          name: pb.name,
          terminology: pb.terminology,
          roles: pb.roles,
          stages: pb.stages,
          callTypes: pb.callTypes,
          rubrics: pb.rubrics,
          outcomeTypes: pb.outcomeTypes,
          kpiFunnelStages: pb.kpiFunnelStages,
          algorithmDefaults: pb.algorithmDefaults,
          roleplayPersonas: pb.roleplayPersonas ?? null,
          trainingCategories: pb.trainingCategories ?? null,
          gradingPhilosophy: pb.gradingPhilosophy ?? null,
          kpiMetrics: pb.kpiMetrics ?? null,
          taskCategories: pb.taskCategories ?? null,
          classificationLabels: pb.classificationLabels ?? null,
          updatedAt: new Date(),
        })
        .where(eq(industryPlaybooks.id, existing.id));
      skipped++;
      continue;
    }

    await db.insert(industryPlaybooks).values({
      code: pb.code,
      name: pb.name,
      terminology: pb.terminology,
      roles: pb.roles,
      stages: pb.stages,
      callTypes: pb.callTypes,
      rubrics: pb.rubrics,
      outcomeTypes: pb.outcomeTypes,
      kpiFunnelStages: pb.kpiFunnelStages,
      algorithmDefaults: pb.algorithmDefaults,
      roleplayPersonas: pb.roleplayPersonas ?? null,
      trainingCategories: pb.trainingCategories ?? null,
      gradingPhilosophy: pb.gradingPhilosophy ?? null,
      kpiMetrics: pb.kpiMetrics ?? null,
      taskCategories: pb.taskCategories ?? null,
      classificationLabels: pb.classificationLabels ?? null,
    });
    inserted++;
  }

  console.log(`[seed] Industry playbooks: ${inserted} inserted, ${skipped} updated`);
}
