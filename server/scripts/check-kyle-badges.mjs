import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { eq, sql, and } from 'drizzle-orm';
import * as schema from '../drizzle/schema.js';

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true }
});

const db = drizzle(connection, { schema, mode: 'default' });

// Find Kyle's team member record
const kyleTeamMember = await db.select()
  .from(schema.teamMembers)
  .where(sql`${schema.teamMembers.name} LIKE '%Kyle%'`)
  .limit(1);

console.log('Kyle team member:', kyleTeamMember);

if (kyleTeamMember.length > 0) {
  const teamMemberId = kyleTeamMember[0].id;
  
  // Get Kyle's graded calls
  const gradedCalls = await db.select()
    .from(schema.calls)
    .where(and(
      eq(schema.calls.teamMemberId, teamMemberId),
      eq(schema.calls.status, 'completed')
    ));
  console.log(`Kyle has ${gradedCalls.length} graded calls`);
  
  // Get Kyle's badges
  const badges = await db.select()
    .from(schema.userBadges)
    .where(eq(schema.userBadges.teamMemberId, teamMemberId));
  console.log(`Kyle has ${badges.length} badges:`, badges);
  
  // Get badge progress
  const progress = await db.select()
    .from(schema.badgeProgress)
    .where(eq(schema.badgeProgress.teamMemberId, teamMemberId));
  console.log('Badge progress:', progress);
  
  // Get all available badges
  const allBadges = await db.select().from(schema.badges).limit(10);
  console.log('Available badges:', allBadges);
  
  // Check if badges are being awarded - look at call grades
  const callGrades = gradedCalls.slice(0, 5).map(c => ({
    id: c.id,
    contactName: c.contactName,
    overallGrade: c.overallGrade,
    overallScore: c.overallScore,
    status: c.status
  }));
  console.log('Sample call grades:', callGrades);
}

await connection.end();
