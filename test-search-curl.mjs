import { getDb } from './server/db.ts';
import { ghlOAuthTokens } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';
import fs from 'fs';

async function main() {
  const db = await getDb();
  const tokens = await db.select().from(ghlOAuthTokens).where(eq(ghlOAuthTokens.tenantId, 1));
  if (!tokens.length) { console.log("No token"); return; }
  
  const t = tokens[0];
  fs.writeFileSync('/tmp/ghl_token.txt', t.accessToken);
  fs.writeFileSync('/tmp/ghl_location.txt', t.locationId);
  console.log("Creds saved to /tmp/ghl_token.txt and /tmp/ghl_location.txt");
  process.exit(0);
}
main().catch(console.error);
