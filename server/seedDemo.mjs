/**
 * Demo Account Seed Script
 * Creates a demo tenant with realistic fake data for sales demos.
 * 
 * Team: 2 cold callers, 2 lead managers, 1 acquisition manager
 * Calls: ~160 calls over 6 weeks with upward-trending grades
 * 
 * Run: node server/seedDemo.mjs
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Parse DATABASE_URL
const url = new URL(DATABASE_URL);
const pool = mysql.createPool({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: true },
  waitForConnections: true,
  connectionLimit: 5,
});

// ============ DEMO CONFIG ============
const DEMO_EMAIL = 'demo@getgunner.ai';
const DEMO_PASSWORD = 'DemoGunner2026!';
const DEMO_TENANT_NAME = 'Apex Property Solutions';
const DEMO_TENANT_SLUG = 'demo-apex';

const TEAM_MEMBERS = [
  { name: 'Marcus Rivera', role: 'lead_generator' },
  { name: 'Tanya Brooks', role: 'lead_generator' },
  { name: 'Jason Whitfield', role: 'lead_manager' },
  { name: 'Brianna Cole', role: 'lead_manager' },
  { name: 'Derek Lawson', role: 'acquisition_manager' },
];

// Realistic contact names
const CONTACTS = [
  'Patricia Henderson', 'Robert Mitchell', 'Linda Vasquez', 'James Thornton',
  'Maria Gonzalez', 'William Foster', 'Dorothy Chambers', 'Michael Reeves',
  'Barbara Sullivan', 'David Morales', 'Susan Hawkins', 'Richard Patel',
  'Jennifer Nguyen', 'Charles Dixon', 'Elizabeth Warren', 'Thomas Keller',
  'Margaret Ortiz', 'Christopher Banks', 'Nancy Simmons', 'Daniel Crawford',
  'Karen Fletcher', 'Matthew Pearson', 'Betty Armstrong', 'Anthony Dunn',
  'Sandra Hicks', 'Mark Estrada', 'Ashley Carpenter', 'Steven Barker',
  'Donna Watts', 'Paul Mendoza', 'Carol Gibson', 'Andrew Marsh',
  'Ruth Stephens', 'Joshua Soto', 'Sharon Tucker', 'Kenneth Guerrero',
  'Deborah Payne', 'Brian Medina', 'Michelle Flowers', 'George Ramsey',
];

const STREETS = [
  'Oak', 'Maple', 'Cedar', 'Elm', 'Pine', 'Birch', 'Walnut', 'Cherry',
  'Willow', 'Magnolia', 'Pecan', 'Cypress', 'Hickory', 'Spruce', 'Poplar',
];
const STREET_TYPES = ['St', 'Ave', 'Dr', 'Ln', 'Blvd', 'Ct', 'Way', 'Pl'];
const CITIES = [
  'Dallas, TX', 'Fort Worth, TX', 'Arlington, TX', 'Plano, TX', 'Irving, TX',
  'Garland, TX', 'Mesquite, TX', 'McKinney, TX', 'Frisco, TX', 'Denton, TX',
];

function randomAddress() {
  const num = Math.floor(Math.random() * 9000) + 1000;
  const street = STREETS[Math.floor(Math.random() * STREETS.length)];
  const type = STREET_TYPES[Math.floor(Math.random() * STREET_TYPES.length)];
  const city = CITIES[Math.floor(Math.random() * CITIES.length)];
  return `${num} ${street} ${type}, ${city}`;
}

function randomPhone() {
  const area = Math.floor(Math.random() * 900) + 100;
  const mid = Math.floor(Math.random() * 900) + 100;
  const end = Math.floor(Math.random() * 9000) + 1000;
  return `+1${area}${mid}${end}`;
}

// ============ TRANSCRIPT TEMPLATES ============
const COLD_CALL_TRANSCRIPTS = [
  (contact, rep) => `${rep}: Hey ${contact.split(' ')[0]}, this is ${rep} with Apex Property Solutions. How are you doing today?\n${contact}: I'm alright, who is this?\n${rep}: I'm calling because we buy houses in the ${contact.includes('Dallas') ? 'Dallas' : 'DFW'} area and I noticed you might have a property. Have you ever thought about selling?\n${contact}: Actually yeah, I've been thinking about it. The house needs a lot of work.\n${rep}: Oh really? What kind of work does it need?\n${contact}: The roof is leaking, the kitchen is outdated, and the foundation has some cracks.\n${rep}: I see. Well we actually specialize in buying houses as-is, so you wouldn't need to fix any of that. Would you be open to hearing what we could offer?\n${contact}: Maybe. What's the process like?\n${rep}: It's pretty simple. One of our team members would come take a look, and we can usually make an offer within 24 hours. No fees, no commissions. Can I have someone reach out to schedule a quick walkthrough?\n${contact}: Sure, that sounds fine. Give me a call tomorrow afternoon.`,
  (contact, rep) => `${rep}: Hi there, is this ${contact}?\n${contact}: Yes, who's calling?\n${rep}: This is ${rep} from Apex Property Solutions. We're a local company that buys homes in the area. I was reaching out to see if you've considered selling your property.\n${contact}: Not really interested. I'm not looking to sell.\n${rep}: No problem at all. I totally understand. Just so you know, we're always here if anything changes. We buy homes as-is, no repairs needed, and we can close on your timeline. Would it be okay if I followed up in a few months?\n${contact}: Yeah that's fine. But I'm really not interested right now.\n${rep}: Absolutely, I respect that. Have a great day ${contact.split(' ')[0]}!`,
  (contact, rep) => `${rep}: Good morning, this is ${rep} calling from Apex Property Solutions. Am I speaking with ${contact}?\n${contact}: Yeah, what do you want?\n${rep}: I apologize for the cold call. We're a local real estate company and we noticed your property might be a good fit for our buying program. Are you familiar with what we do?\n${contact}: You buy houses right? I've gotten a bunch of these calls.\n${rep}: I understand, and I know it can be annoying. What makes us different is we actually close. We've bought over 50 homes in the last year right here in DFW. Is selling something you'd even consider?\n${contact}: I mean, the house is getting expensive to maintain. What would you even offer?\n${rep}: Well it depends on the property. Can you tell me a little about it? How many bedrooms and bathrooms?\n${contact}: It's a 3 bed 2 bath, about 1,800 square feet. Built in the 80s.\n${rep}: Got it. And what condition is it in?\n${contact}: It's okay. Needs new carpet, the AC is on its last legs, and the bathrooms are dated.\n${rep}: That's actually perfect for us. We handle all that. Let me have one of our lead managers give you a call to go over the details. What time works best for you?\n${contact}: Afternoons are better. After 2pm.\n${rep}: Perfect, we'll reach out tomorrow afternoon. Thanks ${contact.split(' ')[0]}!`,
];

const QUALIFICATION_TRANSCRIPTS = [
  (contact, rep) => `${rep}: Hey ${contact.split(' ')[0]}, this is ${rep} from Apex Property Solutions. I believe my colleague spoke with you yesterday about your property. How are you?\n${contact}: Yeah, I remember. I'm doing okay.\n${rep}: Great! So I wanted to learn a little more about your situation. You mentioned the house needs some work. Can you walk me through what's going on?\n${contact}: Well, I inherited the house from my mom about two years ago. I've been renting it out but the tenant just moved out and left it in rough shape. I don't want to put more money into it.\n${rep}: I'm sorry to hear that. That's a really common situation we help people with. So the property is vacant right now?\n${contact}: Yeah, it's been empty for about a month.\n${rep}: And what are you hoping to get for it? Do you have a number in mind?\n${contact}: I was thinking around 180. That's what Zillow says.\n${rep}: I appreciate you sharing that. Zillow can be a good starting point but it doesn't always account for condition. Once we see the property, we can give you a real number. Would you be available for a walkthrough this week?\n${contact}: I could do Thursday.\n${rep}: Thursday works great. Morning or afternoon?\n${contact}: Let's say 10am.\n${rep}: Perfect. I'll be there at 10am Thursday. I'll text you a confirmation. Thanks ${contact.split(' ')[0]}!`,
  (contact, rep) => `${rep}: Hi ${contact.split(' ')[0]}, it's ${rep} with Apex Property Solutions. Thanks for taking my call. I understand you're thinking about selling your property?\n${contact}: Yeah, my husband and I are going through a divorce and we need to sell the house.\n${rep}: I'm sorry to hear about the situation. We've helped a lot of families in similar circumstances. The good thing is we can make this process really smooth and fast. Tell me about the property.\n${contact}: It's a 4 bedroom, 2.5 bath in ${CITIES[0]}. We bought it in 2015 for about 220.\n${rep}: And what's the condition like?\n${contact}: It's in decent shape honestly. We've maintained it. New roof two years ago. The only thing is the master bathroom needs updating.\n${rep}: That sounds like a nice property. And what's your timeline? When do you need to close by?\n${contact}: As soon as possible honestly. The lawyers want this resolved.\n${rep}: We can definitely work with that. We've closed in as little as 10 days before. Let me get some more details and we'll put together a number for you. What do you owe on the mortgage?\n${contact}: About 160.\n${rep}: Okay, that's helpful. Let me schedule a walkthrough so we can give you a fair offer. How does this week look?\n${contact}: Tomorrow would be great actually.\n${rep}: Let's do it. I'll be there at 2pm. Sound good?\n${contact}: Yes, thank you so much.`,
];

const OFFER_TRANSCRIPTS = [
  (contact, rep) => `${rep}: ${contact.split(' ')[0]}, thanks for meeting with me again. I've had a chance to run the numbers on your property and I want to go over everything with you.\n${contact}: Okay, I'm ready to hear it.\n${rep}: So after looking at the property, the comps in the area, and the repairs needed, we're able to offer you $155,000 cash.\n${contact}: That's lower than I was hoping. I was thinking more like 180.\n${rep}: I understand. Let me walk you through how we got there. The ARV — that's what the house would be worth fully renovated — is about $220,000. We're estimating about $35,000 in repairs for the roof, kitchen, and foundation work. After our costs and margins, $155,000 is the strongest offer we can make.\n${contact}: I don't know... that's a big gap from what I wanted.\n${rep}: I hear you. Keep in mind though, with us there are zero commissions, zero closing costs, and we close on your timeline. If you listed with an agent, you'd pay 6% in commissions plus repairs, staging, and months of waiting. Net-net, you'd probably end up in a similar place.\n${contact}: That's true. Let me think about it for a day or two.\n${rep}: Absolutely, take your time. This offer is good for 7 days. I'll follow up with you on Friday. Does that work?\n${contact}: Yeah, that's fine. Thanks Derek.`,
  (contact, rep) => `${rep}: Hey ${contact.split(' ')[0]}, I've got great news. We've completed our analysis and I'm ready to present our offer.\n${contact}: Okay, let's hear it.\n${rep}: Based on the condition of the property and the market, we can offer you $142,000 cash, close in 14 days.\n${contact}: Hmm, I was hoping for at least 160.\n${rep}: I understand. Here's the thing — your property needs about $40,000 in work. New HVAC, updated electrical, and the kitchen and bathrooms. When we factor all that in, $142,000 is actually a strong offer.\n${contact}: What if I did some of the repairs myself?\n${rep}: You could, but that would take time and money upfront. With us, you walk away with cash in two weeks, no hassle. No contractors, no permits, no surprises.\n${contact}: You make a good point. Can you do $150,000?\n${rep}: Let me see what I can do. If I can get to $148,000, would you be ready to move forward today?\n${contact}: Yeah, I think I could do that.\n${rep}: Let me make a call and I'll get right back to you. This is exciting!`,
];

const FOLLOW_UP_TRANSCRIPTS = [
  (contact, rep) => `${rep}: Hey ${contact.split(' ')[0]}, it's ${rep} from Apex Property Solutions. We spoke about two weeks ago about your property. How are things going?\n${contact}: Oh hey, yeah I remember. Things are about the same.\n${rep}: Last time we talked, you mentioned you were thinking about our offer of $155,000. Have you had a chance to think it over?\n${contact}: Yeah, I've been going back and forth. Part of me wants to just list it.\n${rep}: I totally understand that. Have you gotten any estimates from agents on what it would sell for?\n${contact}: One agent said maybe 190 but it would need about 20k in work first.\n${rep}: Right, and after the 6% commission that's about $11,400, plus the $20k in repairs, plus holding costs while it sits on the market. You're looking at netting around $158,000 — and that's if it sells at full price.\n${contact}: When you put it that way...\n${rep}: With us, you get $155,000 cash, no repairs, no waiting, close in two weeks. The numbers are actually really close, but you save months of stress.\n${contact}: Okay, let me talk to my wife tonight and I'll call you back tomorrow.\n${rep}: Sounds great. I'll be here. Talk soon!`,
];

const ADMIN_TRANSCRIPTS = [
  (contact, rep) => `${rep}: Hi ${contact.split(' ')[0]}, it's ${rep} from Apex Property Solutions. I'm calling about the purchase agreement we sent over. Did you get a chance to look at it?\n${contact}: Yeah, I got the email but I haven't opened it yet.\n${rep}: No worries! It's a DocuSign link so it's really easy. You just click the link, review the terms, and sign electronically. Should take about 5 minutes.\n${contact}: Okay, I'll do it tonight.\n${rep}: Perfect. Once you sign, we'll get the title company started and we should be able to close within two weeks. Do you have any questions about anything in the agreement?\n${contact}: No, I think we covered everything last time.\n${rep}: Great. I'll follow up tomorrow to make sure everything went through. Have a good evening!`,
];

// ============ GRADE GENERATION ============
// Scores trend upward over 6 weeks
function generateScore(weekIndex, memberIndex) {
  // Base score starts low and trends up
  const baseByWeek = [52, 58, 65, 72, 78, 84];
  const base = baseByWeek[weekIndex] || 84;
  
  // Add some per-member variance (-8 to +8)
  const memberVariance = (memberIndex * 3 - 6);
  
  // Add randomness (-12 to +12)
  const noise = (Math.random() - 0.5) * 24;
  
  let score = base + memberVariance + noise;
  
  // Clamp to realistic range
  score = Math.max(35, Math.min(98, score));
  
  return Math.round(score * 10) / 10;
}

function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function generateCriteriaScores(overallScore, callType) {
  const criteriaMap = {
    cold_call: ['Opening & Introduction', 'Interest Generation', 'Property Discovery', 'Objection Handling', 'Call Control'],
    qualification: ['Rapport Building', 'Motivation Discovery', 'Property Assessment', 'Timeline & Urgency', 'Appointment Setting'],
    offer: ['Offer Presentation', 'Value Justification', 'Objection Handling', 'Negotiation Skills', 'Closing Technique'],
    follow_up: ['Re-engagement', 'Previous Offer Reference', 'Roadblock Discovery', 'Decision Push', 'Next Steps'],
    seller_callback: ['Callback Acknowledgment', 'Intent Matching', 'Qualification', 'Momentum Capture', 'Commitment'],
    admin_callback: ['Purpose Statement', 'Task Execution', 'Professionalism', 'Next Steps', 'Efficiency'],
  };
  
  const criteria = criteriaMap[callType] || criteriaMap.qualification;
  return criteria.map(name => {
    const maxPoints = 20;
    const variance = (Math.random() - 0.5) * 8;
    const score = Math.max(5, Math.min(20, Math.round((overallScore / 100) * maxPoints + variance)));
    return { name, score, maxPoints };
  });
}

function generateStrengths(score) {
  const allStrengths = [
    'Strong opening that immediately established rapport',
    'Excellent active listening — let the seller talk',
    'Good use of empathy when discussing seller motivation',
    'Smooth transition from discovery to next steps',
    'Professional tone throughout the entire call',
    'Effectively addressed pricing objection with data',
    'Created urgency without being pushy',
    'Good follow-up question technique',
    'Clearly explained the process and timeline',
    'Built trust by sharing relevant success stories',
  ];
  const count = score >= 80 ? 3 : score >= 60 ? 2 : 1;
  const shuffled = allStrengths.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateImprovements(score) {
  const allImprovements = [
    'Ask more open-ended questions to uncover motivation',
    'Pause after asking key questions — give the seller time to respond',
    'Reference specific comps when justifying the offer price',
    'Confirm the decision maker before presenting numbers',
    'Set a specific callback time instead of leaving it open',
    'Address the "I need to think about it" objection more directly',
    'Dig deeper into the seller\'s timeline and urgency',
    'Use the seller\'s own words to build your case',
    'Slow down during the offer presentation',
    'Ask about competing offers or other buyers',
  ];
  const count = score >= 80 ? 1 : score >= 60 ? 2 : 3;
  const shuffled = allImprovements.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateCoachingTips(callType) {
  const tips = {
    cold_call: [
      'Try leading with a local reference — "I noticed your property on Oak Street" builds instant credibility',
      'When they say "not interested," ask "Is it the timing or the concept?" to keep the door open',
    ],
    qualification: [
      'Use the "1-10 scale" technique: "On a scale of 1-10, how motivated are you to sell?" Then ask what would make it a 10',
      'Always confirm the decision maker early: "Is there anyone else involved in this decision?"',
    ],
    offer: [
      'Present the offer as a range first, then narrow down. "Based on our analysis, we\'re looking at $140-155k" feels less rigid',
      'When they counter, don\'t respond immediately. Pause, then say "Help me understand how you got to that number"',
    ],
    follow_up: [
      'Reference the exact offer amount from last time: "Last time we discussed $155,000" — it anchors the conversation',
      'Ask "What\'s changed since we last spoke?" to surface new motivation or objections',
    ],
    seller_callback: [
      'Match their energy — if they called back, they\'re interested. Don\'t run a cold call script',
      'Ask "What made you decide to call back?" to understand their trigger',
    ],
    admin_callback: [
      'State the purpose of the call in the first 10 seconds',
      'Always confirm next steps with a specific date and time before hanging up',
    ],
  };
  return tips[callType] || tips.qualification;
}

function generateRedFlags(score) {
  if (score >= 75) return [];
  const flags = [
    'Talked over the seller multiple times',
    'Failed to ask about motivation',
    'Didn\'t set a clear next step',
    'Rushed through the offer without building value',
    'Missed an obvious buying signal',
  ];
  const count = score < 50 ? 2 : 1;
  return flags.sort(() => Math.random() - 0.5).slice(0, count);
}

function generateSummary(contact, callType, score) {
  const firstName = contact.split(' ')[0];
  if (callType === 'cold_call') {
    return score >= 70 
      ? `Good cold call with ${firstName}. Rep established rapport quickly and identified potential interest. ${firstName} has a property that needs work and is open to hearing an offer. Follow-up scheduled.`
      : `Cold call with ${firstName}. Rep struggled with the opening and didn't fully explore the seller's situation. Need to work on asking more discovery questions before moving to next steps.`;
  }
  if (callType === 'qualification') {
    return score >= 70
      ? `Strong qualification call with ${firstName}. Uncovered clear motivation (${['divorce', 'inherited property', 'tired landlord', 'relocation', 'financial hardship'][Math.floor(Math.random() * 5)]}). Property details gathered and walkthrough scheduled.`
      : `Qualification call with ${firstName}. Some motivation uncovered but rep missed opportunities to dig deeper. Timeline and decision maker not fully confirmed.`;
  }
  if (callType === 'offer') {
    return score >= 70
      ? `Offer presented to ${firstName}. Rep did a good job justifying the price with comps and repair estimates. ${firstName} is considering the offer and will respond within the week.`
      : `Offer call with ${firstName}. The presentation lacked supporting data and ${firstName} pushed back on price. Rep needs to come more prepared with comps.`;
  }
  if (callType === 'follow_up') {
    return `Follow-up call with ${firstName}. Referenced previous conversation and offer. ${score >= 70 ? 'Good job resurfacing motivation and pushing for a decision.' : 'Missed opportunity to create urgency. Should have anchored the previous offer amount earlier.'}`;
  }
  return `Admin call with ${firstName}. ${score >= 70 ? 'Efficiently handled the administrative task and confirmed next steps.' : 'Call could have been more focused. Took too long to get to the point.'}`;
}

// ============ OBJECTION HANDLING ============
function generateObjectionHandling(callType) {
  if (callType === 'admin_callback' || callType === 'seller_callback') return [];
  const objections = [
    {
      objection: "That's lower than I expected",
      context: "Seller pushed back on the initial offer price",
      suggestedResponses: [
        "I understand. Let me walk you through how we arrived at that number so you can see the full picture.",
        "What number were you hoping for? Let's see if we can find some middle ground.",
        "Keep in mind, with us there are zero commissions, zero closing costs, and zero repairs. When you factor all that in, the net is actually very competitive."
      ]
    },
    {
      objection: "I need to think about it",
      context: "Seller hesitated to commit after hearing the offer",
      suggestedResponses: [
        "Absolutely, take your time. What specifically would you like to think about? Maybe I can help clarify.",
        "Of course. Is there a specific concern I can address right now that might help with your decision?",
        "I respect that. Just so you know, this offer is good for 7 days. Can I follow up with you on Thursday?"
      ]
    },
    {
      objection: "I want to list it with an agent first",
      context: "Seller considering traditional listing",
      suggestedResponses: [
        "That's totally fair. Have you gotten an estimate from an agent? Let's compare the net numbers side by side.",
        "I understand wanting to explore all options. Just keep in mind — after 6% commissions, repairs, staging, and 3-6 months on market, the net is often very close to our cash offer.",
        "No problem. Our offer stands if the listing doesn't work out. A lot of our sellers come back to us after trying the traditional route."
      ]
    },
  ];
  return [objections[Math.floor(Math.random() * objections.length)]];
}

// ============ OPPORTUNITY GENERATION ============
function generateOpportunities(tenantId, teamMemberIds, callIds) {
  const opps = [];
  const tiers = ['missed', 'warning', 'possible'];
  const reasons = [
    { tier: 'missed', reason: 'Seller agreed to price range but no follow-up was scheduled. Lead has gone cold for 5 days.', suggestion: 'Call immediately and reference the agreed price. Ask what prevented them from moving forward.' },
    { tier: 'missed', reason: 'Motivated seller (divorce situation) expressed urgency but rep didn\'t set a walkthrough. 3 days with no contact.', suggestion: 'Schedule walkthrough ASAP. Lead with empathy about their situation and emphasize your fast timeline.' },
    { tier: 'warning', reason: 'Property in high-demand area dismissed after one call. Seller said "not right now" but mentioned needing cash for medical bills.', suggestion: 'Re-engage with a soft touch. Reference the medical situation and position your offer as a stress-free solution.' },
    { tier: 'warning', reason: 'Seller countered at $165k vs our $148k offer. Gap is closable but no counter-offer was made. 4 days stale.', suggestion: 'Come back with a revised offer at $155k. Use comps to justify and create urgency with a 48-hour window.' },
    { tier: 'possible', reason: 'Repeat inbound call from seller — called twice in one week asking about the process. High intent signal not acted on.', suggestion: 'Prioritize this lead. They\'re actively seeking a solution. Schedule a same-day walkthrough if possible.' },
    { tier: 'possible', reason: 'Inherited property owner mentioned "just want it gone" but was told to "think about it" by rep. Potential quick close missed.', suggestion: 'Call back and present a firm offer. This seller has low attachment and high motivation — ideal for a fast close.' },
  ];
  
  for (let i = 0; i < 8; i++) {
    const r = reasons[i % reasons.length];
    const contactIdx = Math.floor(Math.random() * CONTACTS.length);
    const tmIdx = Math.floor(Math.random() * teamMemberIds.length);
    opps.push({
      tenantId,
      contactName: CONTACTS[contactIdx],
      contactPhone: randomPhone(),
      propertyAddress: randomAddress(),
      tier: r.tier,
      priorityScore: r.tier === 'missed' ? 90 + Math.floor(Math.random() * 10) : r.tier === 'warning' ? 70 + Math.floor(Math.random() * 20) : 50 + Math.floor(Math.random() * 20),
      triggerRules: JSON.stringify(['stale_deal', 'high_motivation']),
      reason: r.reason,
      suggestion: r.suggestion,
      detectionSource: 'hybrid',
      relatedCallId: callIds[Math.floor(Math.random() * callIds.length)],
      teamMemberId: teamMemberIds[tmIdx],
      teamMemberName: TEAM_MEMBERS[tmIdx].name,
      status: i < 2 ? 'handled' : 'active',
      ourOffer: 140000 + Math.floor(Math.random() * 30000),
      sellerAsk: 170000 + Math.floor(Math.random() * 30000),
      flaggedAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)),
    });
  }
  return opps;
}

// ============ MAIN SEED FUNCTION ============
async function seed() {
  const conn = await pool.getConnection();
  
  try {
    console.log('🌱 Starting demo seed...');
    
    // Check if demo tenant already exists
    const [existing] = await conn.query('SELECT id FROM tenants WHERE slug = ?', [DEMO_TENANT_SLUG]);
    if (existing.length > 0) {
      console.log('⚠️  Demo tenant already exists. Cleaning up first...');
      const tenantId = existing[0].id;
      // Clean up in reverse dependency order
      await conn.query('DELETE FROM xp_transactions WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM user_xp WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM user_streaks WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM user_badges WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM badge_progress WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM coach_messages WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM coach_action_edits WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM coach_action_log WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM opportunities WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM call_grades WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM calls WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM team_assignments WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM team_members WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM users WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM tenants WHERE id = ?', [tenantId]);
      console.log('✅ Cleaned up existing demo data');
    }
    
    // 1. Create demo tenant
    console.log('📦 Creating demo tenant...');
    const [tenantResult] = await conn.query(
      `INSERT INTO tenants (name, slug, subscriptionTier, subscriptionStatus, maxUsers, crmType, crmConnected, onboardingStep, onboardingCompleted, trialEndsAt)
       VALUES (?, ?, 'scale', 'active', 999, 'ghl', 'true', 5, 'true', ?)`,
      [DEMO_TENANT_NAME, DEMO_TENANT_SLUG, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)]
    );
    const tenantId = tenantResult.insertId;
    console.log(`  Tenant ID: ${tenantId}`);
    
    // 2. Create demo admin user
    console.log('👤 Creating demo admin user...');
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const openId = `demo_${crypto.randomBytes(16).toString('hex')}`;
    const [userResult] = await conn.query(
      `INSERT INTO users (tenantId, openId, name, email, passwordHash, loginMethod, role, teamRole, isTenantAdmin, emailVerified)
       VALUES (?, ?, 'Demo Admin', ?, ?, 'email_password', 'admin', 'admin', 'true', 'true')`,
      [tenantId, openId, DEMO_EMAIL, passwordHash]
    );
    const adminUserId = userResult.insertId;
    console.log(`  Admin User ID: ${adminUserId}`);
    
    // 3. Create team members
    console.log('👥 Creating team members...');
    const teamMemberIds = [];
    for (const tm of TEAM_MEMBERS) {
      const [tmResult] = await conn.query(
        `INSERT INTO team_members (tenantId, name, teamRole, isActive)
         VALUES (?, ?, ?, 'true')`,
        [tenantId, tm.name, tm.role]
      );
      teamMemberIds.push(tmResult.insertId);
      console.log(`  ${tm.name} (${tm.role}) → ID: ${tmResult.insertId}`);
    }
    
    // 4. Create team assignments (LMs → AM)
    console.log('🔗 Creating team assignments...');
    const amId = teamMemberIds[4]; // Derek Lawson (AM)
    for (let i = 2; i <= 3; i++) { // Jason and Brianna (LMs)
      await conn.query(
        `INSERT INTO team_assignments (tenantId, leadManagerId, acquisitionManagerId)
         VALUES (?, ?, ?)`,
        [tenantId, teamMemberIds[i], amId]
      );
    }
    
    // 5. Create calls with grades over 6 weeks
    console.log('📞 Creating calls with grades...');
    const now = Date.now();
    const SIX_WEEKS = 6 * 7 * 24 * 60 * 60 * 1000;
    const callIds = [];
    let totalCalls = 0;
    
    for (let week = 0; week < 6; week++) {
      // More calls in recent weeks (realistic growth)
      const callsThisWeek = 20 + week * 4;
      
      for (let c = 0; c < callsThisWeek; c++) {
        // Pick team member
        const memberIdx = c % 5;
        const member = TEAM_MEMBERS[memberIdx];
        const memberId = teamMemberIds[memberIdx];
        
        // Determine call type based on role
        let callType, rubricType, transcript;
        const contact = CONTACTS[Math.floor(Math.random() * CONTACTS.length)];
        
        if (member.role === 'lead_generator') {
          callType = 'cold_call';
          rubricType = 'lead_generator';
          const tmpl = COLD_CALL_TRANSCRIPTS[Math.floor(Math.random() * COLD_CALL_TRANSCRIPTS.length)];
          transcript = tmpl(contact, member.name);
        } else if (member.role === 'lead_manager') {
          const types = ['qualification', 'follow_up', 'seller_callback'];
          const weights = [0.6, 0.25, 0.15];
          const r = Math.random();
          if (r < weights[0]) {
            callType = 'qualification';
            rubricType = 'lead_manager';
            const tmpl = QUALIFICATION_TRANSCRIPTS[Math.floor(Math.random() * QUALIFICATION_TRANSCRIPTS.length)];
            transcript = tmpl(contact, member.name);
          } else if (r < weights[0] + weights[1]) {
            callType = 'follow_up';
            rubricType = 'follow_up';
            const tmpl = FOLLOW_UP_TRANSCRIPTS[0];
            transcript = tmpl(contact, member.name);
          } else {
            callType = 'seller_callback';
            rubricType = 'seller_callback';
            const tmpl = QUALIFICATION_TRANSCRIPTS[0]; // reuse with slight variation
            transcript = tmpl(contact, member.name);
          }
        } else { // acquisition_manager
          const types = ['offer', 'admin_callback'];
          if (Math.random() < 0.7) {
            callType = 'offer';
            rubricType = 'acquisition_manager';
            const tmpl = OFFER_TRANSCRIPTS[Math.floor(Math.random() * OFFER_TRANSCRIPTS.length)];
            transcript = tmpl(contact, member.name);
          } else {
            callType = 'admin_callback';
            rubricType = 'admin_callback';
            const tmpl = ADMIN_TRANSCRIPTS[0];
            transcript = tmpl(contact, member.name);
          }
        }
        
        // Generate score with upward trend
        const score = generateScore(week, memberIdx);
        const grade = scoreToGrade(score);
        
        // Calculate timestamp within this week
        const weekStart = now - SIX_WEEKS + (week * 7 * 24 * 60 * 60 * 1000);
        const dayOffset = Math.floor(Math.random() * 5) * 24 * 60 * 60 * 1000; // Mon-Fri
        const hourOffset = (9 + Math.floor(Math.random() * 8)) * 60 * 60 * 1000; // 9am-5pm
        const callTime = new Date(weekStart + dayOffset + hourOffset);
        
        // Determine outcome based on call type and score
        let callOutcome = 'none';
        if (callType === 'cold_call') {
          callOutcome = score >= 75 ? 'interested' : score >= 60 ? 'callback_scheduled' : Math.random() < 0.5 ? 'not_interested' : 'left_vm';
        } else if (callType === 'qualification') {
          callOutcome = score >= 80 ? 'appointment_set' : score >= 65 ? 'interested' : 'callback_scheduled';
        } else if (callType === 'offer') {
          callOutcome = score >= 85 ? 'offer_made' : score >= 60 ? 'offer_made' : 'callback_scheduled';
        } else if (callType === 'follow_up') {
          callOutcome = score >= 75 ? 'interested' : 'callback_scheduled';
        } else {
          callOutcome = 'none';
        }
        
        const duration = 60 + Math.floor(Math.random() * 540); // 1-10 minutes
        const classification = callType === 'admin_callback' ? 'admin_call' : 'conversation';
        
        // Insert call
        const [callResult] = await conn.query(
          `INSERT INTO calls (tenantId, callSource, ghlCallId, contactName, contactPhone, propertyAddress, 
           duration, callDirection, teamMemberId, teamMemberName, callType, callTypeSource, callOutcome,
           classification, status, transcript, callTimestamp, createdAt)
           VALUES (?, 'batchdialer', ?, ?, ?, ?, ?, 'outbound', ?, ?, ?, 'ai_suggested', ?, ?, 'completed', ?, ?, ?)`,
          [
            tenantId,
            `demo_${crypto.randomBytes(8).toString('hex')}`,
            contact,
            randomPhone(),
            randomAddress(),
            duration,
            memberId,
            member.name,
            callType,
            callOutcome,
            classification,
            transcript,
            callTime,
            callTime,
          ]
        );
        const callId = callResult.insertId;
        callIds.push(callId);
        
        // Insert grade
        const criteriaScores = generateCriteriaScores(score, callType);
        const strengths = generateStrengths(score);
        const improvements = generateImprovements(score);
        const coachingTips = generateCoachingTips(callType);
        const redFlags = generateRedFlags(score);
        const objectionHandling = generateObjectionHandling(callType);
        const summary = generateSummary(contact, callType, score);
        
        await conn.query(
          `INSERT INTO call_grades (tenantId, callId, overallScore, overallGrade, criteriaScores, 
           strengths, improvements, coachingTips, redFlags, objectionHandling, summary, rubricType, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId, callId, score.toString(), grade,
            JSON.stringify(criteriaScores),
            JSON.stringify(strengths),
            JSON.stringify(improvements),
            JSON.stringify(coachingTips),
            JSON.stringify(redFlags),
            JSON.stringify(objectionHandling),
            summary,
            rubricType,
            callTime,
          ]
        );
        
        totalCalls++;
      }
      console.log(`  Week ${week + 1}: ${20 + week * 4} calls seeded`);
    }
    
    // 6. Create gamification data
    console.log('🏆 Creating gamification data...');
    for (let i = 0; i < teamMemberIds.length; i++) {
      const memberId = teamMemberIds[i];
      // Streaks
      const hotStreak = 3 + Math.floor(Math.random() * 8);
      const consistencyStreak = 5 + Math.floor(Math.random() * 15);
      await conn.query(
        `INSERT INTO user_streaks (tenantId, teamMemberId, hotStreakCurrent, hotStreakBest, consistencyStreakCurrent, consistencyStreakBest, consistencyLastDate)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, memberId, hotStreak, hotStreak + 3, consistencyStreak, consistencyStreak + 5, new Date().toISOString().split('T')[0]]
      );
      // XP
      const totalXp = 500 + Math.floor(Math.random() * 2000);
      await conn.query(
        `INSERT INTO user_xp (tenantId, teamMemberId, totalXp)
         VALUES (?, ?, ?)`,
        [tenantId, memberId, totalXp]
      );
    }
    
    // 7. Create opportunities
    console.log('🎯 Creating opportunities...');
    const opps = generateOpportunities(tenantId, teamMemberIds, callIds);
    for (const opp of opps) {
      await conn.query(
        `INSERT INTO opportunities (tenantId, contactName, contactPhone, propertyAddress, tier, priorityScore,
         triggerRules, reason, suggestion, detectionSource, relatedCallId, teamMemberId, teamMemberName,
         status, ourOffer, sellerAsk, flaggedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          opp.tenantId, opp.contactName, opp.contactPhone, opp.propertyAddress,
          opp.tier, opp.priorityScore, opp.triggerRules, opp.reason, opp.suggestion,
          opp.detectionSource, opp.relatedCallId, opp.teamMemberId, opp.teamMemberName,
          opp.status, opp.ourOffer, opp.sellerAsk, opp.flaggedAt,
        ]
      );
    }
    
    console.log('\n✅ Demo seed complete!');
    console.log(`  Tenant: ${DEMO_TENANT_NAME} (ID: ${tenantId})`);
    console.log(`  Admin: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    console.log(`  Team Members: ${TEAM_MEMBERS.length}`);
    console.log(`  Calls: ${totalCalls}`);
    console.log(`  Opportunities: ${opps.length}`);
    console.log(`  Gamification: streaks + XP for all members`);
    
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch(console.error);
