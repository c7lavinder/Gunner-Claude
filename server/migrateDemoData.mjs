import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const REAL_TENANT_ID = 1;
const DEMO_TENANT_ID = 540044;

// Map real team members to demo team members
const TEAM_MEMBER_MAP = {
  2: 360060,   // Daniel Lozano -> Marcus Rivera
  3: 360061,   // Kyle Barks -> Tanya Brooks
  1: 360062,   // Chris Segura -> Jason Whitfield
};

const TEAM_NAME_MAP = {
  'Daniel Lozano': 'Marcus Rivera',
  'Kyle Barks': 'Tanya Brooks',
  'Chris Segura': 'Jason Whitfield',
};

// Fake contact names to replace real ones
const FAKE_NAMES = [
  'Sarah Mitchell', 'James Henderson', 'Patricia Morales', 'Robert Chen',
  'Linda Vasquez', 'Michael Torres', 'Karen Nguyen', 'David Patel',
  'Nancy Sullivan', 'Thomas Wright', 'Betty Crawford', 'Christopher Lee',
  'Sandra Martinez', 'William Davis', 'Dorothy Johnson', 'Richard Garcia',
  'Margaret Wilson', 'Joseph Brown', 'Lisa Anderson', 'Charles Taylor',
  'Ashley Moore', 'Daniel Jackson', 'Emily White', 'Matthew Harris',
  'Jennifer Clark', 'Anthony Lewis', 'Amanda Robinson', 'Mark Walker',
  'Melissa Young', 'Steven King', 'Rebecca Scott', 'Paul Green',
  'Laura Adams', 'Kevin Baker', 'Stephanie Nelson', 'Brian Hill',
  'Nicole Campbell', 'George Mitchell', 'Samantha Roberts', 'Edward Carter',
  'Rachel Phillips', 'Ronald Evans', 'Heather Turner', 'Timothy Parker',
  'Deborah Edwards', 'Jason Collins', 'Sharon Stewart', 'Jeffrey Morris',
  'Cynthia Rogers', 'Ryan Reed', 'Kathleen Cook', 'Jacob Morgan',
  'Angela Bell', 'Gary Murphy', 'Diane Bailey', 'Nicholas Rivera',
  'Virginia Cooper', 'Eric Richardson', 'Julie Cox', 'Stephen Howard',
  'Marie Ward', 'Jonathan Torres', 'Christina Peterson', 'Larry Gray',
  'Kelly Ramirez', 'Frank James', 'Pamela Watson', 'Scott Brooks',
  'Brenda Kelly', 'Raymond Sanders', 'Tammy Price', 'Benjamin Bennett',
  'Tracy Wood', 'Gregory Barnes', 'Carolyn Ross', 'Dennis Henderson',
  'Janet Powell', 'Jerry Long', 'Catherine Patterson', 'Tyler Hughes',
  'Maria Flores', 'Harold Washington', 'Donna Butler', 'Peter Simmons',
  'Ruth Foster', 'Henry Gonzales', 'Anna Bryant', 'Carl Alexander',
  'Jacqueline Russell', 'Arthur Griffin', 'Theresa Diaz', 'Albert Hayes',
  'Beverly Myers', 'Roger Ford', 'Gloria Hamilton', 'Joe Graham',
  'Evelyn Sullivan', 'Juan McDonald', 'Megan Cruz', 'Wayne Marshall',
  'Cheryl Owens', 'Ralph Burns', 'Jean Gutierrez', 'Roy Perkins',
];

// Fake addresses
const FAKE_STREETS = [
  'Oak', 'Maple', 'Cedar', 'Elm', 'Pine', 'Birch', 'Walnut', 'Willow',
  'Hickory', 'Ash', 'Magnolia', 'Sycamore', 'Poplar', 'Chestnut', 'Cypress',
  'Dogwood', 'Laurel', 'Juniper', 'Spruce', 'Holly',
];
const FAKE_SUFFIXES = ['St', 'Ave', 'Dr', 'Ln', 'Blvd', 'Ct', 'Way', 'Rd'];
const FAKE_CITIES = [
  'Dallas, TX', 'Fort Worth, TX', 'Arlington, TX', 'Plano, TX', 'Irving, TX',
  'Garland, TX', 'McKinney, TX', 'Frisco, TX', 'Denton, TX', 'Mesquite, TX',
  'Carrollton, TX', 'Richardson, TX', 'Lewisville, TX', 'Allen, TX', 'Flower Mound, TX',
];

function randomFakeAddress() {
  const num = Math.floor(Math.random() * 9000) + 100;
  const street = FAKE_STREETS[Math.floor(Math.random() * FAKE_STREETS.length)];
  const suffix = FAKE_SUFFIXES[Math.floor(Math.random() * FAKE_SUFFIXES.length)];
  const city = FAKE_CITIES[Math.floor(Math.random() * FAKE_CITIES.length)];
  return `${num} ${street} ${suffix}, ${city}`;
}

// Replace names in text content (transcripts, summaries, etc.)
function replaceNamesInText(text, nameMap) {
  if (!text) return text;
  // Handle Buffer objects from MySQL
  if (Buffer.isBuffer(text)) text = text.toString('utf8');
  // Handle JSON objects/arrays - serialize, replace, parse back
  if (typeof text === 'object') {
    let jsonStr = JSON.stringify(text);
    for (const [realName, fakeName] of Object.entries(nameMap)) {
      jsonStr = jsonStr.replace(new RegExp(escapeRegex(realName), 'gi'), fakeName);
      const realFirst = realName.split(' ')[0];
      const fakeFirst = fakeName.split(' ')[0];
      jsonStr = jsonStr.replace(new RegExp(`\\b${escapeRegex(realFirst)}\\b`, 'gi'), fakeFirst);
    }
    for (const [realName, fakeName] of Object.entries(TEAM_NAME_MAP)) {
      jsonStr = jsonStr.replace(new RegExp(escapeRegex(realName), 'gi'), fakeName);
      const realFirst = realName.split(' ')[0];
      const fakeFirst = fakeName.split(' ')[0];
      jsonStr = jsonStr.replace(new RegExp(`\\b${escapeRegex(realFirst)}\\b`, 'gi'), fakeFirst);
    }
    try { return JSON.parse(jsonStr); } catch { return text; }
  }
  if (typeof text !== 'string') return text;
  let result = text;
  for (const [realName, fakeName] of Object.entries(nameMap)) {
    // Replace full name
    result = result.replace(new RegExp(escapeRegex(realName), 'gi'), fakeName);
    // Replace first name only
    const realFirst = realName.split(' ')[0];
    const fakeFirst = fakeName.split(' ')[0];
    result = result.replace(new RegExp(`\\b${escapeRegex(realFirst)}\\b`, 'gi'), fakeFirst);
  }
  // Also replace team member names in transcripts
  for (const [realName, fakeName] of Object.entries(TEAM_NAME_MAP)) {
    result = result.replace(new RegExp(escapeRegex(realName), 'gi'), fakeName);
    const realFirst = realName.split(' ')[0];
    const fakeFirst = fakeName.split(' ')[0];
    result = result.replace(new RegExp(`\\b${escapeRegex(realFirst)}\\b`, 'gi'), fakeFirst);
  }
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('=== Demo Data Migration ===');
  
  // Step 1: Delete existing demo calls and grades
  console.log('\n1. Cleaning existing demo data...');
  await conn.query('DELETE FROM call_grades WHERE tenantId = ?', [DEMO_TENANT_ID]);
  await conn.query('DELETE FROM opportunities WHERE tenantId = ?', [DEMO_TENANT_ID]);
  await conn.query('DELETE FROM coach_action_log WHERE tenantId = ?', [DEMO_TENANT_ID]);
  await conn.query('DELETE FROM coach_messages WHERE tenantId = ?', [DEMO_TENANT_ID]);
  await conn.query('DELETE FROM calls WHERE tenantId = ?', [DEMO_TENANT_ID]);
  // Clean gamification data
  await conn.query('DELETE FROM badge_progress WHERE tenantId = ?', [DEMO_TENANT_ID]);
  await conn.query('DELETE FROM user_badges WHERE tenantId = ?', [DEMO_TENANT_ID]);
  await conn.query('DELETE FROM user_streaks WHERE tenantId = ?', [DEMO_TENANT_ID]);
  await conn.query('DELETE FROM xp_transactions WHERE tenantId = ?', [DEMO_TENANT_ID]);
  await conn.query('DELETE FROM user_xp WHERE tenantId = ?', [DEMO_TENANT_ID]);
  console.log('   Cleaned existing demo data.');
  
  // Step 2: Fetch real calls with grades (non-F + some F)
  console.log('\n2. Fetching real calls...');
  
  // Get all non-F graded calls
  const [nonFCalls] = await conn.query(`
    SELECT c.*, cg.overallScore, cg.overallGrade, cg.criteriaScores, cg.strengths, 
           cg.improvements, cg.coachingTips, cg.redFlags, cg.summary, cg.rubricType,
           cg.objectionHandling, cg.tenantRubricId
    FROM calls c 
    JOIN call_grades cg ON cg.callId = c.id 
    WHERE c.tenantId = ? AND c.status = 'completed' AND cg.overallGrade != 'F'
    ORDER BY c.callTimestamp ASC
  `, [REAL_TENANT_ID]);
  console.log(`   Found ${nonFCalls.length} non-F calls`);
  
  // Get some F calls with longer transcripts (more substance)
  const [fCalls] = await conn.query(`
    SELECT c.*, cg.overallScore, cg.overallGrade, cg.criteriaScores, cg.strengths, 
           cg.improvements, cg.coachingTips, cg.redFlags, cg.summary, cg.rubricType,
           cg.objectionHandling, cg.tenantRubricId
    FROM calls c 
    JOIN call_grades cg ON cg.callId = c.id 
    WHERE c.tenantId = ? AND c.status = 'completed' AND cg.overallGrade = 'F'
      AND c.duration > 60 AND cg.overallScore >= 15
    ORDER BY cg.overallScore DESC
    LIMIT 20
  `, [REAL_TENANT_ID]);
  console.log(`   Found ${fCalls.length} selected F calls (score >= 15, duration > 60s)`);
  
  const allCalls = [...nonFCalls, ...fCalls];
  console.log(`   Total calls to migrate: ${allCalls.length}`);
  
  // Step 3: Build contact name mapping
  const contactNameMap = {};
  let nameIdx = 0;
  for (const call of allCalls) {
    if (call.contactName && !contactNameMap[call.contactName]) {
      contactNameMap[call.contactName] = FAKE_NAMES[nameIdx % FAKE_NAMES.length];
      nameIdx++;
    }
  }
  console.log(`\n3. Mapped ${Object.keys(contactNameMap).length} contact names`);
  
  // Step 4: Adjust timestamps for upward trend
  // Sort all calls by timestamp, then redistribute over 6 weeks ending today
  allCalls.sort((a, b) => new Date(a.callTimestamp) - new Date(b.callTimestamp));
  
  // Also sort by grade within time blocks to create upward trend
  // Split into 6 weekly blocks, put worse grades earlier
  const gradeOrder = { 'F': 0, 'D': 1, 'C': 2, 'B': 3, 'A': 4 };
  const totalCalls = allCalls.length;
  const now = new Date();
  const sixWeeksAgo = new Date(now.getTime() - 42 * 24 * 60 * 60 * 1000);
  
  // Assign calls to weeks with grade-based bias
  // Week 1-2: more F/D calls, Week 3-4: more C/B, Week 5-6: more B/A
  const weekBuckets = [[], [], [], [], [], []];
  
  // Sort by grade
  const sortedByGrade = [...allCalls].sort((a, b) => gradeOrder[a.overallGrade] - gradeOrder[b.overallGrade]);
  
  // Distribute with bias: worse grades go to earlier weeks
  for (let i = 0; i < sortedByGrade.length; i++) {
    const call = sortedByGrade[i];
    const grade = call.overallGrade;
    let targetWeek;
    
    // Add some randomness but bias toward the right weeks
    const rand = Math.random();
    if (grade === 'F') {
      targetWeek = rand < 0.5 ? 0 : rand < 0.8 ? 1 : 2;
    } else if (grade === 'D') {
      targetWeek = rand < 0.3 ? 0 : rand < 0.6 ? 1 : rand < 0.85 ? 2 : 3;
    } else if (grade === 'C') {
      targetWeek = rand < 0.1 ? 1 : rand < 0.4 ? 2 : rand < 0.7 ? 3 : 4;
    } else if (grade === 'B') {
      targetWeek = rand < 0.1 ? 2 : rand < 0.3 ? 3 : rand < 0.65 ? 4 : 5;
    } else { // A
      targetWeek = rand < 0.15 ? 3 : rand < 0.4 ? 4 : 5;
    }
    
    weekBuckets[targetWeek].push(call);
  }
  
  // Assign timestamps within each week
  const processedCalls = [];
  for (let week = 0; week < 6; week++) {
    const weekStart = new Date(sixWeeksAgo.getTime() + week * 7 * 24 * 60 * 60 * 1000);
    const bucket = weekBuckets[week];
    
    for (let j = 0; j < bucket.length; j++) {
      const call = bucket[j];
      // Spread calls across the week (Mon-Fri, 9am-5pm CST)
      const dayOffset = Math.floor(j / Math.max(1, Math.ceil(bucket.length / 5)));
      const day = Math.min(dayOffset, 4); // Mon-Fri
      const hour = 9 + Math.floor(Math.random() * 8); // 9am-5pm
      const minute = Math.floor(Math.random() * 60);
      
      const callDate = new Date(weekStart);
      callDate.setDate(callDate.getDate() + day);
      callDate.setHours(hour, minute, Math.floor(Math.random() * 60), 0);
      
      call._newTimestamp = callDate;
      processedCalls.push(call);
    }
  }
  
  // Sort by new timestamp
  processedCalls.sort((a, b) => a._newTimestamp - b._newTimestamp);
  
  console.log(`\n4. Redistributed ${processedCalls.length} calls across 6 weeks with upward trend`);
  
  // Print week summary
  for (let w = 0; w < 6; w++) {
    const weekCalls = weekBuckets[w];
    const grades = weekCalls.map(c => c.overallGrade);
    const avgScore = weekCalls.reduce((s, c) => s + parseFloat(c.overallScore), 0) / weekCalls.length;
    console.log(`   Week ${w+1}: ${weekCalls.length} calls, avg score ${avgScore.toFixed(1)}, grades: ${grades.join(', ')}`);
  }
  
  // Step 5: Insert calls and grades
  console.log('\n5. Inserting demo calls and grades...');
  
  // Demo team members: Marcus(360060), Tanya(360061), Jason(360062), Brianna(360063), Derek(360064)
  const demoTeamIds = [360060, 360061, 360062, 360063, 360064];
  
  let inserted = 0;
  for (const call of processedCalls) {
    // Map team member
    let newTeamMemberId = TEAM_MEMBER_MAP[call.teamMemberId];
    if (!newTeamMemberId) {
      // Assign to random demo team member
      newTeamMemberId = demoTeamIds[Math.floor(Math.random() * demoTeamIds.length)];
    }
    
    // Map team member name
    let newTeamMemberName = call.teamMemberName;
    if (TEAM_NAME_MAP[call.teamMemberName]) {
      newTeamMemberName = TEAM_NAME_MAP[call.teamMemberName];
    } else {
      // Look up by ID
      const demoNames = { 360060: 'Marcus Rivera', 360061: 'Tanya Brooks', 360062: 'Jason Whitfield', 360063: 'Brianna Cole', 360064: 'Derek Lawson' };
      newTeamMemberName = demoNames[newTeamMemberId] || 'Unknown';
    }
    
    // Map contact name
    const newContactName = contactNameMap[call.contactName] || call.contactName;
    
    // Replace names in text fields
    const fullNameMap = { ...contactNameMap };
    const newTranscript = replaceNamesInText(call.transcript, fullNameMap);
    const newSummary = replaceNamesInText(call.summary, fullNameMap);
    const newStrengths = replaceNamesInText(call.strengths, fullNameMap);
    const newImprovements = replaceNamesInText(call.improvements, fullNameMap);
    const newCoachingTips = replaceNamesInText(call.coachingTips, fullNameMap);
    const newRedFlags = replaceNamesInText(call.redFlags, fullNameMap);
    const newObjectionHandling = replaceNamesInText(call.objectionHandling, fullNameMap);
    
    // Fake address
    const newAddress = call.propertyAddress ? randomFakeAddress() : null;
    
    // Insert call
    const [callResult] = await conn.query(`
      INSERT INTO calls (tenantId, callSource, contactName, contactPhone, propertyAddress,
        duration, callDirection, teamMemberId, teamMemberName, callType, status, transcript,
        callTimestamp, createdAt, updatedAt, classification, classificationReason, callOutcome,
        isArchived, callTypeSource)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, ?, 'false', ?)
    `, [
      DEMO_TENANT_ID,
      'ghl',
      newContactName,
      call.contactPhone ? '555' + call.contactPhone.slice(-7) : null,
      newAddress,
      call.duration,
      call.callDirection,
      newTeamMemberId,
      newTeamMemberName,
      call.callType,
      'completed',
      newTranscript,
      call._newTimestamp,
      call.classification,
      call.classificationReason,
      call.callOutcome,
      call.callTypeSource,
    ]);
    
    const newCallId = callResult.insertId;
    
    // Insert grade - JSON fields need to be serialized properly
    const serializeJson = (val) => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'string') return val;
      return JSON.stringify(val);
    };
    
    await conn.query(`
      INSERT INTO call_grades (tenantId, callId, overallScore, overallGrade, criteriaScores,
        strengths, improvements, coachingTips, redFlags, summary, rubricType, createdAt,
        objectionHandling)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
    `, [
      DEMO_TENANT_ID,
      newCallId,
      call.overallScore,
      call.overallGrade,
      serializeJson(call.criteriaScores),
      serializeJson(newStrengths),
      serializeJson(newImprovements),
      serializeJson(newCoachingTips),
      serializeJson(newRedFlags),
      newSummary, // text field, not JSON
      serializeJson(call.rubricType),
      serializeJson(newObjectionHandling),
    ]);
    
    inserted++;
  }
  
  console.log(`   Inserted ${inserted} calls with grades`);
  
  // Step 6: Verify
  console.log('\n6. Verification:');
  const [demoGrades] = await conn.query(`
    SELECT cg.overallGrade, COUNT(*) as cnt, ROUND(AVG(cg.overallScore),1) as avgScore
    FROM call_grades cg JOIN calls c ON cg.callId = c.id 
    WHERE c.tenantId = ? GROUP BY cg.overallGrade ORDER BY avgScore DESC
  `, [DEMO_TENANT_ID]);
  console.log('   Grade distribution:', JSON.stringify(demoGrades));
  
  const [demoDateRange] = await conn.query('SELECT MIN(callTimestamp) as earliest, MAX(callTimestamp) as latest, COUNT(*) as total FROM calls WHERE tenantId = ?', [DEMO_TENANT_ID]);
  console.log('   Date range:', JSON.stringify(demoDateRange));
  
  // Weekly averages to verify upward trend
  const [weeklyAvg] = await conn.query(`
    SELECT YEARWEEK(c.callTimestamp) as wk, COUNT(*) as cnt, ROUND(AVG(cg.overallScore),1) as avgScore
    FROM calls c JOIN call_grades cg ON cg.callId = c.id
    WHERE c.tenantId = ?
    GROUP BY YEARWEEK(c.callTimestamp)
    ORDER BY wk ASC
  `, [DEMO_TENANT_ID]);
  console.log('   Weekly averages (should trend up):');
  for (const w of weeklyAvg) {
    console.log(`     Week ${w.wk}: ${w.cnt} calls, avg ${w.avgScore}%`);
  }
  
  await conn.end();
  console.log('\n=== Migration complete! ===');
}

main().catch(console.error);
