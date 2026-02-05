import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Get Kyle's team member ID
  const [kyleRows] = await connection.execute(
    "SELECT id, name, teamRole FROM team_members WHERE name LIKE '%Kyle%'"
  );
  console.log("Kyle:", kyleRows);
  
  if (kyleRows.length === 0) {
    console.log("Kyle not found");
    await connection.end();
    return;
  }
  
  const kyleId = kyleRows[0].id;
  
  // Get Kyle's graded calls count
  const [callsRows] = await connection.execute(
    "SELECT COUNT(*) as count FROM calls WHERE teamMemberId = ? AND status = 'completed'",
    [kyleId]
  );
  console.log("Kyle's graded calls:", callsRows[0].count);
  
  // Get Kyle's badge progress
  const [progressRows] = await connection.execute(
    "SELECT * FROM badge_progress WHERE teamMemberId = ?",
    [kyleId]
  );
  console.log("Kyle's badge progress:", progressRows);
  
  // Get Kyle's earned badges
  const [badgesRows] = await connection.execute(
    "SELECT ub.*, b.name, b.tier FROM user_badges ub JOIN badges b ON ub.badgeId = b.id WHERE ub.teamMemberId = ?",
    [kyleId]
  );
  console.log("Kyle's earned badges:", badgesRows);
  
  // Check if badges table has entries
  const [allBadges] = await connection.execute("SELECT * FROM badges LIMIT 5");
  console.log("Sample badges in DB:", allBadges);
  
  await connection.end();
}
main();
