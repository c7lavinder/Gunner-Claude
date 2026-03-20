// lib/workflows/engine.ts
// Workflow execution engine — triggers automations based on events
// Step types: send_sms, create_task, update_status, notify, wait

import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'

// ─── Types ─────────────────────────────────────────────────────────────────

export type TriggerEvent = 'property_created' | 'stage_changed' | 'call_graded' | 'task_completed'

export interface WorkflowStep {
  type: 'send_sms' | 'create_task' | 'update_status' | 'notify' | 'wait'
  delay?: number          // minutes to wait before executing
  action?: string         // for create_task: task title, for update_status: new status
  content?: string        // SMS body, notification text
  condition?: string      // optional: only run if condition met (e.g., "score > 70")
}

export const TRIGGER_LABELS: Record<TriggerEvent, string> = {
  property_created: 'Property created',
  stage_changed: 'Pipeline stage changed',
  call_graded: 'Call graded',
  task_completed: 'Task completed',
}

export const STEP_TYPE_LABELS: Record<WorkflowStep['type'], string> = {
  send_sms: 'Send SMS',
  create_task: 'Create task',
  update_status: 'Update property status',
  notify: 'Send notification',
  wait: 'Wait',
}

// ─── Trigger workflows ─────────────────────────────────────────────────────

export async function triggerWorkflows(
  tenantId: string,
  event: TriggerEvent,
  context: {
    contactId?: string
    propertyId?: string
    callId?: string
    taskId?: string
    score?: number
    status?: string
  },
): Promise<number> {
  // Find active workflows for this trigger
  const workflows = await db.workflowDefinition.findMany({
    where: { tenantId, triggerEvent: event, isActive: true },
  })

  let triggered = 0

  for (const workflow of workflows) {
    const steps = workflow.steps as unknown as WorkflowStep[]
    if (!steps || steps.length === 0) continue

    const firstStep = steps[0]
    const delayMinutes = firstStep.delay ?? 0
    const nextRunAt = delayMinutes > 0
      ? new Date(Date.now() + delayMinutes * 60 * 1000)
      : null

    await db.workflowExecution.create({
      data: {
        tenantId,
        workflowId: workflow.id,
        contactId: context.contactId ?? '',
        propertyId: context.propertyId ?? null,
        currentStep: 0,
        status: delayMinutes > 0 ? 'waiting' : 'active',
        context: context as unknown as Prisma.InputJsonValue,
        nextRunAt,
      },
    })

    // If no delay, execute the first step immediately
    if (delayMinutes === 0) {
      await executeStep(workflow.id, context.contactId ?? '', 0, steps, tenantId, context)
    }

    triggered++
  }

  return triggered
}

// ─── Execute a workflow step ────────────────────────────────────────────────

async function executeStep(
  workflowId: string,
  contactId: string,
  stepIndex: number,
  steps: WorkflowStep[],
  tenantId: string,
  context: Record<string, unknown>,
): Promise<void> {
  if (stepIndex >= steps.length) {
    // Workflow complete
    await db.workflowExecution.updateMany({
      where: { workflowId, contactId, tenantId },
      data: { status: 'completed', currentStep: stepIndex },
    })
    return
  }

  const step = steps[stepIndex]

  // Check condition if present
  if (step.condition) {
    const passes = evaluateCondition(step.condition, context)
    if (!passes) {
      // Skip to next step
      await advanceToNextStep(workflowId, contactId, stepIndex, steps, tenantId, context)
      return
    }
  }

  // Execute based on type
  switch (step.type) {
    case 'wait': {
      const delayMinutes = step.delay ?? 60
      await db.workflowExecution.updateMany({
        where: { workflowId, contactId, tenantId },
        data: {
          status: 'waiting',
          currentStep: stepIndex,
          nextRunAt: new Date(Date.now() + delayMinutes * 60 * 1000),
        },
      })
      // Cron will pick this up later
      return
    }

    case 'create_task': {
      const user = await db.user.findFirst({
        where: { tenantId },
        select: { id: true },
      })
      if (user) {
        await db.task.create({
          data: {
            tenantId,
            assignedToId: user.id,
            title: step.action ?? 'Automated task',
            description: step.content ?? `Auto-created by workflow`,
            category: 'Follow-up',
            priority: 'HIGH',
            status: 'PENDING',
            dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // due tomorrow
          },
        })
      }
      break
    }

    case 'notify': {
      await db.auditLog.create({
        data: {
          tenantId,
          action: 'workflow.notification',
          resource: 'workflow',
          resourceId: workflowId,
          source: 'SYSTEM',
          severity: 'INFO',
          payload: {
            message: step.content ?? 'Workflow notification',
            contactId,
            stepIndex,
          } as unknown as Prisma.InputJsonValue,
        },
      })
      break
    }

    case 'update_status': {
      if (context.propertyId && step.action) {
        await db.property.update({
          where: { id: context.propertyId as string },
          data: { status: step.action as never },
        }).catch(() => {}) // non-blocking
      }
      break
    }

    case 'send_sms': {
      // Log the intent — actual sending goes through GHL client
      await db.auditLog.create({
        data: {
          tenantId,
          action: 'workflow.sms_queued',
          resource: 'workflow',
          resourceId: workflowId,
          source: 'SYSTEM',
          severity: 'INFO',
          payload: {
            contactId,
            message: step.content ?? '',
            stepIndex,
          } as unknown as Prisma.InputJsonValue,
        },
      })
      break
    }
  }

  // Advance to next step
  await advanceToNextStep(workflowId, contactId, stepIndex, steps, tenantId, context)
}

async function advanceToNextStep(
  workflowId: string,
  contactId: string,
  currentIndex: number,
  steps: WorkflowStep[],
  tenantId: string,
  context: Record<string, unknown>,
): Promise<void> {
  const nextIndex = currentIndex + 1
  if (nextIndex >= steps.length) {
    await db.workflowExecution.updateMany({
      where: { workflowId, contactId, tenantId },
      data: { status: 'completed', currentStep: nextIndex },
    })
    return
  }

  const nextStep = steps[nextIndex]
  if (nextStep.type === 'wait' || (nextStep.delay && nextStep.delay > 0)) {
    const delayMinutes = nextStep.delay ?? 60
    await db.workflowExecution.updateMany({
      where: { workflowId, contactId, tenantId },
      data: {
        status: 'waiting',
        currentStep: nextIndex,
        nextRunAt: new Date(Date.now() + delayMinutes * 60 * 1000),
      },
    })
  } else {
    await db.workflowExecution.updateMany({
      where: { workflowId, contactId, tenantId },
      data: { currentStep: nextIndex },
    })
    await executeStep(workflowId, contactId, nextIndex, steps, tenantId, context)
  }
}

function evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
  // Simple condition evaluation: "score > 70", "status == UNDER_CONTRACT"
  const match = condition.match(/^(\w+)\s*(>|<|>=|<=|==|!=)\s*(.+)$/)
  if (!match) return true

  const [, field, op, rawValue] = match
  const contextValue = context[field]
  if (contextValue === undefined) return false

  const numContext = Number(contextValue)
  const numValue = Number(rawValue)
  const isNumeric = !isNaN(numContext) && !isNaN(numValue)

  switch (op) {
    case '>': return isNumeric && numContext > numValue
    case '<': return isNumeric && numContext < numValue
    case '>=': return isNumeric && numContext >= numValue
    case '<=': return isNumeric && numContext <= numValue
    case '==': return String(contextValue) === rawValue.trim()
    case '!=': return String(contextValue) !== rawValue.trim()
    default: return true
  }
}

// ─── Process waiting workflows (called by cron) ────────────────────────────

export async function processWaitingWorkflows(): Promise<number> {
  const ready = await db.workflowExecution.findMany({
    where: {
      status: 'waiting',
      nextRunAt: { lte: new Date() },
    },
    include: {
      workflow: { select: { steps: true } },
    },
  })

  let processed = 0
  for (const exec of ready) {
    const steps = exec.workflow.steps as unknown as WorkflowStep[]
    const context = exec.context as Record<string, unknown>
    await executeStep(exec.workflowId, exec.contactId, exec.currentStep, steps, exec.tenantId, context)
    processed++
  }

  return processed
}
