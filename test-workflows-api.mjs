// Check GHL Workflows API to see if we can get workflow enrollments
import { getDb } from './server/db.ts';
import { ghlOAuthTokens } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  
  const tokens = await db.select().from(ghlOAuthTokens).where(eq(ghlOAuthTokens.tenantId, 1));
  if (!tokens.length) { console.log("No OAuth token found"); return; }
  
  const token = tokens[0];
  const locationId = token.locationId;
  const accessToken = token.accessToken;
  
  // 1. List all workflows
  console.log("=== LISTING WORKFLOWS ===");
  const wfRes = await fetch(`https://services.leadconnectorhq.com/workflows/?locationId=${locationId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-07-28',
      'Accept': 'application/json'
    }
  });
  console.log("Status:", wfRes.status);
  const wfData = await wfRes.json();
  console.log("Response keys:", Object.keys(wfData));
  
  if (wfData.workflows) {
    console.log("\nWorkflow count:", wfData.workflows.length);
    for (const wf of wfData.workflows) {
      console.log(`\n  ID: ${wf.id}`);
      console.log(`  Name: ${wf.name}`);
      console.log(`  Status: ${wf.status}`);
      console.log(`  Keys:`, Object.keys(wf));
    }
  } else {
    console.log("Full response:", JSON.stringify(wfData, null, 2));
  }
}

main().catch(console.error);
