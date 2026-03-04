// Check GHL user phone assignments and location phone numbers
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
  
  // 1. Get all GHL users for this location
  console.log('=== GHL USERS ===');
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
    const users = data.users || [];
    for (const u of users) {
      console.log(`\n  Name: ${u.name || u.firstName + ' ' + u.lastName}`);
      console.log(`  ID: ${u.id}`);
      console.log(`  Email: ${u.email}`);
      console.log(`  Phone: ${u.phone}`);
      console.log(`  Role: ${u.role || u.type}`);
      // Check for LC phone fields
      if (u.lcPhone) console.log(`  lcPhone: ${JSON.stringify(u.lcPhone)}`);
      if (u.permissions) console.log(`  permissions keys: ${Object.keys(u.permissions).join(', ')}`);
    }
  } catch (e) {
    console.log('Failed:', e.message);
  }
  
  // 2. Get location phone numbers
  console.log('\n\n=== LOCATION PHONE NUMBERS ===');
  try {
    const resp = await fetch(
      `https://services.leadconnectorhq.com/phone-number/search?locationId=${ghl.locationId}&limit=50`,
      {
        headers: {
          'Authorization': `Bearer ${ghl.accessToken}`,
          'Version': '2021-04-15',
          'Accept': 'application/json',
        }
      }
    );
    const data = await resp.json();
    console.log('Response keys:', Object.keys(data));
    const phones = data.phoneNumbers || data.data || data.numbers || [];
    if (Array.isArray(phones)) {
      for (const p of phones) {
        console.log(`\n  Number: ${p.phoneNumber || p.number || p.phone}`);
        console.log(`  Name: ${p.name || p.friendlyName || 'N/A'}`);
        console.log(`  Assigned To: ${p.assignedTo || p.userId || 'N/A'}`);
        console.log(`  ALL KEYS: ${Object.keys(p).join(', ')}`);
      }
    } else {
      console.log(JSON.stringify(data, null, 2).substring(0, 2000));
    }
  } catch (e) {
    console.log('Failed:', e.message);
  }
  
  // 3. Try the locations API for phone info
  console.log('\n\n=== LOCATION DETAILS ===');
  try {
    const resp = await fetch(
      `https://services.leadconnectorhq.com/locations/${ghl.locationId}`,
      {
        headers: {
          'Authorization': `Bearer ${ghl.accessToken}`,
          'Version': '2021-07-28',
          'Accept': 'application/json',
        }
      }
    );
    const data = await resp.json();
    const loc = data.location || data;
    console.log('  Phone:', loc.phone);
    console.log('  Name:', loc.name);
    if (loc.twilio) console.log('  Twilio:', JSON.stringify(loc.twilio));
  } catch (e) {
    console.log('Failed:', e.message);
  }
  
  await conn.end();
}

main().catch(console.error);
