// POST /api/properties/[propertyId]/blast — generate + send deal blast
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  req: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const { action, tiers, tier } = await req.json()

    const property = await db.property.findUnique({
      where: { id: params.propertyId, tenantId },
      select: {
        address: true, city: true, state: true, zip: true,
        askingPrice: true, arv: true, contractPrice: true, assignmentFee: true,
        status: true,
      },
    })
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    // Generate blast content
    if (action === 'generate') {
      const selectedTiers = (tiers as string[]) ?? []
      const results: Record<string, { emailSubject: string; emailBody: string; smsBody: string }> = {}

      for (const t of selectedTiers) {
        const tierContext: Record<string, string> = {
          priority: 'Priority Buyer: exclusive early access, urgency, high confidence tone',
          qualified: 'Qualified Buyer: professional, detail-focused, ROI-oriented',
          jv: 'JV Partner: partnership framing, profit split potential',
          unqualified: 'Educational: no jargon, simple CTA',
        }

        const emailPrompt = `Generate a professional wholesale real estate deal blast email for the ${t} buyer tier.
Property: ${property.address}, ${property.city}, ${property.state} ${property.zip}
Asking: ${property.askingPrice ? `$${Number(property.askingPrice).toLocaleString()}` : 'N/A'}
ARV: ${property.arv ? `$${Number(property.arv).toLocaleString()}` : 'N/A'}
Tier context: ${tierContext[t] ?? tierContext.unqualified}

Keep subject line under 60 chars. Email under 300 words. Return ONLY JSON: {"subject":"...","body":"..."}`

        const smsPrompt = `Write a wholesale deal alert SMS for ${t} buyers.
Property: ${property.address} | Asking: ${property.askingPrice ? `$${Number(property.askingPrice).toLocaleString()}` : 'TBD'} | ARV: ${property.arv ? `$${Number(property.arv).toLocaleString()}` : 'TBD'}
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
        } catch {
          results[t] = {
            emailSubject: `Investment Opportunity: ${property.address}`,
            emailBody: `Property available at ${property.address}, ${property.city}, ${property.state}. Contact us for details.`,
            smsBody: `Deal alert: ${property.address}. ARV ${property.arv ? `$${Number(property.arv).toLocaleString()}` : 'TBD'}. Reply for details.`,
          }
        }
      }

      return NextResponse.json({ blasts: results })
    }

    // Send blast to a specific tier
    if (action === 'send' && tier) {
      const { message, channel, subject } = await req.json().catch(() => ({ message: '', channel: 'sms', subject: '' }))

      // Get matched buyers for this tier
      const buyers = await db.buyer.findMany({
        where: { tenantId, isActive: true },
      })

      const tierBuyers = buyers.filter(b => {
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
            await ghl.sendEmail(contactId, subject, `<div>${message.replace(/\n/g, '<br>')}</div>`)
          } else if (message) {
            await ghl.sendSMS(contactId, message)
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
    const message = err instanceof Error ? err.message : 'Failed to process blast'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
