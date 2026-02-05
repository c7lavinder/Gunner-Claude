import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await connection.execute('SHOW COLUMNS FROM badge_progress');
  console.log("badge_progress columns:");
  console.log(JSON.stringify(rows, null, 2));
  await connection.end();
}
main();
