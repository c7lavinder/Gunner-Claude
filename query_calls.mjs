import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
});

const [rows] = await connection.execute(
  'SELECT id, contactName, duration, status, classificationReason FROM calls WHERE contactName LIKE ? ORDER BY createdAt DESC LIMIT 5',
  ['%Pam%']
);

console.log(JSON.stringify(rows, null, 2));
await connection.end();
