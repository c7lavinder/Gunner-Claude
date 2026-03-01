import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT id, name, crmConnected FROM tenants WHERE id >= 840000 ORDER BY id');
console.log('Tenants in 840xxx range:');
for (const row of rows) { console.log(`  ${row.id}: ${row.name} (crm=${row.crmConnected})`); }

// Also check if BatchDialer sync has similar test tenant problem
const [bdRows] = await conn.execute("SELECT id, name, crmConnected FROM tenants WHERE name LIKE '%Test%' OR name LIKE '%Pipeline%' OR name LIKE '%Stage%' OR name LIKE '%Settings%' OR name LIKE '%Config%' ORDER BY id");
console.log('\nPotential test tenants:');
for (const row of bdRows) { console.log(`  ${row.id}: ${row.name} (crm=${row.crmConnected})`); }

await conn.end();
