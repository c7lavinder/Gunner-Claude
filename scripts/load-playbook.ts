// scripts/load-playbook.ts
// One-time script to load all NAH Wholesale Playbook files into knowledge_documents
// Run: npx tsx scripts/load-playbook.ts

import { db } from '../lib/db/client'
import * as fs from 'fs'
import * as path from 'path'

const PLAYBOOK_DIR = path.join(__dirname, '../docs/NAH-Wholesale-Playbook')

// Map each file to its metadata
interface PlaybookFile {
  relativePath: string
  title: string
  type: 'script' | 'standard' | 'playbook' | 'training' | 'market' | 'objection' | 'industry'
  callType: string | null
  role: string | null // LEAD_MANAGER | ACQUISITION_MANAGER | ALL | LEAD_GENERATOR
}

const FILE_MAP: PlaybookFile[] = [
  // ─── Industry Knowledge ───
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

  // ─── Training Materials: Scripts ───
  { relativePath: 'Training-Materials/01-Scripts/AM_AM-Offer-Call-Script.md', title: 'AM Offer Call Script', type: 'script', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/01-Scripts/AM_Offer-Presentation-Guide-for-Acquisition-Managers.md', title: 'Offer Presentation Guide', type: 'script', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/01-Scripts/LG_Lead-Generator-Cold-Call-Script.md', title: 'Lead Generator Cold Call Script', type: 'script', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Training-Materials/01-Scripts/LG_Warm-Transfer-Guide-for-Lead-Generators.md', title: 'Warm Transfer Guide', type: 'script', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Training-Materials/01-Scripts/LM_LM-New-Lead-Diagnosis-Script.md', title: 'LM New Lead Diagnosis Script', type: 'script', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/01-Scripts/LM_Price-Anchoring-Guide-for-Lead-Managers.md', title: 'Price Anchoring Guide', type: 'script', callType: 'qualification_call', role: 'LEAD_MANAGER' },

  // ─── Training Materials: Objection Handling ───
  { relativePath: 'Training-Materials/02-Objection-Handling/AM_Counter-Offer-Strategy-for-Acquisition-Managers.md', title: 'Counter-Offer Strategy for AMs', type: 'objection', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/02-Objection-Handling/AM_Handling-Sellers-Who-Want-to-Back-Out.md', title: 'Handling Sellers Who Want to Back Out', type: 'objection', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/02-Objection-Handling/AM_Objection-Handling-at-the-Offer-Stage.md', title: 'Objection Handling at the Offer Stage', type: 'objection', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/02-Objection-Handling/LG_Common-Brush-Offs-How-to-Handle-Them.md', title: 'Common Brush-Offs and How to Handle Them', type: 'objection', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Training-Materials/02-Objection-Handling/LM_LM-Objection-Mastery.md', title: 'LM Objection Mastery', type: 'objection', callType: 'qualification_call', role: 'LEAD_MANAGER' },

  // ─── Training Materials: Methodology ───
  { relativePath: 'Training-Materials/03-Methodology/ALL_AI-Grading-Methodology.md', title: 'AI Grading Methodology', type: 'standard', callType: null, role: 'ALL' },
  { relativePath: 'Training-Materials/03-Methodology/ALL_New-Again-Houses-Nashville-Company-Overview.md', title: 'New Again Houses Company Overview', type: 'standard', callType: null, role: 'ALL' },
  { relativePath: 'Training-Materials/03-Methodology/AM_Closing-Techniques-for-Acquisition-Managers.md', title: 'Closing Techniques for AMs', type: 'training', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/03-Methodology/LG_Tone-Energy-Guide-for-Lead-Generators.md', title: 'Tone and Energy Guide for LGs', type: 'training', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Training-Materials/03-Methodology/LM_Appointment-Setting-Guide-for-Lead-Managers.md', title: 'Appointment Setting Guide for LMs', type: 'training', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/03-Methodology/LM_Motivation-Extraction-Guide-for-Lead-Managers.md', title: 'Motivation Extraction Guide for LMs', type: 'training', callType: 'qualification_call', role: 'LEAD_MANAGER' },

  // ─── Training Materials: Best Practices ───
  { relativePath: 'Training-Materials/04-Best-Practices/ALL_GoHighLevel-GHL-CRM-Guide-All-Roles.md', title: 'GoHighLevel CRM Guide', type: 'standard', callType: null, role: 'ALL' },
  { relativePath: 'Training-Materials/04-Best-Practices/AM_Walkthrough-Checklist-for-Acquisition-Managers.md', title: 'Walkthrough Checklist for AMs', type: 'training', callType: 'offer_call', role: 'ACQUISITION_MANAGER' },
  { relativePath: 'Training-Materials/04-Best-Practices/LG_DNC-Compliance-Guide-for-Lead-Generators.md', title: 'DNC Compliance Guide', type: 'standard', callType: 'cold_call', role: 'LEAD_GENERATOR' },
  { relativePath: 'Training-Materials/04-Best-Practices/LM_Follow-Up-Cadence-Guide-for-Lead-Managers.md', title: 'Follow-Up Cadence Guide for LMs', type: 'training', callType: 'follow_up_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/04-Best-Practices/LM_LM-Disqualification-Mastery.md', title: 'LM Disqualification Mastery', type: 'training', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/04-Best-Practices/LM_LM-Good-Appointment-Mastery.md', title: 'LM Good Appointment Mastery', type: 'training', callType: 'qualification_call', role: 'LEAD_MANAGER' },
  { relativePath: 'Training-Materials/04-Best-Practices/LM_LM-Script-Mastery.md', title: 'LM Script Mastery', type: 'training', callType: 'qualification_call', role: 'LEAD_MANAGER' },
]

async function loadPlaybook() {
  console.log('[load-playbook] Starting...')

  // Find tenant
  const tenant = await db.tenant.findFirst({
    select: { id: true, name: true },
  })
  if (!tenant) {
    console.error('[load-playbook] No tenant found')
    process.exit(1)
  }
  console.log(`[load-playbook] Tenant: ${tenant.name ?? tenant.id}`)

  let loaded = 0
  let skipped = 0
  let errors = 0

  for (const file of FILE_MAP) {
    const filePath = path.join(PLAYBOOK_DIR, file.relativePath)

    if (!fs.existsSync(filePath)) {
      console.warn(`[load-playbook] File not found: ${file.relativePath}`)
      errors++
      continue
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    if (!content.trim()) {
      console.warn(`[load-playbook] Empty file: ${file.relativePath}`)
      skipped++
      continue
    }

    // Upsert by title + tenant (idempotent)
    const existing = await db.knowledgeDocument.findFirst({
      where: { tenantId: tenant.id, title: file.title, source: 'playbook' },
    })

    if (existing) {
      await db.knowledgeDocument.update({
        where: { id: existing.id },
        data: { content, type: file.type, callType: file.callType, role: file.role },
      })
      console.log(`[load-playbook] Updated: ${file.title}`)
    } else {
      await db.knowledgeDocument.create({
        data: {
          tenantId: tenant.id,
          title: file.title,
          type: file.type,
          callType: file.callType,
          role: file.role,
          content,
          source: 'playbook',
          isActive: true,
        },
      })
      console.log(`[load-playbook] Created: ${file.title}`)
    }
    loaded++
  }

  console.log(`[load-playbook] Done. Loaded: ${loaded}, Skipped: ${skipped}, Errors: ${errors}`)
  process.exit(0)
}

loadPlaybook()
