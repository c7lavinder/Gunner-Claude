// lib/ghl/pipelines.ts
// Fetches pipeline IDs for seller and buyer pipelines from GHL

import { getGHLClient } from '@/lib/ghl/client'

const SELLER_PIPELINE_NAME = 'Sales Process'
const BUYER_PIPELINE_NAME = 'Buyers Pipeline'

export async function getSellerBuyerPipelineIds(
  tenantId: string
): Promise<{ sellerPipelineId: string | null; buyerPipelineId: string | null }> {
  const ghl = await getGHLClient(tenantId)
  const result = await ghl.getPipelines()
  const pipelines = result.pipelines ?? []

  let sellerPipelineId: string | null = null
  let buyerPipelineId: string | null = null

  for (const p of pipelines) {
    const name = p.name.trim().toLowerCase()
    if (name === SELLER_PIPELINE_NAME.toLowerCase()) sellerPipelineId = p.id
    if (name === BUYER_PIPELINE_NAME.toLowerCase()) buyerPipelineId = p.id
  }

  return { sellerPipelineId, buyerPipelineId }
}
