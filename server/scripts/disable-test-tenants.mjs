import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// List all CRM-connected tenants
const [rows] = await conn.execute('SELECT id, name, crmConnected FROM tenants WHERE crmConnected = ? ORDER BY id', ['true']);
console.log('CRM-connected tenants:');
for (const row of rows) {
  console.log(`  ${row.id}: ${row.name} (${row.crmConnected})`);
}

// Real tenants to keep: 1 (New Again Houses), 450029 (NAH Kitty Hawk), and any Apex
const realTenantIds = new Set([1, 450029]);
const testTenants = rows.filter(r => !realTenantIds.has(r.id));

console.log('\nTest tenants to disable:');
for (const t of testTenants) {
  console.log(`  ${t.id}: ${t.name}`);
}

if (testTenants.length > 0) {
  const ids = testTenants.map(t => t.id);
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await conn.execute(
    `UPDATE tenants SET crmConnected = 'false' WHERE id IN (${placeholders})`,
    ids
  );
  console.log(`\nDisabled ${result.affectedRows} test tenants`);
}

// Verify
const [after] = await conn.execute('SELECT id, name, crmConnected FROM tenants WHERE crmConnected = ? ORDER BY id', ['true']);
console.log('\nRemaining CRM-connected tenants:');
for (const row of after) {
  console.log(`  ${row.id}: ${row.name}`);
}

await conn.end();
