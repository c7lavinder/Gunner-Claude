// Debug: check GHL messages to find the team phone number
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const env = process.env;

async function main() {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection(env.DATABASE_URL);
  
  const [rows] = await conn.execute(
    "SELECT * FROM ghl_oauth_tokens WHERE tenantId = 1 AND isActive = 'true' LIMIT 1"
  );
  const ghl = rows[0];
  
  // Pick a known conversation ID
  const convoId = 'SCTj5y9bppiywmgTIpRM'; // Margaret Davis
  
  const msgResp = await fetch(
    `https://services.leadconnectorhq.com/conversations/${convoId}/messages?limit=5&type=TYPE_SMS`,
    {
      headers: {
        'Authorization': `Bearer ${ghl.accessToken}`,
        'Version': '2021-04-15',
        'Accept': 'application/json',
      }
    }
  );
  const msgData = await msgResp.json();
  console.log('=== RAW MESSAGES RESPONSE KEYS ===');
  console.log(Object.keys(msgData));
  
  // Try different response shapes
  const msgs = msgData.messages || msgData.data || [];
  if (Array.isArray(msgs)) {
    console.log(`\nFound ${msgs.length} messages`);
    for (const m of msgs.slice(0, 3)) {
      console.log('\n--- MESSAGE ---');
      console.log(JSON.stringify(m, null, 2));
    }
  } else {
    console.log('\nMessages response (not array):');
    console.log(JSON.stringify(msgData, null, 2).substring(0, 2000));
  }
  
  // Also try the v2 messages endpoint
  console.log('\n\n=== TRYING V2 MESSAGES ===');
  const msgResp2 = await fetch(
    `https://services.leadconnectorhq.com/conversations/${convoId}/messages?limit=5`,
    {
      headers: {
        'Authorization': `Bearer ${ghl.accessToken}`,
        'Version': '2021-04-15',
        'Accept': 'application/json',
      }
    }
  );
  const msgData2 = await msgResp2.json();
  console.log('Keys:', Object.keys(msgData2));
  const msgs2 = msgData2.messages || [];
  if (Array.isArray(msgs2) && msgs2.length > 0) {
    console.log(`Found ${msgs2.length} messages`);
    for (const m of msgs2.slice(0, 2)) {
      console.log('\n--- MSG ---');
      console.log(JSON.stringify(m, null, 2));
    }
  } else if (typeof msgs2 === 'object' && !Array.isArray(msgs2)) {
    // Maybe it's paginated differently
    console.log('Messages object:', JSON.stringify(msgData2, null, 2).substring(0, 2000));
  }
  
  await conn.end();
}

main().catch(console.error);
