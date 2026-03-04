// Check which team phones appear across multiple conversations
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
  
  // Fetch unread conversations
  const resp = await fetch(
    `https://services.leadconnectorhq.com/conversations/search?locationId=${ghl.locationId}&status=unread&limit=50`,
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
  
  // Sample 8 conversations - get last message to find team phone
  const teamPhones = {};
  const assignedToPhoneMap = {};
  
  for (let i = 0; i < Math.min(8, convos.length); i++) {
    const c = convos[i];
    try {
      const msgResp = await fetch(
        `https://services.leadconnectorhq.com/conversations/${c.id}/messages?limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${ghl.accessToken}`,
            'Version': '2021-04-15',
            'Accept': 'application/json',
          }
        }
      );
      const msgData = await msgResp.json();
      const msgs = msgData.messages?.messages || [];
      if (msgs.length > 0) {
        const m = msgs[0];
        // For inbound: "to" is our phone. For outbound: "from" is our phone
        const ourPhone = m.direction === 'inbound' ? m.to : m.from;
        const leadPhone = m.direction === 'inbound' ? m.from : m.to;
        
        teamPhones[ourPhone] = (teamPhones[ourPhone] || 0) + 1;
        
        if (!assignedToPhoneMap[c.assignedTo]) assignedToPhoneMap[c.assignedTo] = {};
        assignedToPhoneMap[c.assignedTo][ourPhone] = (assignedToPhoneMap[c.assignedTo][ourPhone] || 0) + 1;
        
        console.log(`${c.contactName} | assigned: ${c.assignedTo} | ourPhone: ${ourPhone} | type: ${m.messageType}`);
      }
    } catch (e) {
      console.log(`Failed for ${c.contactName}: ${e.message}`);
    }
  }
  
  console.log('\n=== TEAM PHONES SEEN ===');
  for (const [phone, count] of Object.entries(teamPhones)) {
    console.log(`  ${phone}: ${count} conversations`);
  }
  
  console.log('\n=== ASSIGNED TO → PHONE MAPPING ===');
  for (const [assigned, phones] of Object.entries(assignedToPhoneMap)) {
    console.log(`  ${assigned}:`);
    for (const [phone, count] of Object.entries(phones)) {
      console.log(`    ${phone}: ${count}`);
    }
  }
  
  // Team member reference
  const [members] = await conn.execute(
    'SELECT name, teamRole, ghlUserId, lcPhone FROM team_members WHERE tenantId = 1'
  );
  console.log('\n=== TEAM MEMBERS ===');
  for (const m of members) {
    console.log(`  ${m.name} (${m.teamRole}): ghlUserId=${m.ghlUserId} lcPhone=${m.lcPhone}`);
  }
  
  await conn.end();
}

main().catch(console.error);
