// Check who BhVAeJjAfojeX9AJdqbf is in GHL
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
  
  // Try to get user info from GHL
  const unknownId = 'BhVAeJjAfojeX9AJdqbf';
  
  // Check if this is the location's own user ID
  console.log('GHL token ghlUserId:', ghl.ghlUserId);
  
  // Check users table for this GHL ID
  const [users] = await conn.execute(
    "SELECT id, name, email, role FROM users WHERE tenantId = 1"
  );
  console.log('\n=== USERS (tenant 1) ===');
  for (const u of users) {
    console.log(`  ${u.name} | email: ${u.email} | role: ${u.role}`);
  }
  
  // Try GHL users API
  try {
    const resp = await fetch(
      `https://services.leadconnectorhq.com/users/${unknownId}`,
      {
        headers: {
          'Authorization': `Bearer ${ghl.accessToken}`,
          'Version': '2021-07-28',
          'Accept': 'application/json',
        }
      }
    );
    const data = await resp.json();
    console.log('\n=== GHL USER INFO for', unknownId, '===');
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Failed to fetch GHL user:', e.message);
  }
  
  // Also try location users list
  try {
    const resp = await fetch(
      `https://services.leadconnectorhq.com/users/search?companyId=${ghl.companyId}&locationId=${ghl.locationId}`,
      {
        headers: {
          'Authorization': `Bearer ${ghl.accessToken}`,
          'Version': '2021-07-28',
          'Accept': 'application/json',
        }
      }
    );
    const data = await resp.json();
    console.log('\n=== ALL GHL LOCATION USERS ===');
    for (const u of (data.users || [])) {
      console.log(`  ${u.name || u.firstName + ' ' + u.lastName} | id: ${u.id} | email: ${u.email} | role: ${u.role || u.type}`);
    }
  } catch (e) {
    console.log('Failed to fetch location users:', e.message);
  }
  
  await conn.end();
}

main().catch(console.error);
