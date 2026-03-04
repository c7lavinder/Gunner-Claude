// Dump full GHL contact response to find workflow/automation fields
import { getDb } from './server/db.ts';
import { ghlOAuthTokens } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  
  // Get OAuth token for tenant 1
  const tokens = await db.select().from(ghlOAuthTokens).where(eq(ghlOAuthTokens.tenantId, 1));
  if (!tokens.length) { console.log("No OAuth token found"); return; }
  
  const token = tokens[0];
  const locationId = token.locationId;
  const accessToken = token.accessToken;
  
  // Search for Cathy Peacock
  const searchRes = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=Cathy Peacock&limit=1`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-07-28',
      'Accept': 'application/json'
    }
  });
  const searchData = await searchRes.json();
  const contactId = searchData.contacts?.[0]?.id;
  console.log("Contact ID:", contactId);
  
  if (!contactId) { console.log("Contact not found"); return; }
  
  // Get FULL contact details
  const contactRes = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-07-28',
      'Accept': 'application/json'
    }
  });
  const contactData = await contactRes.json();
  
  // Dump ALL keys at the top level
  console.log("\n=== TOP-LEVEL KEYS ===");
  console.log(Object.keys(contactData));
  
  if (contactData.contact) {
    console.log("\n=== CONTACT OBJECT KEYS ===");
    console.log(Object.keys(contactData.contact));
    
    // Look for workflow/automation related fields
    const workflowKeys = Object.keys(contactData.contact).filter(k => 
      k.toLowerCase().includes('workflow') || 
      k.toLowerCase().includes('automat') || 
      k.toLowerCase().includes('campaign') ||
      k.toLowerCase().includes('sequence')
    );
    console.log("\n=== WORKFLOW-RELATED KEYS ===");
    console.log(workflowKeys);
    
    // Print values for any workflow-related keys
    for (const key of workflowKeys) {
      console.log(`\n${key}:`, JSON.stringify(contactData.contact[key], null, 2));
    }
    
    // Also dump the full contact to see everything
    console.log("\n=== FULL CONTACT JSON ===");
    console.log(JSON.stringify(contactData.contact, null, 2));
  }
}

main().catch(console.error);
