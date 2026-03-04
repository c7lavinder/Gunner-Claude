import { getDb } from "./server/db.ts";
import { ghlOAuthTokens } from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";

const db = await getDb();

// Get OAuth token for tenant 1
const tokens = await db.select().from(ghlOAuthTokens).where(eq(ghlOAuthTokens.tenantId, 1));
const token = tokens[0];

// Fetch Cathy Peacock's full contact record to see all fields
const contactId = "GHJFE9qzKeW3mUtAvRlt";
const resp = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
  headers: {
    "Authorization": `Bearer ${token.accessToken}`,
    "Version": "2021-07-28",
    "Accept": "application/json",
  },
});

const data = await resp.json();
const contact = data.contact || data;

// Print all top-level keys
console.log("\n=== Top-level keys ===");
console.log(Object.keys(contact));

// Look for workflow-related fields
const workflowKeys = Object.keys(contact).filter(k => 
  k.toLowerCase().includes("workflow") || 
  k.toLowerCase().includes("automation") || 
  k.toLowerCase().includes("campaign") ||
  k.toLowerCase().includes("sequence")
);
console.log("\n=== Workflow-related keys ===");
console.log(workflowKeys);

for (const key of workflowKeys) {
  console.log(`\n${key}:`, JSON.stringify(contact[key], null, 2));
}

// Also check tags
if (contact.tags) {
  console.log("\n=== Tags ===");
  console.log(contact.tags);
}

// Print the full contact for inspection (truncated)
const fullJson = JSON.stringify(contact, null, 2);
console.log("\n=== Full contact (first 5000 chars) ===");
console.log(fullJson.substring(0, 5000));

process.exit(0);
