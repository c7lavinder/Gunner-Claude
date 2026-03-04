// Test GHL search contacts API with workflow filter
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
  
  // Working Leads Drip workflow ID
  const workflowId = "20fc8111-db0a-46af-a264-099446be46d3";
  const contactId = "GHJFE9qzKeW3mUtAvRlt"; // Cathy Peacock
  
  // Try 1: Search contacts with workflow filter
  console.log("=== TRY 1: Search with workflow filter ===");
  const searchRes = await fetch(`https://services.leadconnectorhq.com/contacts/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      locationId,
      filters: [
        {
          field: "workflow",
          operator: "eq",
          value: workflowId
        }
      ]
    })
  });
  console.log("Status:", searchRes.status);
  const searchData = await searchRes.json();
  console.log("Response:", JSON.stringify(searchData, null, 2).substring(0, 2000));
  
  // Try 2: Search with different filter format
  console.log("\n=== TRY 2: Search with automation filter ===");
  const searchRes2 = await fetch(`https://services.leadconnectorhq.com/contacts/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      locationId,
      filters: [
        {
          group: "AND",
          filters: [
            {
              field: "contactId",
              operator: "eq",
              value: contactId
            }
          ]
        }
      ],
      searchAfter: [],
      pageLimit: 1
    })
  });
  console.log("Status:", searchRes2.status);
  const searchData2 = await searchRes2.json();
  
  // Check if the contact has workflow info in the search result
  if (searchData2.contacts && searchData2.contacts.length > 0) {
    const c = searchData2.contacts[0];
    console.log("Contact keys:", Object.keys(c));
    // Look for workflow-related keys
    const wfKeys = Object.keys(c).filter(k => 
      k.toLowerCase().includes('workflow') || 
      k.toLowerCase().includes('automat')
    );
    console.log("Workflow keys:", wfKeys);
    console.log("Full contact:", JSON.stringify(c, null, 2).substring(0, 3000));
  } else {
    console.log("Response:", JSON.stringify(searchData2, null, 2).substring(0, 2000));
  }
}

main().catch(console.error);
