#!/usr/bin/env tsx
// scripts/seed.ts
// Development seed — creates a realistic wholesaling company with team, properties, and calls
// Run: npx tsx scripts/seed.ts

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Gunner AI dev data...\n')

  // Clean existing dev tenant
  const existingTenant = await db.tenant.findUnique({ where: { slug: 'apex-dev' } })
  if (existingTenant) {
    await db.tenant.delete({ where: { slug: 'apex-dev' } })
    console.log('Cleaned existing dev tenant')
  }

  const hashedPassword = await bcrypt.hash('password123', 12)

  // Create tenant
  const tenant = await db.tenant.create({
    data: {
      name: 'Apex Wholesaling',
      slug: 'apex-dev',
      onboardingCompleted: true,
      onboardingStep: 5,
      callTypes: ['Inbound lead', 'Outbound cold call', 'Follow-up', 'Appointment confirmation'],
      callResults: ['Interested', 'Not interested', 'Call back', 'Appointment set', 'Wrong number', 'No answer'],
    },
  })
  console.log(`✅ Tenant: ${tenant.name} (/${tenant.slug})`)

  // Create users
  const owner = await db.user.create({ data: { tenantId: tenant.id, email: 'owner@apex.dev', name: 'Alex Owner', role: 'OWNER', hashedPassword } })
  const teamLead = await db.user.create({ data: { tenantId: tenant.id, email: 'lead@apex.dev', name: 'Maria Lead', role: 'TEAM_LEAD', hashedPassword, reportsTo: owner.id } })
  const acqManager = await db.user.create({ data: { tenantId: tenant.id, email: 'acq@apex.dev', name: 'Jordan Acq', role: 'ACQUISITION_MANAGER', hashedPassword, reportsTo: teamLead.id } })
  const leadManager = await db.user.create({ data: { tenantId: tenant.id, email: 'lm@apex.dev', name: 'Sam Lead', role: 'LEAD_MANAGER', hashedPassword, reportsTo: acqManager.id } })
  const disp = await db.user.create({ data: { tenantId: tenant.id, email: 'disp@apex.dev', name: 'Chris Disp', role: 'DISPOSITION_MANAGER', hashedPassword, reportsTo: teamLead.id } })

  console.log(`✅ Team: ${[owner, teamLead, acqManager, leadManager, disp].map(u => u.name).join(', ')}`)

  // Seed role configs
  const roleConfigs = [
    { role: 'OWNER', defaultKpis: ['total_revenue', 'deals_closed', 'avg_call_score'], allowedKpis: ['total_revenue', 'deals_closed', 'avg_call_score', 'team_call_volume'], permissions: {}, taskCategories: ['Follow-up', 'Research', 'Admin'] },
    { role: 'ADMIN', defaultKpis: ['total_revenue', 'deals_closed', 'avg_call_score'], allowedKpis: ['total_revenue', 'deals_closed', 'avg_call_score'], permissions: {}, taskCategories: ['Follow-up', 'Admin'] },
    { role: 'TEAM_LEAD', defaultKpis: ['deals_closed', 'avg_call_score', 'team_call_volume'], allowedKpis: ['deals_closed', 'avg_call_score', 'team_call_volume'], permissions: {}, taskCategories: ['Check-in', 'Follow-up'] },
    { role: 'LEAD_MANAGER', defaultKpis: ['calls_made', 'appointments_set', 'avg_call_score'], allowedKpis: ['calls_made', 'appointments_set', 'avg_call_score'], permissions: {}, taskCategories: ['Call', 'Follow-up', 'Research'] },
    { role: 'ACQUISITION_MANAGER', defaultKpis: ['calls_made', 'appointments_set', 'contracts_signed', 'avg_call_score'], allowedKpis: ['calls_made', 'appointments_set', 'contracts_signed', 'avg_call_score'], permissions: {}, taskCategories: ['Appointment', 'Offer', 'Follow-up'] },
    { role: 'DISPOSITION_MANAGER', defaultKpis: ['properties_in_inventory', 'deals_sent', 'deals_closed'], allowedKpis: ['properties_in_inventory', 'deals_sent', 'deals_closed', 'avg_days_to_close'], permissions: {}, taskCategories: ['Send deal', 'Follow-up buyer', 'Close'] },
  ]

  for (const cfg of roleConfigs) {
    await db.roleConfig.create({ data: { tenantId: tenant.id, ...cfg as any } })
  }

  // Create sample sellers
  const sellers = await Promise.all([
    db.seller.create({ data: { tenantId: tenant.id, name: 'Robert Smith', phone: '555-0101', email: 'robert@email.com', ghlContactId: 'ghl-contact-001' } }),
    db.seller.create({ data: { tenantId: tenant.id, name: 'Linda Johnson', phone: '555-0102', ghlContactId: 'ghl-contact-002' } }),
    db.seller.create({ data: { tenantId: tenant.id, name: 'Marcus Davis', phone: '555-0103', ghlContactId: 'ghl-contact-003' } }),
  ])

  // Create properties
  const properties = await Promise.all([
    db.property.create({ data: { tenantId: tenant.id, assignedToId: acqManager.id, address: '1423 Maple St', city: 'Memphis', state: 'TN', zip: '38104', acqStatus: 'APPOINTMENT_SET', arv: 180000, askingPrice: 95000, mao: 90000, ghlContactId: 'ghl-contact-001' } }),
    db.property.create({ data: { tenantId: tenant.id, assignedToId: acqManager.id, address: '2891 Oak Ave', city: 'Memphis', state: 'TN', zip: '38106', acqStatus: 'UNDER_CONTRACT', arv: 210000, askingPrice: 120000, mao: 105000, contractPrice: 112000, assignmentFee: 15000, ghlContactId: 'ghl-contact-002' } }),
    db.property.create({ data: { tenantId: tenant.id, assignedToId: disp.id, address: '567 Pine Rd', city: 'Nashville', state: 'TN', zip: '37201', dispoStatus: 'IN_DISPOSITION', arv: 290000, askingPrice: 175000, mao: 145000, contractPrice: 158000, assignmentFee: 22000, ghlContactId: 'ghl-contact-003' } }),
    db.property.create({ data: { tenantId: tenant.id, assignedToId: leadManager.id, address: '891 Elm Dr', city: 'Memphis', state: 'TN', zip: '38108', acqStatus: 'NEW_LEAD', arv: 155000, askingPrice: 85000, ghlContactId: 'ghl-contact-004' } }),
    db.property.create({ data: { tenantId: tenant.id, assignedToId: acqManager.id, address: '3344 Cedar Blvd', city: 'Knoxville', state: 'TN', zip: '37901', acqStatus: 'NEW_LEAD', arv: 195000, askingPrice: 110000, ghlContactId: 'ghl-contact-005' } }),
  ])
  console.log(`✅ Properties: ${properties.length} created`)

  // Link sellers to properties
  await db.propertySeller.createMany({
    data: [
      { propertyId: properties[0].id, sellerId: sellers[0].id, isPrimary: true },
      { propertyId: properties[1].id, sellerId: sellers[1].id, isPrimary: true },
      { propertyId: properties[2].id, sellerId: sellers[2].id, isPrimary: true },
    ],
  })

  // Create graded calls
  const callData = [
    { assignedToId: leadManager.id, propertyId: properties[0].id, score: 82, callType: 'Inbound lead', direction: 'INBOUND' as const, durationSeconds: 487, aiSummary: 'Motivated seller interested in quick cash offer. Confirmed property condition is poor.', aiFeedback: 'Excellent rapport building and qualification. Strong opening. Could improve on setting clearer next step timeline.', aiCoachingTips: ['Ask for specific move-out timeline earlier', 'Confirm motivation before discussing price', 'Set a firm appointment before ending the call'] },
    { assignedToId: leadManager.id, propertyId: properties[3].id, score: 61, callType: 'Outbound cold call', direction: 'OUTBOUND' as const, durationSeconds: 213, aiSummary: 'Initial contact with motivated seller. Seller inherited property and wants to sell quickly.', aiFeedback: 'Good opening but lost momentum in the middle. Did not uncover the seller\'s true motivation. Cut off objections without fully addressing them.', aiCoachingTips: ['Let sellers finish their objections before responding', 'Dig deeper on the "why now" motivation', 'End every call with a specific date for next contact'] },
    { assignedToId: acqManager.id, propertyId: properties[1].id, score: 91, callType: 'Follow-up', direction: 'OUTBOUND' as const, durationSeconds: 843, aiSummary: 'Strong follow-up call leading to verbal contract agreement. Seller confirmed motivation and timeline.', aiFeedback: 'Outstanding call. Perfect example of patient rapport building and confident offer delivery. Contract secured.', aiCoachingTips: ['Great job — use this as a model recording for the team'] },
  ]

  for (const cd of callData) {
    await db.call.create({
      data: {
        tenantId: tenant.id,
        ...cd,
        gradingStatus: 'COMPLETED',
        rubricScores: { Opening: { score: 18, maxScore: 20, notes: 'Strong' }, Qualifying: { score: 22, maxScore: 25, notes: 'Good questions' }, Listening: { score: 17, maxScore: 20, notes: 'Attentive' }, 'Objection handling': { score: 14, maxScore: 20, notes: 'Needs work' }, 'Next steps': { score: 11, maxScore: 15, notes: 'Vague timeline' } },
        calledAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        gradedAt: new Date(),
      },
    })
  }
  console.log(`✅ Calls: ${callData.length} graded`)

  // Create tasks
  await db.task.createMany({
    data: [
      { tenantId: tenant.id, assignedToId: leadManager.id, propertyId: properties[0].id, title: 'Call Robert back about appointment', category: 'Call', priority: 'HIGH', status: 'PENDING', dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000) },
      { tenantId: tenant.id, assignedToId: acqManager.id, propertyId: properties[1].id, title: 'Send purchase agreement to Linda', category: 'Offer', priority: 'URGENT', status: 'PENDING', dueAt: new Date(Date.now() + 60 * 60 * 1000) },
      { tenantId: tenant.id, assignedToId: disp.id, propertyId: properties[2].id, title: 'Blast 567 Pine Rd to buyer list', category: 'Send deal', priority: 'HIGH', status: 'PENDING', dueAt: new Date() },
      { tenantId: tenant.id, assignedToId: leadManager.id, title: 'Review cold call script with team lead', category: 'Research', priority: 'MEDIUM', status: 'PENDING' },
    ],
  })
  console.log('✅ Tasks: 4 created')

  console.log('\n✅ Seed complete!\n')
  console.log('Login credentials (all use password: password123):')
  console.log(`  Owner:       owner@apex.dev`)
  console.log(`  Team Lead:   lead@apex.dev`)
  console.log(`  Acquisition: acq@apex.dev`)
  console.log(`  Lead Mgr:    lm@apex.dev`)
  console.log(`  Disposition: disp@apex.dev`)
  console.log(`\n  URL: /apex-dev/day-hub\n`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
