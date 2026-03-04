// Debug script to check raw GHL conversation response
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const env = process.env;

async function main() {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection(env.DATABASE_URL);
  
  // Get GHL OAuth token for tenant 1
  const [rows] = await conn.execute(
    "SELECT * FROM ghl_oauth_tokens WHERE tenantId = 1 AND isActive = 'true' LIMIT 1"
  );
  
  if (!rows.length) {
    console.log('No active GHL token found for tenant 1');
    await conn.end();
    return;
  }
  
  const ghl = rows[0];
  console.log('GHL Location ID:', ghl.locationId);
  
  // Fetch unread conversations from GHL (limit 50 to get all 26+)
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
  console.log(`\nTotal unread conversations: ${convos.length}`);
  
  // Print first 5 conversations with key fields
  for (let i = 0; i < Math.min(5, convos.length); i++) {
    const c = convos[i];
    console.log(`\n--- CONVO ${i + 1}: ${c.contactName || c.fullName || 'Unknown'} ---`);
    console.log('  id:', c.id);
    console.log('  contactId:', c.contactId);
    console.log('  assignedTo:', c.assignedTo);
    console.log('  userId:', c.userId);
    console.log('  phone:', c.phone);
    console.log('  lastMessageType:', c.lastMessageType);
    console.log('  lastMessageDirection:', c.lastMessageDirection);
    console.log('  ALL KEYS:', Object.keys(c).join(', '));
  }
  
  // Check assignedTo distribution
  const assignedMap = {};
  for (const c of convos) {
    const assigned = c.assignedTo || c.userId || 'NONE';
    assignedMap[assigned] = (assignedMap[assigned] || 0) + 1;
  }
  console.log('\n=== ASSIGNED TO DISTRIBUTION ===');
  for (const [key, count] of Object.entries(assignedMap)) {
    console.log(`  ${key}: ${count} conversations`);
  }
  
  // Get team members to cross-reference
  const [members] = await conn.execute(
    'SELECT id, name, ghlUserId, teamRole, lcPhone FROM team_members WHERE tenantId = 1'
  );
  console.log('\n=== TEAM MEMBERS (tenant 1) ===');
  for (const m of members) {
    console.log(`  ${m.name} | role: ${m.teamRole} | ghlUserId: ${m.ghlUserId} | lcPhone: ${m.lcPhone}`);
  }
  
  // Cross-reference: which assignedTo values match team members?
  const ghlUserIds = new Set(members.map(m => m.ghlUserId).filter(Boolean));
  console.log('\n=== MATCHING ===');
  for (const [assignedId, count] of Object.entries(assignedMap)) {
    const member = members.find(m => m.ghlUserId === assignedId);
    console.log(`  ${assignedId}: ${count} convos → ${member ? member.name + ' (' + member.teamRole + ')' : 'NO MATCH'}`);
  }
  
  await conn.end();
}

main().catch(console.error);
