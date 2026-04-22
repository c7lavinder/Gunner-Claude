// lib/ai/log.ts
// Central AI logging — every AI call goes through here
// Logs to ai_logs table for admin debugging and improvement

import { db } from '@/lib/db/client'

interface AiLogParams {
  tenantId: string
  userId?: string | null
  type: 'assistant_chat' | 'call_grading' | 'deal_intel' | 'next_steps' | 'blast_gen' | 'buyer_scoring' | 'property_enrich' | 'action_execution' | 'property_story'
  pageContext?: string | null
  input: string              // full input/prompt
  output: string             // full output/response
  toolsCalled?: unknown       // tool calls if any
  status?: 'success' | 'error' | 'rejected' | 'edited'
  errorMessage?: string | null
  tokensIn?: number | null
  tokensOut?: number | null
  durationMs?: number | null
  model?: string | null
}

export async function logAiCall(params: AiLogParams): Promise<void> {
  try {
    const costPerInputToken = params.model?.includes('haiku') ? 0.00000025 : 0.000003
    const costPerOutputToken = params.model?.includes('haiku') ? 0.00000125 : 0.000015
    const estimatedCost = (params.tokensIn ?? 0) * costPerInputToken + (params.tokensOut ?? 0) * costPerOutputToken

    await db.aiLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        type: params.type,
        pageContext: params.pageContext ?? null,
        inputSummary: params.input.slice(0, 500),
        inputFull: params.input,
        outputSummary: params.output.slice(0, 500),
        outputFull: params.output,
        toolsCalled: params.toolsCalled ?? undefined,
        status: params.status ?? 'success',
        errorMessage: params.errorMessage ?? null,
        tokensIn: params.tokensIn ?? null,
        tokensOut: params.tokensOut ?? null,
        estimatedCost: estimatedCost > 0 ? estimatedCost : null,
        durationMs: params.durationMs ?? null,
        model: params.model ?? null,
      },
    })
  } catch (err) {
    // Never let logging fail break the main flow
    console.error('[AiLog] Failed to log:', err instanceof Error ? err.message : err)
  }
}

// Helper to measure duration
export function startTimer(): () => number {
  const start = Date.now()
  return () => Date.now() - start
}
