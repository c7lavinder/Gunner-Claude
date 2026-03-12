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
  trainingMaterials,
  performanceMetrics,
  demoConversations,
  demoTasks,
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

function getDemoTranscript(callType: string, contactName: string, address: string): string {
  const first = contactName.split(" ")[0];
  switch (callType) {
    case "cold_call":
      return `Rep: Hey, good morning! This is Marcus with Apex Property Solutions. Am I speaking with ${first}?

${first}: Yeah, that's me. What's this about?

Rep: Great, thanks for picking up. I was reaching out because I noticed you own the property at ${address}. We're a local investment company and we help homeowners in your area who might be interested in selling their property quickly, without the hassle of listing with an agent. I was curious — have you ever thought about selling?

${first}: I mean, I've thought about it a little bit. The house needs a lot of work and I just don't have the money to fix it up right now. But I'm not sure I want to sell either.

Rep: That totally makes sense. A lot of the people we work with are in similar situations — they've got a property that needs repairs but it doesn't make sense to dump money into it. Can I ask, how long have you owned the place?

${first}: About 12 years now. Bought it when things were cheaper. The roof needs replacing, the kitchen is outdated, and the basement had some water damage last year.

Rep: Wow, okay. That's a lot to deal with. And are you currently living there or is it a rental?

${first}: I'm living here, but I've been thinking about moving closer to my daughter. She's in Memphis and I'm getting older, you know.

Rep: I completely understand. Family is important. So if we could make you a fair cash offer and close on your timeline — whether that's two weeks or two months — would that be something worth exploring?

${first}: I guess it wouldn't hurt to hear what you'd offer. But I'm not going to give it away.

Rep: Absolutely, and I wouldn't expect you to. What I'd like to do is get a few more details about the property, maybe schedule a quick walkthrough, and then I can put together a real number for you. No pressure, no obligation. Would that work?

${first}: Let me think about it. Can you call me back next week?

Rep: Of course! I'll give you a call next Tuesday around this same time. Sound good?

${first}: Yeah, that works. Talk to you then.

Rep: Perfect. Thanks for your time, ${first}. Have a great day!`;

    case "follow_up":
      return `Rep: Hi ${first}, this is Sarah from Apex Property Solutions. We spoke last week about your property at ${address}. How are you doing today?

${first}: Oh right, yeah. I've been thinking about what we talked about.

Rep: Great! I'm glad you've had some time to think it over. Have your plans changed at all since we last chatted? Are you still considering moving closer to family?

${first}: Yeah, I talked to my daughter and she really wants me to come down there. So I'm more serious about it now than I was before.

Rep: That's wonderful. I think that's a smart move. So let me ask — when we spoke last time, you mentioned the property needs a new roof and has some water damage in the basement. Has anything else come up since then?

${first}: Actually, the HVAC started acting up too. It's making this terrible noise. I got a quote to fix it and they said $4,500. I just can't keep throwing money at this place.

Rep: That's frustrating, and I completely understand. The good news is, when we make an offer, we factor in all those repairs. You wouldn't need to fix a thing. We buy properties as-is.

${first}: Okay, so what kind of number are we talking about?

Rep: Well, I'd love to get out there and see the property in person so I can give you the most accurate offer possible. Based on what you've told me, I'm confident we can put together something fair. Are you free sometime this week for a quick 15-minute walkthrough?

${first}: How about Thursday afternoon?

Rep: Thursday afternoon works great. Let's say 2 PM? I'll come by, take a quick look, and we can talk numbers right there. No pressure at all.

${first}: Alright, let's do it.

Rep: Perfect! I'll see you Thursday at 2 PM at ${address}. Thanks, ${first}. Looking forward to it!`;

    case "offer_call":
      return `Rep: Hi ${first}, thanks for taking my call. I'm following up on our walkthrough at ${address}. I've had a chance to run the numbers and I wanted to go through everything with you.

${first}: Okay, I've been waiting to hear from you.

Rep: So I really appreciate you showing me the property. After looking at comparable sales in your area, factoring in the condition of the property and the repairs needed — the roof, the basement water damage, the HVAC, and the kitchen — I'd like to make you an offer of $142,000, all cash, and we can close in as little as two weeks.

${first}: $142,000? I was hoping for more like $175,000. The Zillow estimate says it's worth $195,000.

Rep: I totally understand. Zillow estimates are based on properties that are in move-in ready condition. When you factor in the roof replacement — that's about $12,000 to $15,000 — the HVAC repair, the basement waterproofing, and a kitchen update, we're looking at roughly $40,000 to $50,000 in repairs. After those repairs, the property would sell for around $190,000, but by then you'd also be paying agent commissions, closing costs, and holding costs.

${first}: I see what you're saying, but $142,000 still feels low.

Rep: I hear you, and I want to make sure this feels right for you. Here's what we bring to the table that you wouldn't get listing with an agent: we close in two weeks, we pay all closing costs, you don't fix a thing, and there's zero risk of the deal falling through. No inspections, no financing contingencies. Just certainty.

${first}: And I wouldn't have to pay any agent fees?

Rep: Zero. No commissions, no closing costs on your end, no hidden fees. The $142,000 is what you walk away with.

${first}: Let me talk to my daughter about it this weekend. Can you give me until Monday?

Rep: Absolutely. I'll follow up with you Monday afternoon. Take your time, talk it over, and if you have any questions before then, you've got my number. Sound good?

${first}: Yeah, that sounds fair. I'll let you know Monday.

Rep: Perfect. Thanks, ${first}. Talk to you Monday!`;

    case "appointment_call":
      return `Rep: Hey ${first}, this is Marcus from Apex Property Solutions. I'm calling to confirm our walkthrough appointment at ${address}. We had you down for Thursday at 2 PM — does that still work?

${first}: Yes, I've got it on my calendar. What exactly should I expect?

Rep: Great question. So when I come by, I'll take a quick walk through the property — usually takes about 15 to 20 minutes. I'll look at the overall condition, take some notes, and check out the areas you mentioned need work like the roof and the basement. After that, I'll go back and run some comparable sales in your area and put together a fair cash offer.

${first}: Are you going to bring a contractor or anything like that?

Rep: No, it'll just be me. I've been doing this for years, so I have a pretty good eye for estimating repairs. And anything I can't see, I'll factor in conservatively. We always account for the unexpected.

${first}: Okay. And how long until I get an offer after the walkthrough?

Rep: Usually within 24 to 48 hours. I want to make sure I do my homework and give you an accurate number. I never want to lowball anyone — that's not how we operate.

${first}: Good, because I had another investor come through a few months ago and their offer was insultingly low.

Rep: I'm sorry to hear that. We pride ourselves on being transparent and fair. I'll walk you through exactly how I arrive at the number, so there's no mystery. If it works for you, great. If not, no hard feelings.

${first}: That sounds reasonable. I'll see you Thursday then.

Rep: Perfect! Thursday at 2 PM. One last thing — will anyone else be at the property who's involved in the decision? Just want to make sure everyone has the information they need.

${first}: My wife will be here too. She wants to be part of the conversation.

Rep: Wonderful, that's even better. I'll make sure to address any questions she has as well. See you both Thursday!`;

    case "dispo_call":
      return `Rep: Hey Nick, it's Tyler from Apex. I've got a deal I think is right in your wheelhouse. You got a minute?

Nick: Yeah, what do you have?

Rep: So we just locked up a property at ${address}. It's a 3-bed, 2-bath, about 1,400 square feet. Built in 1985. The ARV on this one is around $235,000 based on three recent comps within a half mile.

Nick: Okay, what kind of shape is it in?

Rep: It needs a full rehab — kitchen, bathrooms, flooring throughout, and the roof has about 3 years left on it. I'd estimate total rehab around $45,000 to $55,000 if you're using your own crew. We've got it under contract at $125,000.

Nick: So my all-in would be around $180,000 with an ARV of $235,000. That's decent margins. What about the neighborhood?

Rep: It's in a great pocket. The street has mostly owner-occupied homes, and there have been two flips on the same block in the last year — both sold within 30 days. One went for $228,000 and the other for $241,000.

Nick: Those are strong comps. Any issues with the title or anything like that?

Rep: Clean title, no liens, no code violations. Seller is cooperative and we can do a double close or assignment — whatever works better for you. Inspection period is 10 days.

Nick: What's the assignment fee?

Rep: We're asking $12,000 on this one. Given the margins and the area, I think it's very fair.

Nick: Yeah, that's reasonable. Can I drive by the property this afternoon?

Rep: Absolutely. I'll text you the lockbox code after this call. If you like what you see, I can have the assignment contract ready to sign tomorrow.

Nick: Sounds good. Let me take a look and I'll call you back tonight.

Rep: Perfect! Talk to you later, Nick.`;

    default:
      return `Rep: Hi ${first}, this is a representative from Apex Property Solutions calling about the property at ${address}. We had a conversation about the property details, the current condition, and potential next steps. The seller shared information about their motivation and timeline. We discussed the process and what to expect moving forward. The call covered several important topics including property condition, repairs needed, and the seller's goals for the sale.`;
  }
}

function getDemoOutcome(callType: string, index: number): { callOutcome: string; classification: string } {
  switch (callType) {
    case "cold_call":
      return index % 2 === 0
        ? { callOutcome: "Follow-Up Scheduled", classification: "Interested" }
        : { callOutcome: "Not Interested", classification: "Not Interested" };
    case "follow_up":
      return { callOutcome: "Follow-Up Scheduled", classification: "Follow-Up Scheduled" };
    case "offer_call":
      return index % 3 === 0
        ? { callOutcome: "Offer Accepted", classification: "Offer Accepted" }
        : { callOutcome: "Offer Made", classification: "Offer Rejected" };
    case "appointment_call":
      return { callOutcome: "Appointment Set", classification: "Interested" };
    case "dispo_call":
      return { callOutcome: "Follow-Up Scheduled", classification: "Interested" };
    default:
      return { callOutcome: "none", classification: "pending" };
  }
}

export async function seedDemoTenant(): Promise<void> {
  const existing = await db.select().from(tenants).where(eq(tenants.id, TENANT_ID)).limit(1);
  if (existing.length > 0) {
    console.log("[seed] Demo tenant already exists — skipping.");
    return;
  }

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
  const seqTables = ["users", "team_members", "calls", "call_grades", "dispo_properties", "badges", "user_badges", "xp_transactions", "user_xp", "user_streaks", "badge_progress", "daily_kpi_entries", "contact_cache", "training_materials", "performance_metrics", "demo_conversations", "demo_tasks"];
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
    crmConnected: "false",
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
      callData.map((c, i) => {
        const outcome = getDemoOutcome(c.callType, i);
        return {
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
          transcript: c.duration >= 60 ? getDemoTranscript(c.callType, c.contactName, c.propertyAddress) : null,
          callOutcome: outcome.callOutcome,
          classification: outcome.classification,
        };
      })
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

  // ── 11. PERFORMANCE METRICS (4 weeks weekly + 1 monthly per rep) ──
  const repProfiles = [
    { name: "Marcus Williams", avgScore: 85, calls: 48, a: 5, b: 4, c: 2, d: 1, f: 0 },
    { name: "Sarah Chen", avgScore: 78, calls: 42, a: 3, b: 5, c: 3, d: 1, f: 0 },
    { name: "Jessica Rivera", avgScore: 72, calls: 38, a: 2, b: 3, c: 4, d: 2, f: 1 },
    { name: "Tyler Brooks", avgScore: 65, calls: 30, a: 1, b: 2, c: 3, d: 3, f: 2 },
  ];

  const perfRows: Array<{
    tenantId: number; teamMemberId: number; periodType: string;
    periodStart: Date; periodEnd: Date; totalCalls: number;
    averageScore: string; aGradeCount: number; bGradeCount: number;
    cGradeCount: number; dGradeCount: number; fGradeCount: number;
    scoreChange: string;
  }> = [];

  for (const rep of repProfiles) {
    const tmId = tmMap[rep.name];
    // 4 weekly records
    for (let w = 0; w < 4; w++) {
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      const jitter = Math.round((Math.random() - 0.5) * 6); // ±3 score jitter
      perfRows.push({
        tenantId: TENANT_ID, teamMemberId: tmId, periodType: "weekly",
        periodStart: weekStart, periodEnd: weekEnd,
        totalCalls: rep.calls + Math.round((Math.random() - 0.5) * 10),
        averageScore: String(rep.avgScore + jitter),
        aGradeCount: rep.a + (w === 0 ? 1 : 0),
        bGradeCount: rep.b,
        cGradeCount: rep.c,
        dGradeCount: rep.d,
        fGradeCount: rep.f,
        scoreChange: String(w === 0 ? jitter : (Math.random() > 0.5 ? 2.5 : -1.5)),
      });
    }
    // 1 monthly record
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date();
    perfRows.push({
      tenantId: TENANT_ID, teamMemberId: tmId, periodType: "monthly",
      periodStart: monthStart, periodEnd: monthEnd,
      totalCalls: rep.calls * 4 + Math.round(Math.random() * 20),
      averageScore: String(rep.avgScore),
      aGradeCount: rep.a * 4,
      bGradeCount: rep.b * 4,
      cGradeCount: rep.c * 4,
      dGradeCount: rep.d * 4,
      fGradeCount: rep.f * 4,
      scoreChange: String(rep.avgScore > 75 ? 3.2 : -1.8),
    });
  }

  await db.insert(performanceMetrics).values(perfRows);
  console.log("[seed] 20 performance metrics created.");

  // ── 12. 60 ROLLING DAYS OF DAILY KPI ENTRIES ─────────────────────
  function isWeekend(n: number): boolean {
    const d = new Date();
    d.setDate(d.getDate() - n);
    const dow = d.getDay();
    return dow === 0 || dow === 6;
  }

  // Per-rep volume multipliers: Marcus highest, Tyler lowest
  const repVolume: Record<string, number> = {
    "Marcus Williams": 1.3,
    "Sarah Chen": 1.1,
    "Jessica Rivera": 0.9,
    "Tyler Brooks": 0.7,
  };

  const kpiReps = ["Marcus Williams", "Sarah Chen", "Jessica Rivera", "Tyler Brooks"];
  const historicalKpiRows: Array<{
    tenantId: number; userId: number; date: string; kpiType: string;
    source: string; detectionType: string; contactName: string | null;
    notes: string | null;
  }> = [];

  for (let day = 1; day <= 59; day++) {
    const dateStr = daysAgoStr(day);
    const weekend = isWeekend(day);

    for (const repName of kpiReps) {
      const uid = userMap[repName];
      const vol = repVolume[repName];

      // Weekday: ~30 calls/day total → ~7-8 per rep (scaled by vol)
      // Weekend: ~10 calls/day total → ~2-3 per rep (scaled by vol)
      const baseCallsPerRep = weekend ? 2 : 7;
      const callJitter = weekend ? 2 : 3;
      const callCount = Math.max(0, Math.round((baseCallsPerRep + Math.floor(Math.random() * callJitter)) * vol));
      for (let c = 0; c < callCount; c++) {
        historicalKpiRows.push({
          tenantId: TENANT_ID, userId: uid, date: dateStr, kpiType: "calls",
          source: "auto", detectionType: "auto", contactName: null, notes: null,
        });
      }

      // Weekday: ~12 convos/day → ~3 per rep; Weekend: ~4/day → ~1
      const baseConvosPerRep = weekend ? 1 : 3;
      const convoJitter = weekend ? 1 : 2;
      const convoCount = Math.max(0, Math.round((baseConvosPerRep + Math.floor(Math.random() * convoJitter)) * vol));
      for (let c = 0; c < convoCount; c++) {
        historicalKpiRows.push({
          tenantId: TENANT_ID, userId: uid, date: dateStr, kpiType: "convos",
          source: "auto", detectionType: "auto", contactName: null, notes: null,
        });
      }
    }

    // Appointments: weekday ~2/day, weekend 0-1
    const aptCount = weekend ? (Math.random() > 0.6 ? 1 : 0) : (1 + Math.floor(Math.random() * 2));
    for (let a = 0; a < aptCount; a++) {
      historicalKpiRows.push({
        tenantId: TENANT_ID, userId: userMap[kpiReps[a % kpiReps.length]], date: dateStr,
        kpiType: "apts", source: "auto", detectionType: "auto", contactName: null, notes: null,
      });
    }

    // Offers: weekday ~1/day (70%), weekend 0
    if (!weekend && Math.random() > 0.3) {
      historicalKpiRows.push({
        tenantId: TENANT_ID, userId: userMap[kpiReps[day % kpiReps.length]], date: dateStr,
        kpiType: "offers", source: "auto", detectionType: "auto", contactName: null, notes: null,
      });
    }

    // Contracts: weekday 0-1 (30%), weekend 0
    if (!weekend && Math.random() > 0.7) {
      historicalKpiRows.push({
        tenantId: TENANT_ID, userId: userMap[kpiReps[day % kpiReps.length]], date: dateStr,
        kpiType: "contracts", source: "auto", detectionType: "auto", contactName: null, notes: null,
      });
    }
  }

  // ── 12b. MANUAL KPI ENTRIES (15 entries over last 30 days) ────────
  const manualEntries: Array<{ repIdx: number; daysBack: number; kpiType: string; contactName: string; notes: string }> = [
    { repIdx: 0, daysBack: 2, kpiType: "apts", contactName: "James Wilson", notes: "Confirmed walkthrough for 2pm Thursday" },
    { repIdx: 1, daysBack: 3, kpiType: "apts", contactName: "Maria Garcia", notes: "Seller agreed to morning walkthrough" },
    { repIdx: 2, daysBack: 5, kpiType: "offers", contactName: "Nancy Scott", notes: "Verbal offer accepted at $195k" },
    { repIdx: 0, daysBack: 6, kpiType: "offers", contactName: "Michael Davis", notes: "Submitted written offer — $125k, 14-day close" },
    { repIdx: 3, daysBack: 7, kpiType: "apts", contactName: "Amanda Taylor", notes: "Rescheduled walkthrough to Friday 10am" },
    { repIdx: 1, daysBack: 8, kpiType: "contracts", contactName: "Susan Martinez", notes: "Contract signed — $118k, closing in 2 weeks" },
    { repIdx: 0, daysBack: 10, kpiType: "apts", contactName: "David Thompson", notes: "Confirmed first walkthrough — Shelby Ave" },
    { repIdx: 2, daysBack: 12, kpiType: "offers", contactName: "Karen Mitchell", notes: "Verbal offer at $130k, pending seller decision" },
    { repIdx: 3, daysBack: 14, kpiType: "apts", contactName: "Steven Anderson", notes: "Set appointment for property viewing" },
    { repIdx: 0, daysBack: 16, kpiType: "contracts", contactName: "Richard Clark", notes: "Signed purchase agreement — $145k" },
    { repIdx: 1, daysBack: 18, kpiType: "offers", contactName: "Daniel King", notes: "Offer presented at $85k — seller countered" },
    { repIdx: 2, daysBack: 20, kpiType: "apts", contactName: "Lisa Robinson", notes: "Walkthrough confirmed — 1414 Laurel St" },
    { repIdx: 0, daysBack: 23, kpiType: "offers", contactName: "Linda Johnson", notes: "Verbal offer accepted — sending contract tonight" },
    { repIdx: 3, daysBack: 26, kpiType: "apts", contactName: "Thomas White", notes: "Seller wants to meet at property Saturday" },
    { repIdx: 1, daysBack: 28, kpiType: "contracts", contactName: "Linda Johnson", notes: "Contract fully executed — closing scheduled" },
  ];

  for (const entry of manualEntries) {
    historicalKpiRows.push({
      tenantId: TENANT_ID,
      userId: userMap[kpiReps[entry.repIdx]],
      date: daysAgoStr(entry.daysBack),
      kpiType: entry.kpiType,
      source: "manual",
      detectionType: "manual",
      contactName: entry.contactName,
      notes: entry.notes,
    });
  }

  // Insert in batches of 200 to avoid query size limits
  for (let i = 0; i < historicalKpiRows.length; i += 200) {
    await db.insert(dailyKpiEntries).values(historicalKpiRows.slice(i, i + 200));
  }
  console.log(`[seed] ${historicalKpiRows.length} historical KPI entries created (60 days + 15 manual).`);

  // ── 13. DEMO CONVERSATIONS (8 SMS threads) ───────────────────────
  await db.insert(demoConversations).values([
    {
      tenantId: TENANT_ID, contactName: "David Thompson", contactPhone: "615-555-0101",
      lastMessageBody: "Sounds good, what time works for you tomorrow?", lastMessageDate: daysAgo(0, 10, 30), unreadCount: 2,
      messages: [
        { direction: "outbound", body: "Hi David, this is Marcus with Apex Property Solutions. I noticed your property on Shelby Ave — are you still considering selling?", timestamp: daysAgo(1, 9, 0).toISOString(), senderName: "Marcus Williams" },
        { direction: "inbound", body: "Yeah I've been thinking about it. What kind of offer are we talking?", timestamp: daysAgo(1, 9, 15).toISOString(), senderName: "David Thompson" },
        { direction: "outbound", body: "Great! We typically close in 2-3 weeks, cash, no inspections. I'd love to take a quick look at the property to give you a solid number.", timestamp: daysAgo(1, 9, 30).toISOString(), senderName: "Marcus Williams" },
        { direction: "inbound", body: "Ok that sounds fair. I'm free this week if you want to come by.", timestamp: daysAgo(0, 10, 15).toISOString(), senderName: "David Thompson" },
        { direction: "inbound", body: "Sounds good, what time works for you tomorrow?", timestamp: daysAgo(0, 10, 30).toISOString(), senderName: "David Thompson" },
      ],
    },
    {
      tenantId: TENANT_ID, contactName: "Maria Garcia", contactPhone: "615-555-0102",
      lastMessageBody: "I'll check with my husband and get back to you.", lastMessageDate: daysAgo(0, 11, 0), unreadCount: 1,
      messages: [
        { direction: "outbound", body: "Hi Maria, following up on our conversation about the duplex on Fatherland St. Have you had a chance to think about our offer?", timestamp: daysAgo(2, 14, 0).toISOString(), senderName: "Sarah Chen" },
        { direction: "inbound", body: "Yes, we're interested but the price seems low. Can you do $95k?", timestamp: daysAgo(2, 15, 0).toISOString(), senderName: "Maria Garcia" },
        { direction: "outbound", body: "I understand your concern. Our offer factors in the repairs needed — the roof and HVAC alone are about $25k. I could go to $88k with a 10-day close.", timestamp: daysAgo(1, 9, 0).toISOString(), senderName: "Sarah Chen" },
        { direction: "inbound", body: "I'll check with my husband and get back to you.", timestamp: daysAgo(0, 11, 0).toISOString(), senderName: "Maria Garcia" },
      ],
    },
    {
      tenantId: TENANT_ID, contactName: "Jennifer Smith", contactPhone: "615-555-0104",
      lastMessageBody: "Perfect, see you Thursday at 2pm!", lastMessageDate: daysAgo(0, 14, 0), unreadCount: 0,
      messages: [
        { direction: "outbound", body: "Hi Jennifer, Marcus from Apex. I wanted to follow up — we'd love to schedule a quick walkthrough of your Nolensville Pike property.", timestamp: daysAgo(1, 10, 0).toISOString(), senderName: "Marcus Williams" },
        { direction: "inbound", body: "Sure, I can do Thursday afternoon. Around 2?", timestamp: daysAgo(1, 11, 0).toISOString(), senderName: "Jennifer Smith" },
        { direction: "outbound", body: "Perfect, see you Thursday at 2pm!", timestamp: daysAgo(0, 14, 0).toISOString(), senderName: "Marcus Williams" },
      ],
    },
    {
      tenantId: TENANT_ID, contactName: "Carlos Mendez", contactPhone: "615-555-0105",
      lastMessageBody: "What repairs are you expecting to need?", lastMessageDate: daysAgo(0, 12, 0), unreadCount: 1,
      messages: [
        { direction: "outbound", body: "Carlos, thanks for chatting earlier. Just wanted to confirm — you're looking to sell within the next 30 days, correct?", timestamp: daysAgo(2, 11, 0).toISOString(), senderName: "Jessica Rivera" },
        { direction: "inbound", body: "Yes, ideally sooner. I'm relocating for work.", timestamp: daysAgo(2, 12, 0).toISOString(), senderName: "Carlos Mendez" },
        { direction: "outbound", body: "Got it. We can definitely work with that timeline. Our team can close in as few as 7 days.", timestamp: daysAgo(1, 9, 0).toISOString(), senderName: "Jessica Rivera" },
        { direction: "inbound", body: "What repairs are you expecting to need?", timestamp: daysAgo(0, 12, 0).toISOString(), senderName: "Carlos Mendez" },
      ],
    },
    {
      tenantId: TENANT_ID, contactName: "James Wilson", contactPhone: "615-555-0107",
      lastMessageBody: "I'll have the offer ready by end of day. Stand by!", lastMessageDate: daysAgo(0, 15, 0), unreadCount: 0,
      messages: [
        { direction: "inbound", body: "Hey Marcus, just wanted to check — when should I expect the offer?", timestamp: daysAgo(0, 13, 0).toISOString(), senderName: "James Wilson" },
        { direction: "outbound", body: "Great question James. I just finished the walkthrough notes. Your property is in solid shape.", timestamp: daysAgo(0, 14, 15).toISOString(), senderName: "Marcus Williams" },
        { direction: "outbound", body: "I'll have the offer ready by end of day. Stand by!", timestamp: daysAgo(0, 15, 0).toISOString(), senderName: "Marcus Williams" },
      ],
    },
    {
      tenantId: TENANT_ID, contactName: "Michael Davis", contactPhone: "615-555-0109",
      lastMessageBody: "Let me think about it overnight. I'll call you in the morning.", lastMessageDate: daysAgo(0, 16, 0), unreadCount: 1,
      messages: [
        { direction: "outbound", body: "Michael, following up on the $125k offer for Charlotte Ave. Have you had a chance to review?", timestamp: daysAgo(0, 10, 0).toISOString(), senderName: "Marcus Williams" },
        { direction: "inbound", body: "I did. I was hoping for closer to $135k honestly.", timestamp: daysAgo(0, 11, 0).toISOString(), senderName: "Michael Davis" },
        { direction: "outbound", body: "I hear you. Given the foundation work needed (~$15k), $128k is the highest I can go and still make this work. That includes a 14-day close and we cover all closing costs.", timestamp: daysAgo(0, 14, 0).toISOString(), senderName: "Marcus Williams" },
        { direction: "inbound", body: "Let me think about it overnight. I'll call you in the morning.", timestamp: daysAgo(0, 16, 0).toISOString(), senderName: "Michael Davis" },
      ],
    },
    {
      tenantId: TENANT_ID, contactName: "Karen Mitchell", contactPhone: "615-555-0114",
      lastMessageBody: "See you at 10am sharp!", lastMessageDate: daysAgo(0, 9, 0), unreadCount: 0,
      messages: [
        { direction: "outbound", body: "Karen, confirming your walkthrough tomorrow at 10am at 7788 Gallatin Pike. Does that still work?", timestamp: daysAgo(1, 15, 0).toISOString(), senderName: "Jessica Rivera" },
        { direction: "inbound", body: "Yes! I'll be there. Should I have any paperwork ready?", timestamp: daysAgo(1, 16, 0).toISOString(), senderName: "Karen Mitchell" },
        { direction: "outbound", body: "Nope, just be there and I'll walk you through everything. If we agree on a number I'll have a contract ready same day.", timestamp: daysAgo(1, 17, 0).toISOString(), senderName: "Jessica Rivera" },
        { direction: "inbound", body: "See you at 10am sharp!", timestamp: daysAgo(0, 9, 0).toISOString(), senderName: "Karen Mitchell" },
      ],
    },
    {
      tenantId: TENANT_ID, contactName: "Susan Martinez", contactPhone: "615-555-0110",
      lastMessageBody: "Title company confirmed — closing next Friday!", lastMessageDate: daysAgo(0, 11, 0), unreadCount: 0,
      messages: [
        { direction: "outbound", body: "Susan, great news! Title came back clean. We're on track for closing next Friday.", timestamp: daysAgo(1, 10, 0).toISOString(), senderName: "Marcus Williams" },
        { direction: "inbound", body: "That's wonderful! Do I need to do anything else?", timestamp: daysAgo(1, 11, 0).toISOString(), senderName: "Susan Martinez" },
        { direction: "outbound", body: "Just bring a valid ID to the title company. I'll send you the address and time once it's confirmed.", timestamp: daysAgo(1, 14, 0).toISOString(), senderName: "Marcus Williams" },
        { direction: "inbound", body: "Title company confirmed — closing next Friday!", timestamp: daysAgo(0, 11, 0).toISOString(), senderName: "Susan Martinez" },
      ],
    },
  ]);
  console.log("[seed] 8 demo conversations created.");

  // ── 14. DEMO TASKS (28 tasks) ─────────────────────────────────────
  const reps = ["Marcus Williams", "Sarah Chen", "Jessica Rivera", "Tyler Brooks"];
  const taskEntries: Array<{
    tenantId: number; title: string; contactName: string;
    propertyAddress: string; currentStage: string; assignedTo: string;
    dueDate: string; overdue: boolean; instructions: string;
  }> = [];

  // 8 overdue tasks (yesterday or earlier)
  const overdueSpecs = [
    { title: "Follow up on offer — David Thompson", contact: "David Thompson", addr: "2200 Shelby Ave, Nashville, TN", stage: "new_lead", rep: 0, ago: 2, instr: "Call David to discuss initial offer. He expressed interest last week." },
    { title: "Send comps to Maria Garcia", contact: "Maria Garcia", addr: "1100 Fatherland St, Nashville, TN", stage: "new_lead", rep: 1, ago: 1, instr: "Email 3 comparable sales within 0.5 miles to support our offer price." },
    { title: "Schedule walkthrough — Robert Lee", contact: "Robert Lee", addr: "3300 Dickerson Pike, Nashville, TN", stage: "new_lead", rep: 1, ago: 3, instr: "Robert wants a morning walkthrough. Confirm date and time via text." },
    { title: "Re-engage cold lead — Amanda Taylor", contact: "Amanda Taylor", addr: "901 Maple Ct, Nashville, TN", stage: "contacted", rep: 3, ago: 2, instr: "Amanda went cold after initial call. Try SMS + voicemail drop." },
    { title: "Update CRM notes — Karen Mitchell", contact: "Karen Mitchell", addr: "7788 Gallatin Pike, Nashville, TN", stage: "appointment_set", rep: 2, ago: 1, instr: "Add walkthrough notes and photos from yesterday's visit." },
    { title: "Submit offer — Lisa Robinson", contact: "Lisa Robinson", addr: "1414 Laurel St, Nashville, TN", stage: "contacted", rep: 2, ago: 4, instr: "Prepare and submit written offer based on walkthrough findings." },
    { title: "Call back Brian Harris", contact: "Brian Harris", addr: "8899 Fern Ct, Nashville, TN", stage: "contacted", rep: 1, ago: 1, instr: "Brian called back while you were on another line. Return his call ASAP." },
    { title: "Verify seller identity — Thomas White", contact: "Thomas White", addr: "4455 Cherry Ave, Nashville, TN", stage: "new_lead", rep: 3, ago: 5, instr: "Run skip trace to confirm Thomas is the actual property owner." },
  ];
  for (const t of overdueSpecs) {
    taskEntries.push({
      tenantId: TENANT_ID, title: t.title, contactName: t.contact,
      propertyAddress: t.addr, currentStage: t.stage, assignedTo: reps[t.rep],
      dueDate: daysAgoStr(t.ago), overdue: true, instructions: t.instr,
    });
  }

  // 12 today tasks
  const todaySpecs = [
    { title: "Call Jennifer Smith — walkthrough prep", contact: "Jennifer Smith", addr: "4455 Nolensville Pike, Nashville, TN", stage: "contacted", rep: 0, instr: "Confirm Thursday walkthrough and ask about property condition details." },
    { title: "Send contract to Michael Davis", contact: "Michael Davis", addr: "8899 Charlotte Ave, Nashville, TN", stage: "offer_made", rep: 0, instr: "Draft and send purchase agreement at $128k. Include 14-day close timeline." },
    { title: "Follow up — Carlos Mendez repair questions", contact: "Carlos Mendez", addr: "5566 Murfreesboro Pike, Nashville, TN", stage: "contacted", rep: 2, instr: "Answer Carlos's questions about expected repairs. Send repair estimate breakdown." },
    { title: "Prep closing docs — Susan Martinez", contact: "Susan Martinez", addr: "1011 8th Ave S, Nashville, TN", stage: "under_contract", rep: 0, instr: "Coordinate with title company. Ensure all docs are ready for Friday closing." },
    { title: "Call James Wilson with offer", contact: "James Wilson", addr: "6677 Lebanon Pike, Nashville, TN", stage: "appointment_set", rep: 0, instr: "Present offer based on walkthrough. Target: $175k, max allowable $185k." },
    { title: "Text Nancy Scott — offer follow-up", contact: "Nancy Scott", addr: "9900 West End Ave, Nashville, TN", stage: "offer_made", rep: 2, instr: "Check if Nancy has reviewed the $195k offer. Push for decision this week." },
    { title: "Run comps for new lead — Dickerson Pike", contact: "Robert Lee", addr: "3300 Dickerson Pike, Nashville, TN", stage: "new_lead", rep: 1, instr: "Pull 5 comparable sales within 1 mile, last 6 months. Estimate ARV and repairs." },
    { title: "Confirm closing date — Linda Johnson", contact: "Linda Johnson", addr: "1213 Broadway, Nashville, TN", stage: "under_contract", rep: 2, instr: "Touch base with title company to confirm closing date. Update Linda." },
    { title: "Cold call block — 10 new leads", contact: "", addr: "", stage: "new_lead", rep: 3, instr: "Work through today's cold call list. Target 10 dials minimum." },
    { title: "Update pipeline spreadsheet", contact: "", addr: "", stage: "", rep: 1, instr: "Update weekly pipeline tracker with new leads, offers, and contracts." },
    { title: "Review call recordings — team coaching", contact: "", addr: "", stage: "", rep: 1, instr: "Review Tyler's 3 most recent calls and prepare coaching notes." },
    { title: "Coordinate with dispo — Richard Clark property", contact: "Richard Clark", addr: "1415 Music Row, Nashville, TN", stage: "closed", rep: 3, instr: "Ensure buyer side closing is on track. Confirm assignment fee collection." },
  ];
  for (const t of todaySpecs) {
    taskEntries.push({
      tenantId: TENANT_ID, title: t.title, contactName: t.contact,
      propertyAddress: t.addr, currentStage: t.stage, assignedTo: reps[t.rep],
      dueDate: todayStr(), overdue: false, instructions: t.instr,
    });
  }

  // 8 upcoming tasks (next 1-2 days)
  const upcomingSpecs = [
    { title: "Walkthrough — Jennifer Smith", contact: "Jennifer Smith", addr: "4455 Nolensville Pike, Nashville, TN", stage: "contacted", rep: 0, days: 1, instr: "Thursday 2pm walkthrough. Bring camera and repair checklist." },
    { title: "Follow up on offer — Michael Davis", contact: "Michael Davis", addr: "8899 Charlotte Ave, Nashville, TN", stage: "offer_made", rep: 0, days: 1, instr: "Call Michael if he hasn't accepted by EOD today." },
    { title: "Send marketing packet to Derek Patel", contact: "Derek Patel", addr: "", stage: "qualified", rep: 3, days: 1, instr: "Send new deal sheet for Charlotte Ave property to buyer Derek Patel." },
    { title: "Inspection — 1011 8th Ave S", contact: "Susan Martinez", addr: "1011 8th Ave S, Nashville, TN", stage: "under_contract", rep: 0, days: 2, instr: "Meet inspector at property. Document any findings for buyer." },
    { title: "Closing — Linda Johnson property", contact: "Linda Johnson", addr: "1213 Broadway, Nashville, TN", stage: "under_contract", rep: 2, days: 2, instr: "Attend closing at title company. Bring all original signed docs." },
    { title: "Team training — objection handling", contact: "", addr: "", stage: "", rep: 1, days: 1, instr: "Run team training session on top 5 seller objections." },
    { title: "Review new skip trace results", contact: "", addr: "", stage: "new_lead", rep: 1, days: 2, instr: "Review batch of 50 skip trace results and add best leads to call list." },
    { title: "Call Karen Mitchell — post-walkthrough", contact: "Karen Mitchell", addr: "7788 Gallatin Pike, Nashville, TN", stage: "appointment_set", rep: 2, days: 1, instr: "Discuss walkthrough findings and present preliminary offer range." },
  ];
  for (const t of upcomingSpecs) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + t.days);
    taskEntries.push({
      tenantId: TENANT_ID, title: t.title, contactName: t.contact,
      propertyAddress: t.addr, currentStage: t.stage, assignedTo: reps[t.rep],
      dueDate: futureDate.toISOString().slice(0, 10), overdue: false, instructions: t.instr,
    });
  }

  await db.insert(demoTasks).values(taskEntries);
  console.log("[seed] 28 demo tasks created.");

  console.log("[seed] ✅ Demo tenant (Apex Property Solutions) seeded successfully!");
}

// Allow running directly: npx tsx server/seeds/seedDemoTenant.ts
seedDemoTenant()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[seed] ❌ Error seeding demo tenant:", e);
    process.exit(1);
  });
