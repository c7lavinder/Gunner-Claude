/**
 * Script to award XP for today's graded calls
 * Run with: node scripts/award-xp.mjs
 */

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

async function main() {
  const connection = await mysql.createConnection(DATABASE_URL);
  
  try {
    // Get today's graded calls that haven't been rewarded yet
    const [calls] = await connection.execute(`
      SELECT c.id as callId, c.teamMemberId, tm.name as teamMemberName, 
             cg.overallScore, cg.overallGrade
      FROM calls c
      JOIN team_members tm ON c.teamMemberId = tm.id
      JOIN call_grades cg ON c.id = cg.callId
      LEFT JOIN reward_views rv ON rv.callId = c.id AND rv.teamMemberId = c.teamMemberId
      WHERE c.status = 'completed' 
        AND c.classification = 'conversation'
        AND rv.id IS NULL
      ORDER BY c.createdAt DESC
    `);
    
    console.log(`Found ${calls.length} calls to process for XP rewards`);
    
    // XP values
    const XP_REWARDS = {
      GRADED_CALL: 50,
      GRADE_A: 100,
      GRADE_B: 75,
      GRADE_C: 50,
      GRADE_D: 25,
      GRADE_F: 0,
    };
    
    // Level thresholds
    const LEVELS = [
      { level: 1, title: "Rookie", minXp: 0 },
      { level: 2, title: "Rookie", minXp: 500 },
      { level: 3, title: "Closer", minXp: 1500 },
      { level: 4, title: "Closer", minXp: 3000 },
      { level: 5, title: "Veteran", minXp: 5000 },
      { level: 6, title: "Veteran", minXp: 8000 },
      { level: 7, title: "Elite", minXp: 12000 },
      { level: 8, title: "Elite", minXp: 17000 },
      { level: 9, title: "Legend", minXp: 23000 },
      { level: 10, title: "Legend", minXp: 30000 },
    ];
    
    function getLevelInfo(totalXp) {
      let current = LEVELS[0];
      for (const level of LEVELS) {
        if (totalXp >= level.minXp) {
          current = level;
        } else {
          break;
        }
      }
      return current;
    }
    
    const memberXpTotals = {};
    
    for (const call of calls) {
      // Calculate XP for this call
      let xp = XP_REWARDS.GRADED_CALL;
      const grade = call.overallGrade || 'F';
      const gradeXp = XP_REWARDS[`GRADE_${grade}`] || 0;
      xp += gradeXp;
      
      console.log(`Processing call ${call.callId} for ${call.teamMemberName}: Grade ${grade}, Score ${call.overallScore}%, XP: ${xp}`);
      
      // Record the reward view
      await connection.execute(`
        INSERT INTO reward_views (teamMemberId, callId, viewedAt)
        VALUES (?, ?, NOW())
      `, [call.teamMemberId, call.callId]);
      
      // Record XP transaction
      await connection.execute(`
        INSERT INTO xp_transactions (teamMemberId, amount, reason, callId, createdAt)
        VALUES (?, ?, ?, ?, NOW())
      `, [call.teamMemberId, xp, `Graded call (${grade})`, call.callId]);
      
      // Track totals
      if (!memberXpTotals[call.teamMemberId]) {
        memberXpTotals[call.teamMemberId] = { name: call.teamMemberName, xp: 0, calls: 0 };
      }
      memberXpTotals[call.teamMemberId].xp += xp;
      memberXpTotals[call.teamMemberId].calls++;
    }
    
    // Update user_xp totals for each member
    for (const [memberId, data] of Object.entries(memberXpTotals)) {
      // Get current XP
      const [existing] = await connection.execute(`
        SELECT totalXp FROM user_xp WHERE teamMemberId = ?
      `, [memberId]);
      
      let currentXp = 0;
      if (existing.length > 0) {
        currentXp = existing[0].totalXp;
      }
      
      const newTotal = currentXp + data.xp;
      const levelInfo = getLevelInfo(newTotal);
      
      // Upsert user_xp
      await connection.execute(`
        INSERT INTO user_xp (teamMemberId, totalXp, level, title, updatedAt)
        VALUES (?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
          totalXp = VALUES(totalXp),
          level = VALUES(level),
          title = VALUES(title),
          updatedAt = NOW()
      `, [memberId, newTotal, levelInfo.level, levelInfo.title]);
      
      console.log(`\n${data.name}: +${data.xp} XP from ${data.calls} calls → Total: ${newTotal} XP (Level ${levelInfo.level} - ${levelInfo.title})`);
    }
    
    console.log('\n✅ XP awards complete!');
    
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
