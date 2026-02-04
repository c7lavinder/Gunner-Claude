import { db } from './server/db.js';
import { users } from './drizzle/schema.js';
import { like, or } from 'drizzle-orm';

const results = await db.select({
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role
}).from(users).where(
  or(
    like(users.email, '%corey%'),
    like(users.name, '%Corey%')
  )
);

console.log(JSON.stringify(results, null, 2));
process.exit(0);
