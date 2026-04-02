// GET + POST /api/properties/[propertyId]/blast — blast history + generate + send
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import Anthropic from '@anthropic-ai/sdk'
import { logAiCall, startTimer } from '@/lib/ai/log'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(
  _req: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const blasts = await db.dealBlast.findMany({
      where: { propertyId: params.propertyId, tenantId: session.tenantId },
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
}

export async function POST(
  req: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const { action, tiers, tier, message, channel, subject, buyerIds } = await req.json()

    const property = await db.property.findUnique({
      where: { id: params.propertyId, tenantId },
      select: {
        address: true, city: true, state: true, zip: true,
        askingPrice: true, arv: true, contractPrice: true, assignmentFee: true,
        beds: true, baths: true, sqft: true, yearBuilt: true, lotSize: true,
        propertyType: true, description: true, status: true,
        zillowData: true,
      },
    })
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    // Generate blast content
    if (action === 'generate') {
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

Include the property specs (beds/baths/sqft/year) and key deal numbers in the email body.
Keep subject line under 60 chars. Email under 300 words. Professional but urgent.
Return ONLY JSON: {"subject":"...","body":"..."}`

        const smsPrompt = `Write a wholesale deal alert SMS for ${t} buyers.
${property.address}, ${property.city} ${property.state} | ${specs.slice(0, 3).join(', ')} | Asking: ${property.askingPrice ? `$${Number(property.askingPrice).toLocaleString()}` : 'TBD'} | ARV: ${property.arv ? `$${Number(property.arv).toLocaleString()}` : 'TBD'}
Max 160 characters. Include a clear CTA. Return ONLY the SMS text, nothing else.`

        try {
          const [emailRes, smsRes] = await Promise.all([
            anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 500,
              messages: [{ role: 'user', content: emailPrompt }],
            }),
            anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
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
            tenantId, userId: session.userId,
            type: 'blast_gen', pageContext: `property:${params.propertyId}`,
            input: `Blast gen for ${property.address} tier=${t}`,
            output: `Email: ${emailSubject} | SMS: ${smsText.trim().slice(0, 100)}`,
            tokensIn: (emailRes.usage?.input_tokens ?? 0) + (smsRes.usage?.input_tokens ?? 0),
            tokensOut: (emailRes.usage?.output_tokens ?? 0) + (smsRes.usage?.output_tokens ?? 0),
            durationMs: blastTimer(), model: 'claude-sonnet-4-20250514',
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

      // Create blast record
      const blast = await db.dealBlast.create({
        data: {
          tenantId,
          propertyId: params.propertyId,
          createdById: session.userId,
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
      await db.dealBlast.update({
        where: { id: blast.id },
        data: { status: 'sent', sentAt: new Date() },
      })

      await db.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
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
}
