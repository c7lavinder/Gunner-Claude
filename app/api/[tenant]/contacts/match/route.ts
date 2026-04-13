// app/api/[tenant]/contacts/match/route.ts
// GET — match a phone number against existing sellers and buyers

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { withTenant } from '@/lib/api/withTenant'

type Params = { tenant: string }

export const GET = withTenant<Params>(async (req, ctx) => {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) {
    return NextResponse.json({ match: null })
  }

  // Normalize: strip non-digits
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) {
    return NextResponse.json({ match: null })
  }

  // Match last 10 digits
  const searchDigits = digits.length >= 10 ? digits.slice(-10) : digits

  // Search sellers
  const seller = await db.seller.findFirst({
    where: {
      tenantId: ctx.tenantId,
      OR: [
        { phone: { contains: searchDigits } },
        { secondaryPhone: { contains: searchDigits } },
        { mobilePhone: { contains: searchDigits } },
      ],
    },
    select: { id: true, name: true },
  })

  if (seller) {
    return NextResponse.json({
      match: { type: 'seller', id: seller.id, name: seller.name },
    })
  }

  // Search buyers
  const buyer = await db.buyer.findFirst({
    where: {
      tenantId: ctx.tenantId,
      OR: [
        { phone: { contains: searchDigits } },
        { secondaryPhone: { contains: searchDigits } },
        { mobilePhone: { contains: searchDigits } },
      ],
    },
    select: { id: true, name: true },
  })

  if (buyer) {
    return NextResponse.json({
      match: { type: 'buyer', id: buyer.id, name: buyer.name },
    })
  }

  return NextResponse.json({ match: null })
})
