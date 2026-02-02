/**
 * Direct reprocessing script that calls processCall directly
 * Run with: npx tsx scripts/direct-reprocess.ts
 */

import { processCall } from "../server/grading";
import { getDb } from "../server/db";

async function main() {
  // Call IDs that failed due to billing issue
  const failedCallIds = [90001, 90002, 90005, 60003];
  
  console.log(`\nReprocessing ${failedCallIds.length} failed calls...\n`);
  
  for (const callId of failedCallIds) {
    console.log(`Processing call ${callId}...`);
    try {
      await processCall(callId);
      console.log(`  ✓ Call ${callId} processed`);
    } catch (error: any) {
      console.log(`  ✗ Call ${callId} failed: ${error.message}`);
    }
    // Small delay between calls
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n✓ All calls processed');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
