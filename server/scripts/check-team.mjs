import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT id, name, teamRole FROM team_members ORDER BY name');
console.log('Current Gunner Team Members:');
console.table(rows);
await conn.end();
