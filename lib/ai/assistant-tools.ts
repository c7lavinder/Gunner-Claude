// lib/ai/assistant-tools.ts
// Claude tool definitions for the Role Assistant
// Each tool = an action the assistant can propose for user approval

import type Anthropic from '@anthropic-ai/sdk'

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  // ─── GHL Contact Actions ───
  {
    name: 'send_sms',
    description: 'Send an SMS message to a GHL contact. Requires contactId and message.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contactName: { type: 'string', description: 'Contact name for display' },
        contactPhone: { type: 'string', description: 'Contact phone number' },
        message: { type: 'string', description: 'SMS message text' },
        fromUserName: { type: 'string', description: 'Name of team member sending' },
      },
      required: ['message'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a follow-up task in GHL for a contact.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        assignedTo: { type: 'string', description: 'Team member name to assign to' },
        contactName: { type: 'string', description: 'Contact this task is about' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_note',
    description: 'Add a note to a GHL contact record. Use for call summaries, deal updates, important info.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contactName: { type: 'string', description: 'Contact name' },
        note: { type: 'string', description: 'Note text — should be detailed, include numbers/dates' },
      },
      required: ['note'],
    },
  },
  {
    name: 'change_pipeline_stage',
    description: 'Move a contact to a different pipeline stage in GHL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contactName: { type: 'string', description: 'Contact name' },
        pipelineName: { type: 'string', description: 'Pipeline name' },
        stageName: { type: 'string', description: 'New stage name' },
        reason: { type: 'string', description: 'Why moving to this stage' },
      },
      required: ['stageName'],
    },
  },
  {
    name: 'create_appointment',
    description: 'Schedule an appointment in GHL calendar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Appointment title' },
        contactName: { type: 'string', description: 'Contact name' },
        dateTime: { type: 'string', description: 'Date and time (YYYY-MM-DD HH:MM CT)' },
        calendarName: { type: 'string', description: 'Which calendar to use' },
        assignedTo: { type: 'string', description: 'Team member assigned' },
      },
      required: ['title', 'dateTime'],
    },
  },

  // ─── Gunner Property Actions ───
  {
    name: 'update_property',
    description: 'Update a field on the current property record.',
    input_schema: {
      type: 'object' as const,
      properties: {
        field: { type: 'string', description: 'Field name to update (e.g., askingPrice, status, sellerMotivation)' },
        value: { type: 'string', description: 'New value' },
        reason: { type: 'string', description: 'Why updating this field' },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'log_offer',
    description: 'Log an offer made on a property.',
    input_schema: {
      type: 'object' as const,
      properties: {
        amount: { type: 'string', description: 'Offer amount in dollars' },
        notes: { type: 'string', description: 'Offer details, terms, conditions' },
        propertyAddress: { type: 'string', description: 'Property address' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'log_milestone',
    description: 'Log a deal milestone (appointment set, offer made, under contract, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'LEAD | APPOINTMENT_SET | OFFER_MADE | UNDER_CONTRACT | CLOSED' },
        notes: { type: 'string', description: 'Milestone notes' },
        propertyAddress: { type: 'string', description: 'Property address' },
      },
      required: ['type'],
    },
  },
  {
    name: 'generate_deal_blast',
    description: 'Generate SMS and email copy for a deal blast to buyers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        propertyAddress: { type: 'string', description: 'Property address' },
        targetTier: { type: 'string', description: 'Buyer tier: priority | qualified | jv | all' },
        tone: { type: 'string', description: 'Message tone: urgent | professional | casual' },
      },
      required: ['propertyAddress'],
    },
  },

  // ─── Information Actions (no approval needed) ───
  {
    name: 'summarize_deal',
    description: 'Generate a comprehensive deal summary for a property.',
    input_schema: {
      type: 'object' as const,
      properties: {
        propertyAddress: { type: 'string', description: 'Property address to summarize' },
      },
      required: [],
    },
  },
  {
    name: 'analyze_call',
    description: 'Provide detailed analysis of a specific call.',
    input_schema: {
      type: 'object' as const,
      properties: {
        callId: { type: 'string', description: 'Call ID to analyze' },
      },
      required: [],
    },
  },
]
