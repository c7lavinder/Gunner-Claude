// Debug: check GHL conversation detail to find which team phone number was contacted
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
  
  // Fetch first few unread conversations
  const resp = await fetch(
    `https://services.leadconnectorhq.com/conversations/search?locationId=${ghl.locationId}&status=unread&limit=3`,
    {
      headers: {
        'Authorization': `Bearer ${ghl.accessToken}`,
        'Version': '2021-04-15',
        'Accept': 'application/json',
      }
    }
  );
  const data = await resp.json();
  const convos = data.conversations || [];
  
  // For each conversation, get the last message to find the "to" phone number
  for (let i = 0; i < Math.min(3, convos.length); i++) {
    const c = convos[i];
    console.log(`\n=== CONVO ${i+1}: ${c.contactName} (${c.phone}) ===`);
    console.log('  assignedTo:', c.assignedTo);
    console.log('  ALL FIELDS:', JSON.stringify(c, null, 2));
    
    // Get messages for this conversation to find the team phone
    try {
      const msgResp = await fetch(
        `https://services.leadconnectorhq.com/conversations/${c.id}/messages?limit=3`,
        {
          headers: {
            'Authorization': `Bearer ${ghl.accessToken}`,
            'Version': '2021-04-15',
            'Accept': 'application/json',
          }
        }
      );
      const msgData = await msgResp.json();
      const msgs = msgData.messages || msgData.data || [];
      console.log(`\n  --- LAST ${msgs.length} MESSAGES ---`);
      for (const m of msgs.slice(0, 3)) {
        console.log(`  MSG: direction=${m.direction}, type=${m.messageType || m.type}`);
        console.log(`    from: ${m.from || 'N/A'}`);
        console.log(`    to: ${m.to || 'N/A'}`);
        console.log(`    phone: ${m.phone || 'N/A'}`);
        console.log(`    userId: ${m.userId || 'N/A'}`);
        console.log(`    ALL MSG KEYS: ${Object.keys(m).join(', ')}`);
      }
    } catch (e) {
      console.log('  Failed to get messages:', e.message);
    }
  }
  
  // Print team member phones for reference
  const [members] = await conn.execute(
    'SELECT name, teamRole, ghlUserId, lcPhone FROM team_members WHERE tenantId = 1'
  );
  console.log('\n=== TEAM MEMBER PHONES ===');
  for (const m of members) {
    console.log(`  ${m.name} (${m.teamRole}): lcPhone=${m.lcPhone}`);
  }
  
  await conn.end();
}

main().catch(console.error);
