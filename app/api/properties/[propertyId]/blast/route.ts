// GET + POST /api/properties/[propertyId]/blast — blast history + generate + send
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { anthropic } from '@/config/anthropic'
import { logAiCall, startTimer } from '@/lib/ai/log'
import { approveAction } from '@/lib/gates/requireApproval'

export const GET = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  try {
    const blasts = await db.dealBlast.findMany({
      where: { propertyId: params.propertyId, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { _count: { select: { recipients: true } } },
    })

    return NextResponse.json({
      history: blasts.map(b => ({
        id: b.id,
        channel: b.channel,
        status: b.status,
        sentAt: b.sentAt?.toISOString() ?? null,
        recipientCount: b._count.recipients,
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})

export const POST = withTenant<{ propertyId: string }>(async (req, ctx, params) => {
  try {
    const tenantId = ctx.tenantId
    const { action, tiers, tier, message, channel, subject, buyerIds, approvalGateId } = await req.json()

    const propertyRaw = await db.property.findUnique({
      where: { id: params.propertyId, tenantId },
      select: {
        address: true, city: true, state: true, zip: true,
        askingPrice: true, arv: true, contractPrice: true, assignmentFee: true,
        dealBlastAskingOverride: true, dealBlastArvOverride: true,
        dealBlastContractOverride: true, dealBlastAssignmentFeeOverride: true,
        beds: true, baths: true, sqft: true, yearBuilt: true, lotSize: true,
        propertyType: true, description: true,
        zillowData: true,
      },
    })
    if (!propertyRaw) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    // Use blast overrides when set, otherwise fall back to base values
    const property = {
      ...propertyRaw,
      askingPrice: propertyRaw.dealBlastAskingOverride ?? propertyRaw.askingPrice,
      arv: propertyRaw.dealBlastArvOverride ?? propertyRaw.arv,
      contractPrice: propertyRaw.dealBlastContractOverride ?? propertyRaw.contractPrice,
      assignmentFee: propertyRaw.dealBlastAssignmentFeeOverride ?? propertyRaw.assignmentFee,
    }

    // Generate blast content
    if (action === 'generate') {
      // Load playbook knowledge for company voice in blast messaging
      const { buildKnowledgeContext } = await import('@/lib/ai/context-builder')
      const knowledge = await buildKnowledgeContext({
        tenantId, userRole: 'DISPOSITION_MANAGER',
      })
      const companyVoice = [
        knowledge.companyOverview ? `Company: ${knowledge.companyOverview.slice(0, 500)}` : '',
        knowledge.companyStandards ? `Standards: ${knowledge.companyStandards.slice(0, 300)}` : '',
      ].filter(Boolean).join('\n')
      const selectedTiers = (tiers as string[]) ?? []
      const results: Record<string, { emailSubject: string; emailBody: string; smsBody: string }> = {}

      // Build rich property context for AI
      const batchData = ((property.zillowData as Record<string, unknown>)?.batchData ?? {}) as Record<string, unknown>
      const specs: string[] = []
      if (property.beds) specs.push(`${property.beds} bed`)
      if (property.baths) specs.push(`${property.baths} bath`)
      if (property.sqft) specs.push(`${property.sqft.toLocaleString()} sqft`)
      if (property.yearBuilt) specs.push(`built ${property.yearBuilt}`)
      if (property.lotSize) specs.push(`lot ${property.lotSize}`)
      if (property.propertyType) specs.push(property.propertyType)

      const signals: string[] = []
      if (batchData.highEquity === true) signals.push('high equity')
      if (batchData.freeAndClear === true) signals.push('free & clear')
      if (batchData.vacant === true) signals.push('vacant')
      if (batchData.absenteeOwner === true) signals.push('absentee owner')

      const equity = batchData.equityPercent as number | undefined
      const estVal = batchData.estimatedValue as number | undefined

      const propertyContext = [
        `Address: ${property.address}, ${property.city}, ${property.state} ${property.zip}`,
        specs.length > 0 ? `Specs: ${specs.join(', ')}` : null,
        property.askingPrice ? `Asking: $${Number(property.askingPrice).toLocaleString()}` : null,
        property.arv ? `ARV: $${Number(property.arv).toLocaleString()}` : null,
        property.contractPrice ? `Contract: $${Number(property.contractPrice).toLocaleString()}` : null,
        property.assignmentFee ? `Assignment Fee: $${Number(property.assignmentFee).toLocaleString()}` : null,
        estVal ? `Estimated Value: $${estVal.toLocaleString()}` : null,
        equity != null ? `Equity: ${Math.round(equity)}%` : null,
        signals.length > 0 ? `Deal signals: ${signals.join(', ')}` : null,
        property.description ? `Description: ${property.description}` : null,
      ].filter(Boolean).join('\n')

      const blastTimer = startTimer()
      for (const t of selectedTiers) {
        const tierContext: Record<string, string> = {
          priority: 'Priority Buyer: exclusive early access, urgency, high confidence tone. Emphasize scarcity and deal quality.',
          qualified: 'Qualified Buyer: professional, detail-focused, ROI-oriented. Include numbers and return potential.',
          jv: 'JV Partner: partnership framing, profit split potential. Focus on deal economics and co-investment opportunity.',
          unqualified: 'Educational: no jargon, simple CTA. Keep it conversational and inviting.',
        }

        const emailPrompt = `Generate a professional wholesale real estate deal blast email for the ${t} buyer tier.

${propertyContext}

Tier tone: ${tierContext[t] ?? tierContext.unqualified}
${companyVoice ? `\n${companyVoice}` : ''}

Include the property specs (beds/baths/sqft/year) and key deal numbers in the email body.
Keep subject line under 60 chars. Email under 300 words. Professional but urgent. Match the company voice above.
Return ONLY JSON: {"subject":"...","body":"..."}`

        const smsPrompt = `Write a wholesale deal alert SMS for ${t} buyers.
${property.address}, ${property.city} ${property.state} | ${specs.slice(0, 3).join(', ')} | Asking: ${property.askingPrice ? `$${Number(property.askingPrice).toLocaleString()}` : 'TBD'} | ARV: ${property.arv ? `$${Number(property.arv).toLocaleString()}` : 'TBD'}
Max 160 characters. Include a clear CTA. Return ONLY the SMS text, nothing else.`

        try {
          const [emailRes, smsRes] = await Promise.all([
            anthropic.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 500,
              messages: [{ role: 'user', content: emailPrompt }],
            }),
            anthropic.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 200,
              messages: [{ role: 'user', content: smsPrompt }],
            }),
          ])

          const emailText = emailRes.content[0].type === 'text' ? emailRes.content[0].text : ''
          const smsText = smsRes.content[0].type === 'text' ? smsRes.content[0].text : ''

          let emailSubject = ''
          let emailBody = ''
          try {
            const parsed = JSON.parse(emailText)
            emailSubject = parsed.subject ?? ''
            emailBody = parsed.body ?? ''
          } catch {
            emailSubject = `Investment Opportunity: ${property.address}`
            emailBody = emailText
          }

          results[t] = { emailSubject, emailBody, smsBody: smsText.trim() }

          logAiCall({
            tenantId, userId: ctx.userId,
            type: 'blast_gen', pageContext: `property:${params.propertyId}`,
            input: `Blast gen for ${property.address} tier=${t}`,
            output: `Email: ${emailSubject} | SMS: ${smsText.trim().slice(0, 100)}`,
            tokensIn: (emailRes.usage?.input_tokens ?? 0) + (smsRes.usage?.input_tokens ?? 0),
            tokensOut: (emailRes.usage?.output_tokens ?? 0) + (smsRes.usage?.output_tokens ?? 0),
            durationMs: blastTimer(), model: 'claude-sonnet-4-6',
          }).catch(() => {})
        } catch {
          results[t] = {
            emailSubject: `Investment Opportunity: ${property.address}`,
            emailBody: `Property available at ${property.address}, ${property.city}, ${property.state}. ${specs.join(', ')}. Contact us for details.`,
            smsBody: `Deal alert: ${property.address}. ${specs.slice(0, 2).join(', ')}. ARV ${property.arv ? `$${Number(property.arv).toLocaleString()}` : 'TBD'}. Reply for details.`,
          }
        }
      }

      return NextResponse.json({ blasts: results })
    }

    // Send blast to a specific tier
    if (action === 'send' && tier) {
      // Get buyers — use explicit IDs if provided, otherwise filter by tier
      const selectedIds = Array.isArray(buyerIds) ? buyerIds as string[] : null
      const buyers = await db.buyer.findMany({
        where: selectedIds
          ? { tenantId, isActive: true, id: { in: selectedIds } }
          : { tenantId, isActive: true },
      })

      const tierBuyers = selectedIds ? buyers : buyers.filter(b => {
        const tags = (Array.isArray(b.tags) ? b.tags : []).map((t: unknown) => String(t).toLowerCase())
        if (tier === 'priority') return tags.some(t => t.includes('priority'))
        if (tier === 'qualified') return tags.some(t => t.includes('qualified') || t.includes('cash') || t.includes('verified'))
        if (tier === 'jv') return tags.some(t => t.includes('jv') || t.includes('partner'))
        return true
      })

      // ── Bulk blast approval gate ───────────────────────────────────────────
      // Every blast with ≥1 recipient requires explicit user confirmation before
      // sending. Stricter than requireApproval's built-in >10 threshold per the
      // rollout policy in docs/audits/ACTION_EXECUTION_AUDIT.md (row 15).
      // Two-phase protocol:
      //   1. Client POSTs without approvalGateId → we create a pending audit_logs
      //      row, return 202 with gate details (recipient count, property, sample).
      //   2. Client POSTs again with approvalGateId → we verify and send.
      if (tierBuyers.length === 0) {
        return NextResponse.json({ error: 'No recipients matched', sent: 0, skipped: 0 }, { status: 400 })
      }

      if (!approvalGateId) {
        const resolvedChannel = String(channel ?? 'sms')
        const gate = await db.auditLog.create({
          data: {
            tenantId,
            userId: ctx.userId,
            action: `gate.${resolvedChannel}_blast.pending`,
            resource: `${resolvedChannel}_blast`,
            resourceId: params.propertyId,
            source: 'SYSTEM',
            severity: 'WARNING',
            payload: {
              description: `Send ${resolvedChannel.toUpperCase()} to ${tierBuyers.length} buyers for ${property.address}`,
              recipientCount: tierBuyers.length,
              propertyId: params.propertyId,
              propertyAddress: property.address,
              channel: resolvedChannel,
              tier,
              sampleSubject: subject ? String(subject).slice(0, 80) : null,
              sampleBody: message ? String(message).slice(0, 200) : null,
              buyerIdSample: tierBuyers.map(b => b.id).slice(0, 20),
            },
          },
        })
        return NextResponse.json({
          status: 'pending_approval',
          gateId: gate.id,
          recipientCount: tierBuyers.length,
          propertyAddress: property.address,
          channel: resolvedChannel,
          sampleSubject: subject ? String(subject).slice(0, 80) : null,
          sampleBody: message ? String(message).slice(0, 200) : null,
          confirmationMessage: `Send ${resolvedChannel.toUpperCase()} to ${tierBuyers.length} buyers at ${property.address}? Confirm to proceed.`,
        }, { status: 202 })
      }

      // Verify the approval gate — same tenant, same user, same property, same
      // action family, still fresh (≤5 min old).
      // FIX: was leaking — Class 2 — prior code used findUnique({ id }) then
      // JS-side `gate.tenantId !== tenantId` comparison. The DB query was
      // unscoped; the JS guard was the only thing keeping the row from leaking.
      // Now: findFirst({ id, tenantId, userId }) pushes the boundary into the query.
      const gate = await db.auditLog.findFirst({
        where: {
          id: approvalGateId,
          tenantId,
          userId: ctx.userId,
          resourceId: params.propertyId,
        },
        select: { id: true, action: true, createdAt: true },
      })
      const gateAgeMs = gate ? Date.now() - gate.createdAt.getTime() : Infinity
      if (!gate
          || !gate.action.startsWith('gate.')
          || !gate.action.endsWith('_blast.pending')
          || gateAgeMs > 5 * 60_000) {
        return NextResponse.json({ error: 'Invalid or expired approval gate' }, { status: 403 })
      }
      await approveAction(gate.id, ctx.userId, tenantId)

      // Create blast record
      const blast = await db.dealBlast.create({
        data: {
          tenantId,
          propertyId: params.propertyId,
          createdById: ctx.userId,
          channel: channel ?? 'sms',
          message: message ?? '',
          status: 'sending',
        },
      })

      // Actually send through GHL — serial to avoid rate limits
      const { getGHLClient } = await import('@/lib/ghl/client')
      const ghl = await getGHLClient(tenantId)
      let sentCount = 0
      let skippedCount = 0

      for (const buyer of tierBuyers) {
        const contactId = buyer.ghlContactId
        if (!contactId) { skippedCount++; continue }

        try {
          if (channel === 'email' && subject && message) {
            await ghl.sendEmail(contactId, subject, `<div>${(message as string).replace(/\n/g, '<br>')}</div>`)
          } else if (message) {
            await ghl.sendSMS(contactId, message as string)
          }
          sentCount++

          // Log recipient
          await db.dealBlastRecipient.create({
            data: { blastId: blast.id, buyerId: buyer.id },
          })

          // Small delay to avoid rate limits
          await new Promise(r => setTimeout(r, 100))
        } catch (err) {
          console.error(`[Blast] Failed to send to buyer ${buyer.id}:`, err instanceof Error ? err.message : err)
          skippedCount++
        }
      }

      // Update blast status
      // FIX: was leaking — Class 1 — prior code was `update({ where: { id: blast.id } })`.
      // We just created `blast` with tenantId scoped, but defense-in-depth: scope every write.
      await db.dealBlast.update({
        where: { id: blast.id, tenantId },
        data: { status: 'sent', sentAt: new Date() },
      })

      await db.auditLog.create({
        data: {
          tenantId,
          userId: ctx.userId,
          action: 'deal_blast.sent',
          source: 'USER',
          severity: 'INFO',
          payload: { propertyId: params.propertyId, tier, channel, sent: sentCount, skipped: skippedCount },
        },
      })

      return NextResponse.json({ status: 'success', blastId: blast.id, sentTo: sentCount, skipped: skippedCount })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to process blast'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
})
