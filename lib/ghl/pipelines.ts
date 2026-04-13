// lib/ghl/pipelines.ts
// Fetches pipeline IDs for seller and buyer pipelines from GHL
// Matches by keyword: "sales" → seller, "buyer" → buyer

import { getGHLClient } from '@/lib/ghl/client'

export async function getSellerBuyerPipelineIds(
  tenantId: string
): Promise<{ sellerPipelineId: string | null; buyerPipelineId: string | null; pipelineNames: string[] }> {
  const ghl = await getGHLClient(tenantId)
  const result = await ghl.getPipelines()
  const pipelines = result.pipelines ?? []

  const pipelineNames = pipelines.map(p => p.name)
  console.log(`[Pipelines] Found ${pipelines.length} pipelines: ${pipelineNames.join(', ')}`)

  let sellerPipelineId: string | null = null
  let buyerPipelineId: string | null = null

  for (const p of pipelines) {
    const name = p.name.trim().toLowerCase()
    // Seller pipeline: match "sales process" or anything with "sales" or "seller"
    if (!sellerPipelineId && (name === 'sales process' || name.includes('sales') || name.includes('seller'))) {
      sellerPipelineId = p.id
      console.log(`[Pipelines] Seller pipeline: "${p.name}" (${p.id})`)
    }
    // Buyer pipeline: match "buyers pipeline" or anything with "buyer"
    if (!buyerPipelineId && (name.includes('buyer') || name.includes('disposition'))) {
      buyerPipelineId = p.id
      console.log(`[Pipelines] Buyer pipeline: "${p.name}" (${p.id})`)
    }
  }

  if (!sellerPipelineId) console.warn('[Pipelines] No seller pipeline found')
  if (!buyerPipelineId) console.warn('[Pipelines] No buyer pipeline found')

  return { sellerPipelineId, buyerPipelineId, pipelineNames }
}
