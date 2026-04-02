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

  // ─── Additional GHL Actions ───
  {
    name: 'send_email',
    description: 'Send an email to a GHL contact.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contactName: { type: 'string', description: 'Contact name' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body (HTML supported)' },
      },
      required: ['subject', 'body'],
    },
  },
  {
    name: 'update_contact',
    description: 'Update a contact\'s fields in GHL (name, phone, email, tags).',
    input_schema: {
      type: 'object' as const,
      properties: {
        contactName: { type: 'string', description: 'Contact to update' },
        firstName: { type: 'string', description: 'New first name' },
        lastName: { type: 'string', description: 'New last name' },
        phone: { type: 'string', description: 'New phone number' },
        email: { type: 'string', description: 'New email' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to set' },
      },
      required: ['contactName'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a GHL task as completed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        taskId: { type: 'string', description: 'Task ID to complete' },
        title: { type: 'string', description: 'Task title for display' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'add_contact_to_property',
    description: 'Link a GHL contact to a property as a seller, buyer, or other role.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contactName: { type: 'string', description: 'Contact name to search in GHL' },
        role: { type: 'string', description: 'Role: Primary Seller, Co-Seller, Buyer, Attorney, Agent, Other' },
      },
      required: ['contactName'],
    },
  },

  // ─── Gunner Data Actions ───
  {
    name: 'change_property_status',
    description: 'Change a property\'s acquisition or disposition status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        statusType: { type: 'string', description: 'acquisition or disposition' },
        newStatus: { type: 'string', description: 'New status value' },
        reason: { type: 'string', description: 'Why changing status' },
      },
      required: ['statusType', 'newStatus'],
    },
  },
  {
    name: 'add_team_member_to_property',
    description: 'Assign a team member to a property.',
    input_schema: {
      type: 'object' as const,
      properties: {
        userName: { type: 'string', description: 'Team member name' },
        role: { type: 'string', description: 'Role on this property: Admin, Lead Manager, Acquisition Manager, Disposition Manager' },
      },
      required: ['userName', 'role'],
    },
  },

  // ─── Contact + Opportunity Actions ───
  {
    name: 'create_contact',
    description: 'Create a new contact in GHL CRM.',
    input_schema: {
      type: 'object' as const,
      properties: {
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
        phone: { type: 'string', description: 'Phone number' },
        email: { type: 'string', description: 'Email address' },
        source: { type: 'string', description: 'Lead source (cold call, referral, etc.)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to add' },
      },
      required: ['firstName', 'phone'],
    },
  },
  {
    name: 'create_opportunity',
    description: 'Create a new deal/opportunity in a GHL pipeline.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contactName: { type: 'string', description: 'Contact name for the deal' },
        pipelineName: { type: 'string', description: 'Pipeline name' },
        stageName: { type: 'string', description: 'Initial stage name' },
        dealName: { type: 'string', description: 'Deal name (e.g., "123 Main St - Smith")' },
        monetaryValue: { type: 'number', description: 'Estimated deal value in dollars' },
      },
      required: ['contactName', 'dealName'],
    },
  },
  {
    name: 'regrade_call',
    description: 'Re-grade the current call with updated AI analysis. Use when the user wants fresh grading.',
    input_schema: {
      type: 'object' as const,
      properties: {
        callId: { type: 'string', description: 'Call ID to regrade (from page context)' },
        reason: { type: 'string', description: 'Why regrading' },
      },
      required: [],
    },
  },
  {
    name: 'summarize_property',
    description: 'Generate a comprehensive deal brief for the current property. Includes all data points, deal health, and recommended actions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        propertyAddress: { type: 'string', description: 'Property address' },
      },
      required: [],
    },
  },
]
