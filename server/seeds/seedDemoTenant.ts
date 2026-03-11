import { db } from "../_core/db";
import { eq, sql } from "drizzle-orm";
import { hash } from "bcrypt";
import {
  tenants,
  users,
  teamMembers,
  calls,
  callGrades,
  dispoProperties,
  dailyKpiEntries,
  contactCache,
  badges,
  userBadges,
  xpTransactions,
  userXp,
  userStreaks,
  badgeProgress,
  trainingMaterials,
} from "../../drizzle/schema";

const TENANT_ID = 540044;

function daysAgo(n: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function seedDemoTenant(): Promise<void> {
  console.log("[seed] Seeding demo tenant (ID=540044)...");

  // ── DELETE existing demo data ──────────────────────────────────
  // Temporarily disable FK checks, wipe all tenant data, re-enable
  await db.execute(sql.raw(`SET session_replication_role = 'replica'`));
  const tid = TENANT_ID;
  // Find every table with a "tenantId" column and delete rows for this tenant
  const tablesResult = await db.execute(sql.raw(
    `SELECT c.relname AS table_name FROM pg_attribute a JOIN pg_class c ON a.attrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid WHERE a.attname = 'tenantId' AND n.nspname = 'public' AND c.relkind = 'r'`
  ));
  for (const row of tablesResult.rows as Array<{ table_name: string }>) {
    try { await db.execute(sql.raw(`DELETE FROM "${row.table_name}" WHERE "tenantId" = ${tid}`)); } catch { /* skip */ }
  }
  // Also delete the tenant itself (uses "id" not "tenantId")
  try { await db.execute(sql.raw(`DELETE FROM "tenants" WHERE "id" = ${tid}`)); } catch { /* skip */ }
  await db.execute(sql.raw(`SET session_replication_role = 'origin'`));

  // Fix serial sequences after deletes — advance to max(id) + 1 for key tables
  const seqTables = ["users", "team_members", "calls", "call_grades", "dispo_properties", "badges", "user_badges", "xp_transactions", "user_xp", "user_streaks", "badge_progress", "daily_kpi_entries", "contact_cache", "training_materials"];
  for (const t of seqTables) {
    try { await db.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 0) + 1, false)`)); } catch { /* skip */ }
  }

  console.log("[seed] Cleared old demo data.");

  // ── 1. TENANT ───────────────────────────────────────────────────
  await db.insert(tenants).values({
    id: TENANT_ID,
    name: "Apex Property Solutions",
    slug: "apex-demo",
    crmType: "ghl",
    subscriptionTier: "growth",
    subscriptionStatus: "active",
    maxUsers: 10,
    onboardingCompleted: "true",
    onboardingStep: 5,
    crmConnected: "true",
  }).onConflictDoUpdate({
    target: tenants.id,
    set: { name: "Apex Property Solutions", slug: "apex-demo", subscriptionTier: "growth", subscriptionStatus: "active" },
  });
  console.log("[seed] Tenant created.");

  // ── 2. USERS ────────────────────────────────────────────────────
  const pw = await hash("demo1234", 10);

  const userRows = await db
    .insert(users)
    .values([
      {
        tenantId: TENANT_ID,
        openId: "demo:demo@getgunner.ai",
        name: "Alex Demo",
        email: "demo@getgunner.ai",
        passwordHash: pw,
        emailVerified: "true",
        loginMethod: "email_password",
        role: "admin",
        teamRole: "admin",
        isTenantAdmin: "true",
      },
      {
        tenantId: TENANT_ID,
        openId: "demo:sarah@getgunner.ai",
        name: "Sarah Chen",
        email: "sarah@getgunner.ai",
        passwordHash: pw,
        emailVerified: "true",
        loginMethod: "email_password",
        role: "user",
        teamRole: "lead_manager",
        isTenantAdmin: "false",
      },
      {
        tenantId: TENANT_ID,
        openId: "demo:marcus@getgunner.ai",
        name: "Marcus Williams",
        email: "marcus@getgunner.ai",
        passwordHash: pw,
        emailVerified: "true",
        loginMethod: "email_password",
        role: "user",
        teamRole: "acquisition_manager",
        isTenantAdmin: "false",
      },
      {
        tenantId: TENANT_ID,
        openId: "demo:jessica@getgunner.ai",
        name: "Jessica Rivera",
        email: "jessica@getgunner.ai",
        passwordHash: pw,
        emailVerified: "true",
        loginMethod: "email_password",
        role: "user",
        teamRole: "acquisition_manager",
        isTenantAdmin: "false",
      },
      {
        tenantId: TENANT_ID,
        openId: "demo:tyler@getgunner.ai",
        name: "Tyler Brooks",
        email: "tyler@getgunner.ai",
        passwordHash: pw,
        emailVerified: "true",
        loginMethod: "email_password",
        role: "user",
        teamRole: "dispo_manager",
        isTenantAdmin: "false",
      },
    ])
    .returning();

  const userMap: Record<string, number> = {};
  for (const u of userRows) {
    userMap[u.name!] = u.id;
  }
  console.log("[seed] 5 users created.");

  // ── 3. TEAM MEMBERS (non-admin) ────────────────────────────────
  const tmRows = await db
    .insert(teamMembers)
    .values([
      { tenantId: TENANT_ID, name: "Sarah Chen", teamRole: "lead_manager", userId: userMap["Sarah Chen"], isActive: "true" },
      { tenantId: TENANT_ID, name: "Marcus Williams", teamRole: "acquisition_manager", userId: userMap["Marcus Williams"], isActive: "true" },
      { tenantId: TENANT_ID, name: "Jessica Rivera", teamRole: "acquisition_manager", userId: userMap["Jessica Rivera"], isActive: "true" },
      { tenantId: TENANT_ID, name: "Tyler Brooks", teamRole: "dispo_manager", userId: userMap["Tyler Brooks"], isActive: "true" },
    ])
    .returning();

  const tmMap: Record<string, number> = {};
  for (const tm of tmRows) {
    tmMap[tm.name] = tm.id;
  }
  console.log("[seed] 4 team members created.");

  // ── 4. CALLS (20 calls, 8+ today) ──────────────────────────────
  const callData = [
    // Today's calls (8)
    { contactName: "David Thompson", contactPhone: "615-555-0101", propertyAddress: "1234 Main St, Nashville, TN 37206", callDirection: "outbound", duration: 420, teamMemberName: "Marcus Williams", callType: "cold_call", callTimestamp: daysAgo(0, 9, 15) },
    { contactName: "Maria Garcia", contactPhone: "615-555-0102", propertyAddress: "567 Elm Ave, Nashville, TN 37210", callDirection: "inbound", duration: 1320, teamMemberName: "Sarah Chen", callType: "follow_up", callTimestamp: daysAgo(0, 9, 45) },
    { contactName: "Robert Lee", contactPhone: "615-555-0103", propertyAddress: "890 Oak Dr, Nashville, TN 37211", callDirection: "outbound", duration: 180, teamMemberName: "Marcus Williams", callType: "cold_call", callTimestamp: daysAgo(0, 10, 30) },
    { contactName: "Jennifer Smith", contactPhone: "615-555-0104", propertyAddress: "2345 Cedar Ln, Nashville, TN 37207", callDirection: "outbound", duration: 2100, teamMemberName: "Jessica Rivera", callType: "offer_call", callTimestamp: daysAgo(0, 11, 0) },
    { contactName: "Carlos Mendez", contactPhone: "615-555-0105", propertyAddress: "678 Birch Rd, Nashville, TN 37208", callDirection: "inbound", duration: 900, teamMemberName: "Sarah Chen", callType: "follow_up", callTimestamp: daysAgo(0, 11, 30) },
    { contactName: "Amanda Taylor", contactPhone: "615-555-0106", propertyAddress: "901 Maple Ct, Nashville, TN 37209", callDirection: "outbound", duration: 540, teamMemberName: "Tyler Brooks", callType: "cold_call", callTimestamp: daysAgo(0, 13, 15) },
    { contactName: "James Wilson", contactPhone: "615-555-0107", propertyAddress: "1122 Pine St, Nashville, TN 37212", callDirection: "outbound", duration: 2700, teamMemberName: "Marcus Williams", callType: "appointment_call", callTimestamp: daysAgo(0, 14, 0) },
    { contactName: "Patricia Brown", contactPhone: "615-555-0108", propertyAddress: "3344 Walnut Ave, Nashville, TN 37213", callDirection: "inbound", duration: 60, teamMemberName: "Jessica Rivera", callType: "cold_call", callTimestamp: daysAgo(0, 14, 30) },
    // Past days (12)
    { contactName: "Michael Davis", contactPhone: "615-555-0109", propertyAddress: "5566 Spruce Dr, Nashville, TN 37214", callDirection: "outbound", duration: 1800, teamMemberName: "Marcus Williams", callType: "offer_call", callTimestamp: daysAgo(1, 10, 0) },
    { contactName: "Susan Martinez", contactPhone: "615-555-0110", propertyAddress: "7788 Hickory Ln, Nashville, TN 37215", callDirection: "inbound", duration: 960, teamMemberName: "Sarah Chen", callType: "follow_up", callTimestamp: daysAgo(1, 14, 30) },
    { contactName: "Richard Clark", contactPhone: "615-555-0111", propertyAddress: "9900 Poplar Rd, Nashville, TN 37216", callDirection: "outbound", duration: 300, teamMemberName: "Jessica Rivera", callType: "cold_call", callTimestamp: daysAgo(2, 9, 0) },
    { contactName: "Linda Johnson", contactPhone: "615-555-0112", propertyAddress: "2233 Ash St, Nashville, TN 37217", callDirection: "outbound", duration: 1500, teamMemberName: "Marcus Williams", callType: "appointment_call", callTimestamp: daysAgo(2, 11, 0) },
    { contactName: "Thomas White", contactPhone: "615-555-0113", propertyAddress: "4455 Cherry Ave, Nashville, TN 37218", callDirection: "inbound", duration: 45, teamMemberName: "Tyler Brooks", callType: "cold_call", callTimestamp: daysAgo(3, 10, 30) },
    { contactName: "Karen Mitchell", contactPhone: "615-555-0114", propertyAddress: "6677 Dogwood Dr, Nashville, TN 37219", callDirection: "outbound", duration: 2400, teamMemberName: "Jessica Rivera", callType: "offer_call", callTimestamp: daysAgo(3, 14, 0) },
    { contactName: "Brian Harris", contactPhone: "615-555-0115", propertyAddress: "8899 Fern Ct, Nashville, TN 37220", callDirection: "outbound", duration: 780, teamMemberName: "Sarah Chen", callType: "follow_up", callTimestamp: daysAgo(4, 9, 30) },
    { contactName: "Michelle Young", contactPhone: "615-555-0116", propertyAddress: "1010 Ivy Rd, Nashville, TN 37221", callDirection: "inbound", duration: 1200, teamMemberName: "Marcus Williams", callType: "follow_up", callTimestamp: daysAgo(4, 13, 0) },
    { contactName: "Steven Anderson", contactPhone: "615-555-0117", propertyAddress: "1212 Jasmine Ln, Nashville, TN 37222", callDirection: "outbound", duration: 600, teamMemberName: "Tyler Brooks", callType: "cold_call", callTimestamp: daysAgo(5, 10, 0) },
    { contactName: "Lisa Robinson", contactPhone: "615-555-0118", propertyAddress: "1414 Laurel St, Nashville, TN 37201", callDirection: "outbound", duration: 2100, teamMemberName: "Jessica Rivera", callType: "appointment_call", callTimestamp: daysAgo(5, 15, 0) },
    { contactName: "Daniel King", contactPhone: "615-555-0119", propertyAddress: "1616 Magnolia Ave, Nashville, TN 37202", callDirection: "inbound", duration: 480, teamMemberName: "Sarah Chen", callType: "cold_call", callTimestamp: daysAgo(6, 11, 0) },
    { contactName: "Nancy Scott", contactPhone: "615-555-0120", propertyAddress: "1818 Nutmeg Dr, Nashville, TN 37203", callDirection: "outbound", duration: 1680, teamMemberName: "Marcus Williams", callType: "offer_call", callTimestamp: daysAgo(6, 14, 30) },
  ];

  const callRows = await db
    .insert(calls)
    .values(
      callData.map((c) => ({
        tenantId: TENANT_ID,
        contactName: c.contactName,
        contactPhone: c.contactPhone,
        propertyAddress: c.propertyAddress,
        callDirection: c.callDirection,
        duration: c.duration,
        teamMemberName: c.teamMemberName,
        callType: c.callType,
        status: "completed" as const,
        callTimestamp: c.callTimestamp,
        transcript: c.duration > 300 ? "This is a sample transcript for demo purposes. The conversation covered property details, seller motivation, and next steps." : null,
      }))
    )
    .returning();

  const callIds = callRows.map((r) => r.id);
  console.log("[seed] 20 calls created.");

  // ── 5. CALL GRADES (15 graded) ─────────────────────────────────
  const gradeSpecs: { idx: number; score: number; grade: string; strengths: string[]; improvements: string[]; summary: string }[] = [
    { idx: 0, score: 94, grade: "A", strengths: ["Excellent rapport building", "Strong closing technique"], improvements: ["Could ask more open-ended questions"], summary: "Outstanding cold call with great energy and rapport. Secured a follow-up appointment." },
    { idx: 1, score: 91, grade: "A", strengths: ["Great follow-up discipline", "Clear communication"], improvements: ["Minor pacing issues"], summary: "Excellent follow-up call. Seller is now warm and ready for an offer." },
    { idx: 3, score: 87, grade: "B", strengths: ["Confident offer presentation", "Handled price objection well"], improvements: ["Could improve transition to closing"], summary: "Solid offer call. Seller is considering the offer and will respond within 48 hours." },
    { idx: 4, score: 82, grade: "B", strengths: ["Good active listening", "Empathetic responses"], improvements: ["Needs stronger trial close"], summary: "Good follow-up with warm prospect. Needs to push for a decision more firmly." },
    { idx: 6, score: 85, grade: "B", strengths: ["Thorough property walkthrough", "Built trust with seller"], improvements: ["Could tighten timeline discussion"], summary: "Strong appointment call covering all property details and seller motivation." },
    { idx: 8, score: 78, grade: "B", strengths: ["Well-prepared with comps", "Professional demeanor"], improvements: ["Missed opportunity to address timeline urgency"], summary: "Decent offer presentation but missed some urgency signals from the seller." },
    { idx: 9, score: 72, grade: "C", strengths: ["Friendly tone", "Good opening"], improvements: ["Didn't uncover enough motivation", "Talked too much"], summary: "Average follow-up. Need to ask more probing questions about seller's situation." },
    { idx: 10, score: 68, grade: "C", strengths: ["Handled initial objection"], improvements: ["Too scripted", "Needs better rapport building"], summary: "Below average cold call. Sounded robotic and failed to build genuine connection." },
    { idx: 11, score: 74, grade: "C", strengths: ["Good appointment confirmation", "Covered inspection details"], improvements: ["Should have discussed offer range"], summary: "Acceptable appointment call but missed chance to anchor an offer range." },
    { idx: 13, score: 71, grade: "C", strengths: ["Persistence on follow-up"], improvements: ["Needs to address seller concerns directly", "Talk ratio too high"], summary: "Mediocre offer call. Seller had concerns that weren't fully addressed." },
    { idx: 14, score: 64, grade: "C", strengths: ["Maintained professionalism"], improvements: ["Weak discovery questions", "No clear next step set"], summary: "Follow-up lacked direction. Needs clearer agenda before calling." },
    { idx: 15, score: 52, grade: "D", strengths: ["Showed up and made the call"], improvements: ["Poor objection handling", "Gave up too easily", "No rapport building"], summary: "Struggled with seller objections and ended call without next steps." },
    { idx: 17, score: 48, grade: "D", strengths: ["Attempted to uncover motivation"], improvements: ["Argumentative tone", "Interrupted seller multiple times"], summary: "Appointment call went poorly. Seller felt rushed and disrespected." },
    { idx: 18, score: 38, grade: "F", strengths: ["None notable"], improvements: ["Complete lack of preparation", "No understanding of seller's market", "Failed to qualify"], summary: "Unprepared cold call. Did not research the property or seller before calling." },
    { idx: 19, score: 28, grade: "F", strengths: ["Brief moments of professionalism"], improvements: ["Made an offer without qualifying", "Didn't confirm property details", "Critical failures in rapport"], summary: "Critical failures in this offer call. Made an unsolicited offer without any qualification or rapport." },
  ];

  const criteriaTemplates: Record<string, Record<string, number>> = {
    A: { rapport: 19, listening: 18, objectionHandling: 17, professionalism: 20, nextSteps: 18 },
    B: { rapport: 16, listening: 15, objectionHandling: 14, professionalism: 17, nextSteps: 16 },
    C: { rapport: 13, listening: 13, objectionHandling: 12, professionalism: 14, nextSteps: 13 },
    D: { rapport: 10, listening: 9, objectionHandling: 8, professionalism: 12, nextSteps: 10 },
    F: { rapport: 6, listening: 5, objectionHandling: 4, professionalism: 8, nextSteps: 6 },
  };

  await db.insert(callGrades).values(
    gradeSpecs.map((g) => ({
      tenantId: TENANT_ID,
      callId: callIds[g.idx],
      overallScore: String(g.score),
      overallGrade: g.grade,
      criteriaScores: criteriaTemplates[g.grade],
      strengths: g.strengths,
      improvements: g.improvements,
      summary: g.summary,
      rubricType: "acq-cold",
    }))
  );
  console.log("[seed] 15 call grades created.");

  // ── 6. DISPO_PROPERTIES (12 properties) ────────────────────────
  const propData = [
    // 3 new_lead
    { address: "2200 Shelby Ave", city: "Nashville", state: "TN", zip: "37206", propertyType: "single_family", beds: 3, baths: "2", sqft: 1400, arv: 285000, estRepairs: 45000, askingPrice: 95000, status: "new_lead", addedByUserId: userMap["Sarah Chen"], sellerName: "David Thompson", sellerPhone: "615-555-0101" },
    { address: "1100 Fatherland St", city: "Nashville", state: "TN", zip: "37206", propertyType: "duplex", beds: 4, baths: "2", sqft: 2000, arv: 340000, estRepairs: 60000, askingPrice: 85000, status: "new_lead", addedByUserId: userMap["Sarah Chen"], sellerName: "Maria Garcia", sellerPhone: "615-555-0102" },
    { address: "3300 Dickerson Pike", city: "Nashville", state: "TN", zip: "37207", propertyType: "single_family", beds: 2, baths: "1", sqft: 950, arv: 195000, estRepairs: 35000, askingPrice: 65000, status: "new_lead", addedByUserId: userMap["Sarah Chen"], sellerName: "Robert Lee", sellerPhone: "615-555-0103" },
    // 2 contacted
    { address: "4455 Nolensville Pike", city: "Nashville", state: "TN", zip: "37211", propertyType: "single_family", beds: 3, baths: "2", sqft: 1600, arv: 310000, estRepairs: 50000, askingPrice: 120000, status: "contacted", addedByUserId: userMap["Marcus Williams"], assignedAmUserId: userMap["Marcus Williams"], sellerName: "Jennifer Smith", sellerPhone: "615-555-0104", lastContactedAt: daysAgo(1, 14, 0), contactedAt: daysAgo(1, 14, 0) },
    { address: "5566 Murfreesboro Pike", city: "Nashville", state: "TN", zip: "37210", propertyType: "townhome", beds: 3, baths: "2.5", sqft: 1800, arv: 350000, estRepairs: 40000, askingPrice: 145000, status: "contacted", addedByUserId: userMap["Sarah Chen"], assignedAmUserId: userMap["Jessica Rivera"], sellerName: "Carlos Mendez", sellerPhone: "615-555-0105", lastContactedAt: daysAgo(0, 11, 30), contactedAt: daysAgo(2, 9, 0) },
    // 2 appointment_set
    { address: "6677 Lebanon Pike", city: "Nashville", state: "TN", zip: "37214", propertyType: "single_family", beds: 4, baths: "3", sqft: 2400, arv: 425000, estRepairs: 70000, askingPrice: 175000, status: "appointment_set", addedByUserId: userMap["Marcus Williams"], assignedAmUserId: userMap["Marcus Williams"], sellerName: "James Wilson", sellerPhone: "615-555-0107", aptEverSet: true, aptSetAt: daysAgo(0, 14, 0), contactedAt: daysAgo(3, 10, 0), lastContactedAt: daysAgo(0, 14, 0) },
    { address: "7788 Gallatin Pike", city: "Nashville", state: "TN", zip: "37216", propertyType: "single_family", beds: 3, baths: "2", sqft: 1350, arv: 275000, estRepairs: 30000, askingPrice: 130000, status: "appointment_set", addedByUserId: userMap["Jessica Rivera"], assignedAmUserId: userMap["Jessica Rivera"], sellerName: "Karen Mitchell", sellerPhone: "615-555-0114", aptEverSet: true, aptSetAt: daysAgo(1, 10, 0), contactedAt: daysAgo(4, 9, 0), lastContactedAt: daysAgo(1, 10, 0) },
    // 2 offer_made
    { address: "8899 Charlotte Ave", city: "Nashville", state: "TN", zip: "37209", propertyType: "single_family", beds: 3, baths: "2", sqft: 1500, arv: 320000, estRepairs: 55000, askingPrice: 140000, status: "offer_made", addedByUserId: userMap["Marcus Williams"], assignedAmUserId: userMap["Marcus Williams"], sellerName: "Michael Davis", sellerPhone: "615-555-0109", aptEverSet: true, offerEverMade: true, ourOfferAmount: 125000, offerDate: daysAgo(1, 15, 0), offerMadeAt: daysAgo(1, 15, 0), contactedAt: daysAgo(5, 10, 0), lastContactedAt: daysAgo(1, 10, 0) },
    { address: "9900 West End Ave", city: "Nashville", state: "TN", zip: "37205", propertyType: "duplex", beds: 5, baths: "3", sqft: 3200, arv: 520000, estRepairs: 85000, askingPrice: 225000, status: "offer_made", addedByUserId: userMap["Jessica Rivera"], assignedAmUserId: userMap["Jessica Rivera"], sellerName: "Nancy Scott", sellerPhone: "615-555-0120", aptEverSet: true, offerEverMade: true, ourOfferAmount: 195000, offerDate: daysAgo(2, 11, 0), offerMadeAt: daysAgo(2, 11, 0), contactedAt: daysAgo(6, 14, 0), lastContactedAt: daysAgo(2, 11, 0) },
    // 2 under_contract
    { address: "1011 8th Ave S", city: "Nashville", state: "TN", zip: "37203", propertyType: "single_family", beds: 3, baths: "1", sqft: 1200, arv: 310000, estRepairs: 45000, askingPrice: 135000, status: "under_contract", addedByUserId: userMap["Marcus Williams"], assignedAmUserId: userMap["Marcus Williams"], sellerName: "Susan Martinez", sellerPhone: "615-555-0110", aptEverSet: true, offerEverMade: true, everUnderContract: true, contractPrice: 118000, contractDate: daysAgo(3, 10, 0), closingDate: daysAgo(-14, 10, 0), underContractAt: daysAgo(3, 10, 0), contactedAt: daysAgo(7, 9, 0), lastContactedAt: daysAgo(1, 14, 30) },
    { address: "1213 Broadway", city: "Nashville", state: "TN", zip: "37203", propertyType: "townhome", beds: 4, baths: "2.5", sqft: 2100, arv: 450000, estRepairs: 65000, askingPrice: 195000, status: "under_contract", addedByUserId: userMap["Jessica Rivera"], assignedAmUserId: userMap["Jessica Rivera"], sellerName: "Linda Johnson", sellerPhone: "615-555-0112", aptEverSet: true, offerEverMade: true, everUnderContract: true, contractPrice: 172000, contractDate: daysAgo(5, 14, 0), closingDate: daysAgo(-10, 10, 0), underContractAt: daysAgo(5, 14, 0), contactedAt: daysAgo(10, 11, 0), lastContactedAt: daysAgo(2, 11, 0) },
    // 1 closed
    { address: "1415 Music Row", city: "Nashville", state: "TN", zip: "37203", propertyType: "single_family", beds: 3, baths: "2", sqft: 1550, arv: 380000, estRepairs: 50000, askingPrice: 160000, status: "closed", addedByUserId: userMap["Marcus Williams"], assignedAmUserId: userMap["Marcus Williams"], sellerName: "Richard Clark", sellerPhone: "615-555-0111", aptEverSet: true, offerEverMade: true, everUnderContract: true, everClosed: true, contractPrice: 145000, contractDate: daysAgo(21, 10, 0), actualCloseDate: daysAgo(3, 10, 0), assignmentAmount: 18000, closedAt: daysAgo(3, 10, 0), closingDate: daysAgo(3, 10, 0), contactedAt: daysAgo(30, 10, 0), lastContactedAt: daysAgo(3, 10, 0) },
  ];

  await db.insert(dispoProperties).values(
    propData.map((p) => ({
      tenantId: TENANT_ID,
      address: p.address,
      city: p.city,
      state: p.state,
      zip: p.zip,
      propertyType: p.propertyType,
      beds: p.beds,
      baths: p.baths,
      sqft: p.sqft,
      arv: p.arv,
      estRepairs: p.estRepairs,
      askingPrice: p.askingPrice,
      status: p.status,
      addedByUserId: p.addedByUserId,
      assignedAmUserId: p.assignedAmUserId ?? null,
      sellerName: p.sellerName,
      sellerPhone: p.sellerPhone,
      aptEverSet: p.aptEverSet ?? false,
      offerEverMade: p.offerEverMade ?? false,
      everUnderContract: p.everUnderContract ?? false,
      everClosed: p.everClosed ?? false,
      ourOfferAmount: p.ourOfferAmount ?? null,
      offerDate: p.offerDate ?? null,
      offerMadeAt: p.offerMadeAt ?? null,
      contractPrice: p.contractPrice ?? null,
      contractDate: p.contractDate ?? null,
      closingDate: p.closingDate ?? null,
      actualCloseDate: p.actualCloseDate ?? null,
      assignmentAmount: p.assignmentAmount ?? null,
      aptSetAt: p.aptSetAt ?? null,
      contactedAt: p.contactedAt ?? null,
      underContractAt: p.underContractAt ?? null,
      closedAt: p.closedAt ?? null,
      lastContactedAt: p.lastContactedAt ?? null,
    }))
  );
  console.log("[seed] 12 properties created.");

  // ── 7. DAILY KPI ENTRIES (10 for today) ─────────────────────────
  const today = todayStr();
  await db.insert(dailyKpiEntries).values([
    { tenantId: TENANT_ID, userId: userMap["Marcus Williams"], date: today, kpiType: "calls", source: "auto", detectionType: "auto", contactName: "David Thompson" },
    { tenantId: TENANT_ID, userId: userMap["Sarah Chen"], date: today, kpiType: "calls", source: "auto", detectionType: "auto", contactName: "Maria Garcia" },
    { tenantId: TENANT_ID, userId: userMap["Jessica Rivera"], date: today, kpiType: "calls", source: "auto", detectionType: "auto", contactName: "Jennifer Smith" },
    { tenantId: TENANT_ID, userId: userMap["Marcus Williams"], date: today, kpiType: "convos", source: "auto", detectionType: "auto", contactName: "James Wilson" },
    { tenantId: TENANT_ID, userId: userMap["Sarah Chen"], date: today, kpiType: "convos", source: "auto", detectionType: "auto", contactName: "Carlos Mendez" },
    { tenantId: TENANT_ID, userId: userMap["Marcus Williams"], date: today, kpiType: "apts", source: "auto", detectionType: "auto", contactName: "James Wilson" },
    { tenantId: TENANT_ID, userId: userMap["Jessica Rivera"], date: today, kpiType: "apts", source: "manual", detectionType: "manual", contactName: "Karen Mitchell", notes: "Confirmed for 2pm walkthrough" },
    { tenantId: TENANT_ID, userId: userMap["Marcus Williams"], date: today, kpiType: "offers", source: "auto", detectionType: "auto", contactName: "Michael Davis" },
    { tenantId: TENANT_ID, userId: userMap["Jessica Rivera"], date: today, kpiType: "offers", source: "manual", detectionType: "manual", contactName: "Nancy Scott", notes: "Verbal offer accepted, sending contract" },
    { tenantId: TENANT_ID, userId: userMap["Marcus Williams"], date: today, kpiType: "contracts", source: "auto", detectionType: "auto", contactName: "Susan Martinez" },
  ]);
  console.log("[seed] 10 KPI entries created.");

  // ── 8. CONTACT CACHE (15 contacts) ─────────────────────────────
  await db.insert(contactCache).values([
    // 10 sellers
    { tenantId: TENANT_ID, ghlContactId: "demo-c-001", name: "David Thompson", phone: "615-555-0101", currentStage: "new_lead", market: "East Nashville" },
    { tenantId: TENANT_ID, ghlContactId: "demo-c-002", name: "Maria Garcia", phone: "615-555-0102", currentStage: "new_lead", market: "Nashville" },
    { tenantId: TENANT_ID, ghlContactId: "demo-c-003", name: "Robert Lee", phone: "615-555-0103", currentStage: "new_lead", market: "Nashville" },
    { tenantId: TENANT_ID, ghlContactId: "demo-c-004", name: "Jennifer Smith", phone: "615-555-0104", currentStage: "contacted", market: "Antioch" },
    { tenantId: TENANT_ID, ghlContactId: "demo-c-005", name: "Carlos Mendez", phone: "615-555-0105", currentStage: "contacted", market: "Nashville" },
    { tenantId: TENANT_ID, ghlContactId: "demo-c-006", name: "James Wilson", phone: "615-555-0107", currentStage: "appointment_set", market: "Nashville" },
    { tenantId: TENANT_ID, ghlContactId: "demo-c-007", name: "Michael Davis", phone: "615-555-0109", currentStage: "offer_made", market: "East Nashville" },
    { tenantId: TENANT_ID, ghlContactId: "demo-c-008", name: "Susan Martinez", phone: "615-555-0110", currentStage: "under_contract", market: "Nashville" },
    { tenantId: TENANT_ID, ghlContactId: "demo-c-009", name: "Richard Clark", phone: "615-555-0111", currentStage: "closed", market: "Nashville" },
    { tenantId: TENANT_ID, ghlContactId: "demo-c-010", name: "Karen Mitchell", phone: "615-555-0114", currentStage: "appointment_set", market: "Antioch" },
    // 5 buyers
    { tenantId: TENANT_ID, ghlContactId: "demo-b-001", name: "Derek Patel", phone: "615-555-0201", currentStage: "qualified", buyerTier: "Priority", buyBoxType: "single_family", verifiedFunding: "true", responseSpeed: "Lightning", market: "Nashville" },
    { tenantId: TENANT_ID, ghlContactId: "demo-b-002", name: "Rachel Foster", phone: "615-555-0202", currentStage: "qualified", buyerTier: "Qualified", buyBoxType: "multi_family", verifiedFunding: "false", responseSpeed: "Same_Day", market: "East Nashville" },
    { tenantId: TENANT_ID, ghlContactId: "demo-b-003", name: "Victor Nguyen", phone: "615-555-0203", currentStage: "qualified", buyerTier: "JV_Partner", buyBoxType: "single_family", verifiedFunding: "true", responseSpeed: "Lightning", market: "Nashville" },
    { tenantId: TENANT_ID, ghlContactId: "demo-b-004", name: "Samantha Cole", phone: "615-555-0204", currentStage: "qualified", buyerTier: "Priority", buyBoxType: "single_family", verifiedFunding: "true", responseSpeed: "Same_Day", market: "Antioch" },
    { tenantId: TENANT_ID, ghlContactId: "demo-b-005", name: "Omar Hassan", phone: "615-555-0205", currentStage: "qualified", buyerTier: "Qualified", buyBoxType: "multi_family", verifiedFunding: "false", responseSpeed: "Same_Day", market: "Nashville" },
  ]);
  console.log("[seed] 15 contacts cached.");

  // ── 9. GAMIFICATION ─────────────────────────────────────────────

  // Badges (6 definitions)
  const badgeRows = await db
    .insert(badges)
    .values([
      { tenantId: TENANT_ID, code: "closer", name: "Closer", description: "Close 10 deals", category: "performance", tier: "gold", target: 10, criteriaType: "deal_count" },
      { tenantId: TENANT_ID, code: "hot_streak", name: "Hot Streak", description: "5 consecutive C+ grades", category: "streak", tier: "silver", target: 5, criteriaType: "grade_streak" },
      { tenantId: TENANT_ID, code: "consistent", name: "Consistent", description: "10-day consistency streak", category: "streak", tier: "bronze", target: 10, criteriaType: "consistency_streak" },
      { tenantId: TENANT_ID, code: "volume_king", name: "Volume King", description: "Make 50 calls in a week", category: "volume", tier: "gold", target: 50, criteriaType: "weekly_calls" },
      { tenantId: TENANT_ID, code: "improver", name: "Improver", description: "Improve grade 3 times in a row", category: "improvement", tier: "silver", target: 3, criteriaType: "grade_improvement" },
      { tenantId: TENANT_ID, code: "all_star", name: "All-Star", description: "Earn all other badges", category: "special", tier: "platinum", target: 1, criteriaType: "all_badges" },
    ])
    .returning();

  const badgeMap: Record<string, number> = {};
  for (const b of badgeRows) {
    badgeMap[b.code] = b.id;
  }

  // User badges (3 earned)
  await db.insert(userBadges).values([
    { tenantId: TENANT_ID, teamMemberId: tmMap["Marcus Williams"], badgeId: badgeMap["closer"], badgeCode: "closer", progress: 10, earnedAt: daysAgo(5, 16, 0) },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Marcus Williams"], badgeId: badgeMap["hot_streak"], badgeCode: "hot_streak", progress: 5, earnedAt: daysAgo(2, 10, 0) },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Sarah Chen"], badgeId: badgeMap["consistent"], badgeCode: "consistent", progress: 10, earnedAt: daysAgo(1, 9, 0) },
  ]);

  // XP transactions
  await db.insert(xpTransactions).values([
    // Marcus: 1250 total
    { tenantId: TENANT_ID, teamMemberId: tmMap["Marcus Williams"], amount: 500, reason: "grade_a_bonus", callId: callIds[0] },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Marcus Williams"], amount: 450, reason: "grade_b_bonus", callId: callIds[6] },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Marcus Williams"], amount: 300, reason: "badge_earned" },
    // Sarah: 950 total
    { tenantId: TENANT_ID, teamMemberId: tmMap["Sarah Chen"], amount: 400, reason: "grade_a_bonus", callId: callIds[1] },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Sarah Chen"], amount: 300, reason: "grade_b_bonus", callId: callIds[4] },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Sarah Chen"], amount: 250, reason: "badge_earned" },
    // Jessica: 600 total
    { tenantId: TENANT_ID, teamMemberId: tmMap["Jessica Rivera"], amount: 350, reason: "grade_b_bonus", callId: callIds[3] },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Jessica Rivera"], amount: 250, reason: "improvement_xp" },
    // Tyler: 400 total
    { tenantId: TENANT_ID, teamMemberId: tmMap["Tyler Brooks"], amount: 200, reason: "call_base_xp" },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Tyler Brooks"], amount: 200, reason: "call_base_xp" },
  ]);

  // User XP totals
  await db.insert(userXp).values([
    { tenantId: TENANT_ID, teamMemberId: tmMap["Marcus Williams"], totalXp: 1250 },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Sarah Chen"], totalXp: 950 },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Jessica Rivera"], totalXp: 600 },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Tyler Brooks"], totalXp: 400 },
  ]);

  // User streaks
  await db.insert(userStreaks).values([
    { tenantId: TENANT_ID, teamMemberId: tmMap["Marcus Williams"], hotStreakCurrent: 4, hotStreakBest: 7, consistencyStreakCurrent: 3, consistencyStreakBest: 5 },
    { tenantId: TENANT_ID, teamMemberId: tmMap["Sarah Chen"], hotStreakCurrent: 2, hotStreakBest: 4, consistencyStreakCurrent: 8, consistencyStreakBest: 12 },
  ]);
  console.log("[seed] Gamification seeded (badges, XP, streaks).");

  // ── 10. TRAINING MATERIALS (4 items) ────────────────────────────
  await db.insert(trainingMaterials).values([
    {
      tenantId: TENANT_ID,
      title: "Cold Call Framework",
      description: "Step-by-step framework for effective cold calling in real estate wholesaling",
      content: "Step 1: Introduction — Introduce yourself and your company clearly.\nStep 2: Reason for Call — State why you're calling about their specific property.\nStep 3: Build Rapport — Find common ground, show genuine interest.\nStep 4: Discover Motivation — Ask open-ended questions about why they're considering selling.\nStep 5: Property Details — Gather condition, repairs, occupancy info.\nStep 6: Timeline — Understand their ideal timeline.\nStep 7: Set Next Steps — Schedule a follow-up or appointment.",
      category: "scripts",
      applicableTo: "all",
      isActive: "true",
    },
    {
      tenantId: TENANT_ID,
      title: "Objection Handling Guide",
      description: "Common seller objections and proven response frameworks",
      content: "Objection 1: 'I'm not interested' — Response: 'I completely understand. Most sellers I work with felt the same way initially. Can I ask what your plan is for the property?'\n\nObjection 2: 'I want full market value' — Response: 'That makes sense. Let me share how our offer compares when you factor in agent commissions, repairs, and holding costs.'\n\nObjection 3: 'I need to think about it' — Response: 'Absolutely, take your time. What specific concerns would you like to think through? I may be able to help address them now.'\n\nObjection 4: 'I'm working with another investor' — Response: 'Great that you're exploring options. We often provide a second opinion. Would it be okay if I shared what we could offer?'",
      category: "objections",
      applicableTo: "all",
      isActive: "true",
    },
    {
      tenantId: TENANT_ID,
      title: "Appointment Setting Script",
      description: "Opening script and flow for setting property walkthrough appointments",
      content: "Opening: 'Hi [Name], this is [Your Name] with Apex Property Solutions. I'm calling because we recently made an offer on a property near yours and I wanted to see if you'd be open to a similar conversation.'\n\nTransition: 'Based on what you've shared, I think it would be helpful for me to take a quick look at the property. This helps me give you the most accurate offer possible.'\n\nSetting the Appointment: 'Would tomorrow morning or afternoon work better for a quick 15-minute walkthrough?'\n\nConfirmation: 'Great, I'll see you at [time] at [address]. I'll send you a text to confirm. Is this the best number to reach you?'",
      category: "scripts",
      applicableTo: "all",
      isActive: "true",
    },
    {
      tenantId: TENANT_ID,
      title: "Offer Negotiation Tactics",
      description: "Key negotiation strategies for making and closing offers with sellers",
      content: "Strategy 1: Anchor Low, Justify High — Present your initial offer with detailed justification (comps, repair estimates, market conditions). This sets the frame.\n\nStrategy 2: The Takeaway — If a seller pushes back hard, gently suggest that maybe the deal isn't the right fit. This often brings them back to the table.\n\nStrategy 3: Speed as Value — Emphasize your ability to close quickly. For motivated sellers, speed and certainty often matter more than a few thousand dollars.\n\nStrategy 4: Creative Terms — When price is stuck, explore creative solutions: seller financing, leaseback, split closings, or covering moving costs.\n\nStrategy 5: The Walk-Away Number — Always know your maximum allowable offer before the call. Never negotiate against yourself.",
      category: "negotiation",
      applicableTo: "all",
      isActive: "true",
    },
  ]);
  console.log("[seed] 4 training materials created.");

  console.log("[seed] ✅ Demo tenant (Apex Property Solutions) seeded successfully!");
}

// Allow running directly: npx tsx server/seeds/seedDemoTenant.ts
seedDemoTenant()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[seed] ❌ Error seeding demo tenant:", e);
    process.exit(1);
  });
