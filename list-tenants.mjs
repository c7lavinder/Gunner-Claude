import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [tenants] = await conn.execute('SELECT id, name FROM tenants ORDER BY id');
console.log('=== TENANTS ===');
tenants.forEach(t => console.log(`ID: ${t.id}, Name: ${t.name}`));

const [users] = await conn.execute('SELECT COUNT(*) as cnt FROM users');
console.log(`\n=== USERS: ${users[0].cnt} ===`);

const [spamUsers] = await conn.execute('SELECT COUNT(*) as cnt FROM users WHERE tenant_id NOT IN (1, 2, 3, 4, 5)');
console.log(`Spam users (non-legit tenant): ${spamUsers[0].cnt}`);

const [tokens] = await conn.execute('SELECT COUNT(*) as cnt FROM email_verification_tokens');
console.log(`Email verification tokens: ${tokens[0].cnt}`);

await conn.end();
