// scripts/load-user-profiles.ts
// Loads user profiles from NAH Wholesale Playbook into user_profiles table
// Run: npx tsx scripts/load-user-profiles.ts

import { db } from '../lib/db/client'

// Profiles extracted from playbook User-Profiles/ directory
const PROFILES = [
  {
    nameMatch: 'Chris', // matches user.name containing "Chris"
    strengths: [
      'Rapport and emotional connection — builds trust quickly with distressed sellers',
      'Motivation extraction — excels at uncovering real reasons (foreclosure, divorce, financial distress)',
      'Handling emotional sellers — natural Affirmer persona, meets sellers where they are',
      'Appointment setting with context — provides background to AM, sets expectations',
      'Adaptability — handles unexpected call turns without losing composure',
    ],
    weaknesses: [
      'Excessive "Okay" filler word — documented 50+ in a single response',
      'Lacks call structure — jumps in conversationally instead of expectation-setting intro',
      'Skips price anchoring — moves past seller asking price without anchoring at 40-50% Zillow',
      'Misses decision-maker identification — doesn\'t always ask who else has input',
      'Number accuracy under pressure — misstated $140K as $40K in one call',
    ],
    commonMistakes: [
      'Repeating "Okay" as filler instead of varied acknowledgments',
      'Skipping the standard expectation-setting framework at call start',
      'Not using price anchoring technique before passing to AM',
      'Missing decision-maker identification question',
      'Accepting vague follow-up instead of specific date/time',
      'Using overly casual language ("Hey honey") in professional calls',
    ],
    communicationStyle: 'Warm, conversational, empathetic. Amiable/Expressive personality type. Relationship-focused. Best with emotional/distressed sellers. Needs more directness with Driver-type sellers.',
    coachingPriorities: [
      'Replace "Okay" repetitions with "Got it," "I understand," "That makes sense"',
      'Implement standard expectation-setting intro on every call',
      'Use cash buyer market anchor (40-50% Zillow) before passing to AM',
      'Ask "Is there anyone else who has input on the decision to sell?" every qualified call',
      'Repeat back all dollar amounts and dates to confirm accuracy',
    ],
    totalCallsGraded: 154,
  },
  {
    nameMatch: 'Daniel',
    strengths: [
      'Volume and consistency — 3,800 calls demonstrates relentless commitment',
      'Scheduling and logistics excellence — top-graded calls show precise appointment coordination',
      'Clear, direct communication — gets to point within 15 seconds, professional openers',
      'Professional tone — consistently courteous even with uncooperative sellers',
      'Next-step discipline — rarely ends call without defined next action',
    ],
    weaknesses: [
      'Seller domination — talkative sellers take control of conversation',
      'Shallow motivation probing — efficient at logistics but skips deeper "why"',
      'Leads with price too early — references previous offers before establishing motivation',
      'Missing call expectation setting — should add standard framework at call start',
      'Accepts vague timelines — "maybe next week" should become "Tuesday at 2pm"',
    ],
    commonMistakes: [
      'Not using Reversing technique when sellers take control of conversation',
      'Skipping "What\'s got you thinking about selling?" and "What happens if you don\'t sell?"',
      'Referencing price/offers before motivation is fully established',
      'Not setting expectations at call start with standard framework',
      'Accepting "sometime soon" instead of pinning to specific date/time',
    ],
    communicationStyle: 'Efficient, organized, task-oriented. Driver personality type. Direct and results-focused. Strongest with Driver sellers. Needs more warmth/reassurance for Expressive/Amiable sellers.',
    coachingPriorities: [
      'Ask "What\'s got you thinking about selling?" and "What happens if you don\'t sell?" on every call',
      'Add standard expectation-setting intro framework to every call',
      'Practice polite interruption and Reversing to regain call control',
      'Convert every "sometime" into specific date and time',
      'Never reference price until motivation is fully established',
    ],
    totalCallsGraded: 248,
  },
  {
    nameMatch: 'Kyle',
    strengths: [
      'Rapport building with distressed sellers — exceptional empathy with grieving, divorcing, stressed sellers',
      'Confident offer delivery with strategic silence — states number with conviction then pauses',
      'Operational follow-through — guides sellers through e-signing, scheduling, post-contract execution',
      'Flexibility across call types — handles offers, admin, contracts, walkthroughs, follow-ups',
      'Reading emotional situations — adjusts approach based on seller emotional temperature',
    ],
    weaknesses: [
      'Loses control to talkative sellers — follows instead of leading when seller redirects',
      'Defensive responses to objections — "I don\'t want to be the bad guy" instead of empathy-first',
      'Skips stage-setting on offer calls — lower-scoring calls miss structured opening',
      'Doesn\'t re-qualify stalled leads — treats follow-up as check-in instead of re-qualification',
      'Missing price anchoring before offer — doesn\'t always set expectations before delivering number',
    ],
    commonMistakes: [
      'Not using Reversing technique to redirect talkative sellers',
      'Getting defensive on title issues or competing offers instead of acknowledging first',
      'Skipping "I\'ll review what we discussed, share what our team found, and present our offer" opener',
      'Not checking motivation status on stalled follow-ups',
      'Not anchoring at 40-50% Zillow before delivering offer number',
    ],
    communicationStyle: 'Empathetic, patient, relationship-focused. Amiable with strong Expressive tendencies. Leads with empathy, values relationships. Strongest with distressed sellers. Needs more assertiveness with Driver-type sellers.',
    coachingPriorities: [
      'Use Reversing to redirect sellers who take over conversation',
      'Open every offer call with structured stage-setting framework',
      'Replace defensive language with empathy-first acknowledgment on objections',
      'Check motivation status on every stalled lead follow-up',
      'Anchor expectations before delivering offer',
    ],
    totalCallsGraded: 288,
  },
]

async function loadProfiles() {
  console.log('[load-profiles] Starting...')

  const tenant = await db.tenant.findFirst({ select: { id: true } })
  if (!tenant) { console.error('No tenant'); process.exit(1) }

  const users = await db.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
  })

  for (const profile of PROFILES) {
    const user = users.find(u => u.name.toLowerCase().includes(profile.nameMatch.toLowerCase()))
    if (!user) {
      console.warn(`[load-profiles] No user matching "${profile.nameMatch}"`)
      continue
    }

    await db.userProfile.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        strengths: profile.strengths,
        weaknesses: profile.weaknesses,
        commonMistakes: profile.commonMistakes,
        communicationStyle: profile.communicationStyle,
        coachingPriorities: profile.coachingPriorities,
        totalCallsGraded: profile.totalCallsGraded,
        profileSource: 'playbook',
      },
      update: {
        strengths: profile.strengths,
        weaknesses: profile.weaknesses,
        commonMistakes: profile.commonMistakes,
        communicationStyle: profile.communicationStyle,
        coachingPriorities: profile.coachingPriorities,
        totalCallsGraded: profile.totalCallsGraded,
        profileSource: 'playbook',
      },
    })
    console.log(`[load-profiles] Loaded profile for ${user.name}`)
  }

  console.log('[load-profiles] Done.')
  process.exit(0)
}

loadProfiles()
