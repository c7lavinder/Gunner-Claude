#!/usr/bin/env tsx
// scripts/setup-team.ts
// Creates team members from GHL location users — no invites, no emails
// Run: npx tsx scripts/setup-team.ts

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

// Team definition — name matching is case-insensitive, partial match
const TEAM: Array<{
  ghlNameMatch: string // substring to match against GHL user name
  role: 'ADMIN' | 'ACQUISITION_MANAGER' | 'LEAD_MANAGER' | 'DISPOSITION_MANAGER'
  reportsToMatch: string | null // substring of their manager's GHL name
}> = [
  { ghlNameMatch: 'jessica',    role: 'ADMIN',                reportsToMatch: null },
  { ghlNameMatch: 'kyle',       role: 'ACQUISITION_MANAGER',  reportsToMatch: 'jessica' },
  { ghlNameMatch: 'daniel',     role: 'LEAD_MANAGER',         reportsToMatch: 'kyle' },
  { ghlNameMatch: 'chris',      role: 'LEAD_MANAGER',         reportsToMatch: 'kyle' },
  { ghlNameMatch: 'esteban',    role: 'DISPOSITION_MANAGER',  reportsToMatch: 'jessica' },
]

async function main() {
  console.log('Setting up team members from GHL...\n')

  // Find the real tenant (not dev seed)
  const tenants = await db.tenant.findMany({
    where: {
      ghlAccessToken: { not: null },
      ghlLocationId: { not: null },
    },
    select: { id: true, name: true, slug: true, ghlLocationId: true, ghlAccessToken: true },
  })

  if (tenants.length === 0) {
    console.error('No tenant with GHL connection found')
    process.exit(1)
  }

  // Use first real tenant (skip dev seed if present)
  const tenant = tenants.find(t => t.slug !== 'apex-dev') ?? tenants[0]
  console.log(`Tenant: ${tenant.name} (/${tenant.slug})\n`)

  // Fetch GHL location users via API
  const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
  const response = await fetch(`${GHL_BASE_URL}/users/?locationId=${tenant.ghlLocationId}`, {
    headers: {
      'Authorization': `Bearer ${tenant.ghlAccessToken}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`GHL users fetch failed (${response.status}): ${body}`)
    process.exit(1)
  }

  const data = await response.json() as { users: Array<{ id: string; name: string; firstName: string; lastName: string; email: string; phone: string }> }
  const ghlUsers = data.users ?? []
  console.log(`GHL location users (${ghlUsers.length}):`)
  for (const u of ghlUsers) {
    const name = u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
    console.log(`  ${name} — ${u.email} — GHL ID: ${u.id}${u.phone ? ` — Phone: ${u.phone}` : ''}`)
  }
  console.log()

  // Find owner (Corey) — already exists
  const owner = await db.user.findFirst({
    where: { tenantId: tenant.id, role: 'OWNER' },
    select: { id: true, name: true },
  })
  console.log(`Owner: ${owner?.name ?? 'NOT FOUND'}\n`)

  // Default password for all team members (they won't be logging in)
  const hashedPassword = await bcrypt.hash('GunnerTeam2024!', 12)

  // Create users — two passes: first create all, then set reportsTo
  const createdUsers = new Map<string, string>() // ghlNameMatch → userId

  for (const member of TEAM) {
    // Match GHL user by name
    const ghlUser = ghlUsers.find(u => {
      const name = (u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()).toLowerCase()
      return name.includes(member.ghlNameMatch.toLowerCase())
    })

    if (!ghlUser) {
      console.error(`No GHL user matching "${member.ghlNameMatch}" — skipping`)
      continue
    }

    const fullName = ghlUser.name || `${ghlUser.firstName ?? ''} ${ghlUser.lastName ?? ''}`.trim()

    // Check if user already exists
    const existing = await db.user.findUnique({ where: { email: ghlUser.email } })
    if (existing) {
      console.log(`Already exists: ${fullName} (${ghlUser.email}) — updating ghlUserId + role`)
      await db.user.update({
        where: { id: existing.id },
        data: {
          ghlUserId: ghlUser.id,
          role: member.role,
          name: fullName,
          phone: ghlUser.phone || undefined,
        },
      })
      createdUsers.set(member.ghlNameMatch, existing.id)
      continue
    }

    const user = await db.user.create({
      data: {
        tenantId: tenant.id,
        email: ghlUser.email,
        name: fullName,
        role: member.role,
        hashedPassword,
        ghlUserId: ghlUser.id,
        phone: ghlUser.phone || undefined,
      },
    })

    createdUsers.set(member.ghlNameMatch, user.id)
    console.log(`Created: ${fullName} — ${member.role} — GHL: ${ghlUser.id}`)
  }

  // Second pass: set reporting hierarchy
  console.log('\nSetting up reporting hierarchy...')
  for (const member of TEAM) {
    const userId = createdUsers.get(member.ghlNameMatch)
    if (!userId) continue

    let reportsToId: string | null = null

    if (member.reportsToMatch === null) {
      // Admin reports to owner
      reportsToId = owner?.id ?? null
    } else {
      reportsToId = createdUsers.get(member.reportsToMatch) ?? null
    }

    if (reportsToId) {
      await db.user.update({
        where: { id: userId },
        data: { reportsTo: reportsToId },
      })
      const managerName = member.reportsToMatch ?? 'Owner'
      console.log(`  ${member.ghlNameMatch} → reports to ${managerName}`)
    }
  }

  // Also map Corey (owner) to GHL if there's a matching user
  const coreyGhl = ghlUsers.find(u => {
    const name = (u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()).toLowerCase()
    return name.includes('corey') || name.includes('lavinder')
  })
  if (coreyGhl && owner) {
    await db.user.update({
      where: { id: owner.id },
      data: { ghlUserId: coreyGhl.id },
    })
    console.log(`\nMapped owner ${owner.name} → GHL: ${coreyGhl.id}`)
  }

  // Summary
  console.log('\n--- Team Setup Complete ---')
  const allUsers = await db.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, email: true, role: true, ghlUserId: true, reportsTo: true },
    orderBy: { role: 'asc' },
  })
  console.log(`\nTotal users: ${allUsers.length}`)
  for (const u of allUsers) {
    const manager = u.reportsTo ? allUsers.find(m => m.id === u.reportsTo)?.name : '—'
    console.log(`  ${u.role.padEnd(22)} ${u.name.padEnd(20)} ${(u.email ?? '').padEnd(30)} GHL: ${u.ghlUserId ?? 'UNMAPPED'}  Reports to: ${manager}`)
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
