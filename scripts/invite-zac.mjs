// Quick script to invite Zac Chrisman to his tenant
// Uses the same DB connection and logic as the app

import mysql from 'mysql2/promise';
import crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

const email = 'zchrisman@newagainhouses.com';
const tenantId = 450029;
const role = 'admin';
const teamRole = 'admin';

// Check if invitation already exists
const [existing] = await conn.execute(
  "SELECT * FROM pending_invitations WHERE tenantId = ? AND email = ? AND status = 'pending'",
  [tenantId, email.toLowerCase()]
);

if (existing.length > 0) {
  console.log('Pending invitation already exists:', existing[0]);
  await conn.end();
  process.exit(0);
}

// Create the invite token
const inviteToken = crypto.randomUUID().replace(/-/g, '');
const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

// Insert pending invitation
await conn.execute(
  `INSERT INTO pending_invitations (tenantId, email, role, teamRole, inviteToken, expiresAt, status, createdAt, updatedAt) 
   VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
  [tenantId, email.toLowerCase(), role, teamRole, inviteToken, expiresAt]
);

console.log('✅ Pending invitation created for', email);
console.log('   Tenant ID:', tenantId);
console.log('   Role:', role);
console.log('   Team Role:', teamRole);
console.log('   Invite Token:', inviteToken);
console.log('   Signup URL: https://getgunner.ai/signup?invite=' + inviteToken);

await conn.end();
