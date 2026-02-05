// Script to run batch badge evaluation
// Run with: pnpm exec tsx scripts/run-badge-eval.mjs

import { batchEvaluateBadges } from '../server/gamification.js';

console.log("Starting batch badge evaluation...");

try {
  const result = await batchEvaluateBadges();
  console.log("\n=== RESULTS ===");
  console.log(`Calls processed: ${result.processed}`);
  console.log(`Badges awarded: ${result.badgesAwarded}`);
  console.log("\nMember Summary:");
  for (const member of result.memberSummary) {
    console.log(`  ${member.name}: ${member.badgesEarned.join(", ")}`);
  }
} catch (error) {
  console.error("Error:", error);
}

process.exit(0);
