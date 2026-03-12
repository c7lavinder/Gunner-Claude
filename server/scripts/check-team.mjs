import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT id, name, teamRole FROM team_members ORDER BY name');
console.info('Current Gunner Team Members:');
console.log(rows);
await conn.end();
