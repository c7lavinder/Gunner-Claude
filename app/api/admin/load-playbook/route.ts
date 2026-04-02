// POST /api/admin/load-playbook
// One-time admin endpoint to load playbook into knowledge_documents + user_profiles
// Hit this URL once after deploy to populate the knowledge base
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import * as fs from 'fs'
import * as path from 'path'

interface PlaybookFile {
  relativePath: string
  title: string
  type: string
  callType: string | null
  role: string | null
}

const FILE_MAP: PlaybookFile[] = [
  { relativePath: 'Industry-Knowledge/01-Lead-Generation/ALL_Meta-Ads-and-Funnel-Strategy.md', title: 'Meta Ads and Funnel Strategy', type: 'industry', callType: null, role: 'ALL' },
  { relativePath: 'Industry-Knowledge/02-Cold-Calling/LG_Cold-Call-Objection-Responses.md', title: 'Cold Call Objection Responses', type: 'objection', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Industry-Knowledge/02-Cold-Calling/LG_Cold-Call-Script-and-Volume-Mindset.md', title: 'Cold Call Script and Volume Mindset', type: 'industry', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Industry-Knowledge/03-Lead-Management/LM_Follow-Up-Cadence-and-CRM-Discipline.md', title: 'Follow-Up Cadence and CRM Discipline', type: 'industry', callType: null, role: 'LEAD_MANAGER' },
  { relativePath: 'Industry-Knowledge/03-Lead-Management/LM_Lead-Manager-System-and-Qualification.md', title: 'Lead Manager System and Qualification', type: 'industry', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Industry-Knowledge/04-Sales-Closing/AM_5-Communication-Techniques.md', title: 'The 5 Communication Techniques', type: 'industry', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Industry-Knowledge/04-Sales-Closing/AM_Disposition-and-Deal-Distribution.md', title: 'Disposition and Deal Distribution', type: 'industry', callType: 'dispo_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Industry-Knowledge/04-Sales-Closing/AM_Personality-Adaptive-Selling-PMAS.md', title: 'Personality-Adaptive Selling (PMAS)', type: 'industry', callType: null, role: 'ALL' },
  { relativePath: 'Industry-Knowledge/04-Sales-Closing/AM_Post-Contract-Friction-Principle.md', title: 'Post-Contract Friction Principle', type: 'industry', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Industry-Knowledge/04-Sales-Closing/AM_Qualification-Questions-for-Closers.md', title: 'Qualification Questions for Closers', type: 'industry', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Industry-Knowledge/04-Sales-Closing/AM_The-10-Step-Close.md', title: 'The 10-Step Close', type: 'industry', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Industry-Knowledge/05-Objection-Handling/ALL_The-5-Main-Objections-and-Responses.md', title: 'The 5 Main Objections and Responses', type: 'objection', callType: null, role: 'ALL' },
  { relativePath: 'Industry-Knowledge/06-Scaling-Operations/ALL_KPI-Framework-and-Metrics.md', title: 'KPI Framework and Metrics', type: 'standard', callType: null, role: 'ALL' },
  { relativePath: 'Industry-Knowledge/06-Scaling-Operations/ALL_Scaling-the-Wholesale-Machine.md', title: 'Scaling the Wholesale Machine', type: 'industry', callType: null, role: 'ALL' },
  { relativePath: 'Industry-Knowledge/07-Mindset-and-Philosophy/ALL_Best-Quotes-and-Principles.md', title: 'Best Quotes and Principles', type: 'industry', callType: null, role: 'ALL' },
  { relativePath: 'Industry-Knowledge/07-Mindset-and-Philosophy/ALL_The-Complete-Wholesale-Value-Chain.md', title: 'The Complete Wholesale Value Chain', type: 'industry', callType: null, role: 'ALL' },
  { relativePath: 'Training-Materials/01-Scripts/AM_AM-Offer-Call-Script.md', title: 'AM Offer Call Script', type: 'script', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/01-Scripts/AM_Offer-Presentation-Guide-for-Acquisition-Managers.md', title: 'Offer Presentation Guide', type: 'script', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/01-Scripts/LG_Lead-Generator-Cold-Call-Script.md', title: 'Lead Generator Cold Call Script', type: 'script', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Training-Materials/01-Scripts/LG_Warm-Transfer-Guide-for-Lead-Generators.md', title: 'Warm Transfer Guide', type: 'script', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Training-Materials/01-Scripts/LM_LM-New-Lead-Diagnosis-Script.md', title: 'LM New Lead Diagnosis Script', type: 'script', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/01-Scripts/LM_Price-Anchoring-Guide-for-Lead-Managers.md', title: 'Price Anchoring Guide', type: 'script', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/02-Objection-Handling/AM_Counter-Offer-Strategy-for-Acquisition-Managers.md', title: 'Counter-Offer Strategy for AMs', type: 'objection', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/02-Objection-Handling/AM_Handling-Sellers-Who-Want-to-Back-Out.md', title: 'Handling Sellers Who Want to Back Out', type: 'objection', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/02-Objection-Handling/AM_Objection-Handling-at-the-Offer-Stage.md', title: 'Objection Handling at the Offer Stage', type: 'objection', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/02-Objection-Handling/LG_Common-Brush-Offs-How-to-Handle-Them.md', title: 'Common Brush-Offs and How to Handle Them', type: 'objection', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Training-Materials/02-Objection-Handling/LM_LM-Objection-Mastery.md', title: 'LM Objection Mastery', type: 'objection', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/03-Methodology/ALL_AI-Grading-Methodology.md', title: 'AI Grading Methodology', type: 'standard', callType: null, role: 'ALL' },
  { relativePath: 'Training-Materials/03-Methodology/ALL_New-Again-Houses-Nashville-Company-Overview.md', title: 'New Again Houses Company Overview', type: 'standard', callType: null, role: 'ALL' },
  { relativePath: 'Training-Materials/03-Methodology/AM_Closing-Techniques-for-Acquisition-Managers.md', title: 'Closing Techniques for AMs', type: 'training', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/03-Methodology/LG_Tone-Energy-Guide-for-Lead-Generators.md', title: 'Tone and Energy Guide for LGs', type: 'training', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Training-Materials/03-Methodology/LM_Appointment-Setting-Guide-for-Lead-Managers.md', title: 'Appointment Setting Guide for LMs', type: 'training', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/03-Methodology/LM_Motivation-Extraction-Guide-for-Lead-Managers.md', title: 'Motivation Extraction Guide for LMs', type: 'training', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/04-Best-Practices/ALL_GoHighLevel-GHL-CRM-Guide-All-Roles.md', title: 'GoHighLevel CRM Guide', type: 'standard', callType: null, role: 'ALL' },
  { relativePath: 'Training-Materials/04-Best-Practices/AM_Walkthrough-Checklist-for-Acquisition-Managers.md', title: 'Walkthrough Checklist for AMs', type: 'training', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/04-Best-Practices/LG_DNC-Compliance-Guide-for-Lead-Generators.md', title: 'DNC Compliance Guide', type: 'standard', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Training-Materials/04-Best-Practices/LM_Follow-Up-Cadence-Guide-for-Lead-Managers.md', title: 'Follow-Up Cadence Guide for LMs', type: 'training', callType: 'follow_up_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/04-Best-Practices/LM_LM-Disqualification-Mastery.md', title: 'LM Disqualification Mastery', type: 'training', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/04-Best-Practices/LM_LM-Good-Appointment-Mastery.md', title: 'LM Good Appointment Mastery', type: 'training', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/04-Best-Practices/LM_LM-Script-Mastery.md', title: 'LM Script Mastery', type: 'training', callType: 'qualification_call', role: 'LEAD_MANAGER' },
]

const USER_PROFILES = [
  {
    nameMatch: 'Chris',
    strengths: ['Rapport and emotional connection', 'Motivation extraction with distressed sellers', 'Handling emotional sellers (Affirmer persona)', 'Appointment setting with context', 'Adaptability when calls take unexpected turns'],
    weaknesses: ['Excessive "Okay" filler word', 'Lacks call structure and expectation setting', 'Skips price anchoring', 'Misses decision-maker identification', 'Number accuracy under pressure'],
    commonMistakes: ['Repeating "Okay" instead of varied acknowledgments', 'Skipping expectation-setting framework', 'Not price anchoring at 40-50% Zillow', 'Missing decision-maker question', 'Accepting vague follow-up times', 'Overly casual language in professional calls'],
    communicationStyle: 'Warm, conversational, empathetic. Amiable/Expressive. Best with emotional/distressed sellers.',
    coachingPriorities: ['Replace "Okay" with "Got it," "I understand," "That makes sense"', 'Implement expectation-setting intro every call', 'Use cash buyer market anchor before passing to AM', 'Ask decision-maker question every qualified call', 'Repeat back all dollar amounts to confirm'],
    totalCallsGraded: 154,
  },
  {
    nameMatch: 'Daniel',
    strengths: ['Volume and consistency (3,800 calls)', 'Scheduling and logistics excellence', 'Clear, direct communication', 'Professional tone under pressure', 'Next-step discipline'],
    weaknesses: ['Seller domination — loses control to talkative sellers', 'Shallow motivation probing', 'Leads with price too early', 'Missing call expectation setting', 'Accepts vague timelines'],
    commonMistakes: ['Not using Reversing when sellers take control', 'Skipping motivation depth questions', 'Referencing price before motivation established', 'Not setting expectations at call start', 'Accepting "sometime soon" vs specific date/time'],
    communicationStyle: 'Efficient, organized, task-oriented. Driver type. Best with Driver sellers.',
    coachingPriorities: ['Ask "What\'s got you thinking about selling?" every call', 'Add expectation-setting intro framework', 'Practice Reversing for call control', 'Convert "sometime" to specific date/time', 'Never reference price until motivation established'],
    totalCallsGraded: 248,
  },
  {
    nameMatch: 'Kyle',
    strengths: ['Rapport with distressed sellers', 'Confident offer delivery with silence', 'Operational follow-through', 'Flexibility across call types', 'Reading emotional situations'],
    weaknesses: ['Loses control to talkative sellers', 'Defensive on objections', 'Skips stage-setting on offer calls', 'Doesn\'t re-qualify stalled leads', 'Missing price anchoring before offer'],
    commonMistakes: ['Not using Reversing to redirect', 'Defensive language instead of empathy-first', 'Skipping structured opener on offer calls', 'Not checking motivation on follow-ups', 'Not anchoring at 40-50% before delivering offer'],
    communicationStyle: 'Empathetic, patient, relationship-focused. Amiable/Expressive. Best with distressed sellers.',
    coachingPriorities: ['Use Reversing to redirect talkative sellers', 'Open every offer call with stage-setting', 'Replace defensive language with empathy-first', 'Check motivation status on stalled leads', 'Anchor expectations before offer'],
    totalCallsGraded: 288,
  },
]

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Admin/Owner only
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const tenantId = session.tenantId
  const results = { docs: 0, profiles: 0, errors: [] as string[] }

  // ── Load playbook documents ──
  const playbookDir = path.join(process.cwd(), 'docs/NAH-Wholesale-Playbook')

  for (const file of FILE_MAP) {
    const filePath = path.join(playbookDir, file.relativePath)
    try {
      if (!fs.existsSync(filePath)) {
        results.errors.push(`Not found: ${file.relativePath}`)
        continue
      }
      const content = fs.readFileSync(filePath, 'utf-8')
      if (!content.trim()) continue

      const existing = await db.knowledgeDocument.findFirst({
        where: { tenantId, title: file.title, source: 'playbook' },
      })

      if (existing) {
        await db.knowledgeDocument.update({
          where: { id: existing.id },
          data: { content, type: file.type, callType: file.callType, role: file.role },
        })
      } else {
        await db.knowledgeDocument.create({
          data: { tenantId, title: file.title, type: file.type, callType: file.callType, role: file.role, content, source: 'playbook', isActive: true },
        })
      }
      results.docs++
    } catch (err) {
      results.errors.push(`${file.title}: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  // ── Load user profiles ──
  const users = await db.user.findMany({ where: { tenantId }, select: { id: true, name: true } })

  for (const profile of USER_PROFILES) {
    const matchedUser = users.find(u => u.name.toLowerCase().includes(profile.nameMatch.toLowerCase()))
    if (!matchedUser) {
      results.errors.push(`No user matching "${profile.nameMatch}"`)
      continue
    }

    await db.userProfile.upsert({
      where: { tenantId_userId: { tenantId, userId: matchedUser.id } },
      create: {
        tenantId, userId: matchedUser.id,
        strengths: profile.strengths, weaknesses: profile.weaknesses,
        commonMistakes: profile.commonMistakes, communicationStyle: profile.communicationStyle,
        coachingPriorities: profile.coachingPriorities, totalCallsGraded: profile.totalCallsGraded,
        profileSource: 'playbook',
      },
      update: {
        strengths: profile.strengths, weaknesses: profile.weaknesses,
        commonMistakes: profile.commonMistakes, communicationStyle: profile.communicationStyle,
        coachingPriorities: profile.coachingPriorities, totalCallsGraded: profile.totalCallsGraded,
        profileSource: 'playbook',
      },
    })
    results.profiles++
  }

  // Auto-embed documents if OPENAI_API_KEY is set (non-blocking)
  let embeddingResults: { embedded: number } | null = null
  try {
    const { embedAllDocuments, isEmbeddingsEnabled } = await import('@/lib/ai/embeddings')
    if (isEmbeddingsEnabled()) {
      embeddingResults = await embedAllDocuments(tenantId)
    }
  } catch {}

  return NextResponse.json({
    status: 'success',
    loaded: { documents: results.docs, profiles: results.profiles },
    embedded: embeddingResults?.embedded ?? 0,
    errors: results.errors.length > 0 ? results.errors : undefined,
  })
}
