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

  // ─── Scheduling + Calendar Actions ───
  {
    name: 'schedule_sms',
    description: 'Schedule an SMS to be sent at a future date/time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contactName: { type: 'string', description: 'Contact name' },
        message: { type: 'string', description: 'SMS message text' },
        scheduledAt: { type: 'string', description: 'When to send (YYYY-MM-DD HH:MM CT)' },
      },
      required: ['message', 'scheduledAt'],
    },
  },

  // ─── Property Intelligence Actions ───
  {
    name: 'add_internal_note',
    description: 'Add an internal note to the current property. Not visible to contacts — for team use only.',
    input_schema: {
      type: 'object' as const,
      properties: {
        note: { type: 'string', description: 'Internal note text — include dates, amounts, key decisions' },
      },
      required: ['note'],
    },
  },
  {
    name: 'update_deal_intel',
    description: 'Update a specific deal intelligence field on the current property.',
    input_schema: {
      type: 'object' as const,
      properties: {
        field: { type: 'string', description: 'Deal intel field name (e.g., sellerMotivationLevel, timelineUrgency, competingOfferCount, decisionMakersConfirmed, dealHealthScore)' },
        value: { type: 'string', description: 'New value' },
        evidence: { type: 'string', description: 'What supports this update (call quote, observation)' },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'calculate_mao',
    description: 'Calculate Maximum Allowable Offer (MAO) for a property. MAO = ARV × (1 - profit margin) - repair costs - wholesale fee.',
    input_schema: {
      type: 'object' as const,
      properties: {
        arv: { type: 'number', description: 'After Repair Value in dollars' },
        repairCost: { type: 'number', description: 'Estimated repair costs' },
        wholesaleFee: { type: 'number', description: 'Desired wholesale/assignment fee (default $10,000)' },
        profitMargin: { type: 'number', description: 'Target profit margin as decimal (default 0.30 = 30%)' },
      },
      required: ['arv'],
    },
  },

  // ─── Call Actions ───
  {
    name: 'reclassify_call',
    description: 'Change the call type classification (cold call, qualification, offer, follow-up, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        newCallType: { type: 'string', description: 'New call type: cold_call | qualification_call | offer_call | follow_up_call | dispo_call | admin_call | purchase_agreement_call' },
        reason: { type: 'string', description: 'Why reclassifying' },
      },
      required: ['newCallType'],
    },
  },
  {
    name: 'mark_call_reviewed',
    description: 'Mark a call as reviewed by a manager. Useful for quality assurance tracking.',
    input_schema: {
      type: 'object' as const,
      properties: {
        notes: { type: 'string', description: 'Review notes' },
      },
      required: [],
    },
  },

  // ─── Buyer Actions ───
  {
    name: 'add_buyer',
    description: 'Add a new buyer to the system for deal blasting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Buyer name' },
        phone: { type: 'string', description: 'Phone number' },
        email: { type: 'string', description: 'Email address' },
        markets: { type: 'array', items: { type: 'string' }, description: 'Markets they buy in' },
        buyBox: { type: 'string', description: 'Buy box criteria (price range, property types, etc.)' },
      },
      required: ['name'],
    },
  },

  // ─── Team/Admin Actions ───
  {
    name: 'invite_team_member',
    description: 'Send an invite email to add a new team member.',
    input_schema: {
      type: 'object' as const,
      properties: {
        email: { type: 'string', description: 'Email address to invite' },
        role: { type: 'string', description: 'Role: LEAD_GENERATOR | LEAD_MANAGER | ACQUISITION_MANAGER | DISPOSITION_MANAGER | ADMIN' },
        name: { type: 'string', description: 'Person name' },
      },
      required: ['email', 'role'],
    },
  },

  // ═══ REMAINING GHL CONTACT ACTIONS ═══
  { name: 'schedule_email', description: 'Schedule an email to be sent at a future date/time (creates a reminder task).', input_schema: { type: 'object' as const, properties: { contactName: { type: 'string', description: 'Contact name' }, subject: { type: 'string', description: 'Email subject' }, body: { type: 'string', description: 'Email body' }, scheduledAt: { type: 'string', description: 'When to send (YYYY-MM-DD HH:MM CT)' } }, required: ['subject', 'body', 'scheduledAt'] } },
  { name: 'update_task', description: 'Update an existing GHL task (title, description, due date).', input_schema: { type: 'object' as const, properties: { taskId: { type: 'string', description: 'Task ID' }, title: { type: 'string', description: 'New title' }, description: { type: 'string', description: 'New description' }, dueDate: { type: 'string', description: 'New due date (YYYY-MM-DD)' } }, required: ['taskId'] } },
  { name: 'add_tags_to_contact', description: 'Add tags to a GHL contact without removing existing tags.', input_schema: { type: 'object' as const, properties: { contactName: { type: 'string', description: 'Contact name' }, tags: { type: 'array', items: { type: 'string' }, description: 'Tags to add' } }, required: ['tags'] } },
  { name: 'remove_tags_from_contact', description: 'Remove specific tags from a GHL contact.', input_schema: { type: 'object' as const, properties: { contactName: { type: 'string', description: 'Contact name' }, tags: { type: 'array', items: { type: 'string' }, description: 'Tags to remove' } }, required: ['tags'] } },
  { name: 'assign_contact_to_user', description: 'Assign a GHL contact to a specific team member.', input_schema: { type: 'object' as const, properties: { contactName: { type: 'string', description: 'Contact name' }, userName: { type: 'string', description: 'Team member to assign to' } }, required: ['userName'] } },

  // ═══ REMAINING GHL PIPELINE ACTIONS ═══
  { name: 'update_opportunity_status', description: 'Update opportunity status (won, lost, open, abandoned).', input_schema: { type: 'object' as const, properties: { contactName: { type: 'string', description: 'Contact name' }, status: { type: 'string', description: 'Status: won | lost | open | abandoned' }, reason: { type: 'string', description: 'Why changing status' } }, required: ['status'] } },
  { name: 'update_opportunity_value', description: 'Update the monetary value of an opportunity/deal.', input_schema: { type: 'object' as const, properties: { contactName: { type: 'string', description: 'Contact name' }, value: { type: 'number', description: 'New deal value in dollars' } }, required: ['value'] } },

  // ═══ REMAINING GHL CALENDAR ACTIONS ═══
  { name: 'reschedule_appointment', description: 'Reschedule an existing appointment to a new date/time.', input_schema: { type: 'object' as const, properties: { appointmentId: { type: 'string', description: 'Appointment ID' }, newDateTime: { type: 'string', description: 'New date and time (YYYY-MM-DD HH:MM CT)' }, reason: { type: 'string', description: 'Why rescheduling' } }, required: ['appointmentId', 'newDateTime'] } },
  { name: 'cancel_appointment', description: 'Cancel an existing appointment.', input_schema: { type: 'object' as const, properties: { appointmentId: { type: 'string', description: 'Appointment ID' }, reason: { type: 'string', description: 'Cancellation reason' } }, required: ['appointmentId'] } },
  { name: 'update_appointment_status', description: 'Update appointment status (confirmed, showed, no-show).', input_schema: { type: 'object' as const, properties: { appointmentId: { type: 'string', description: 'Appointment ID' }, status: { type: 'string', description: 'Status: confirmed | showed | no_show' } }, required: ['appointmentId', 'status'] } },

  // ═══ GHL WORKFLOW ACTIONS ═══
  { name: 'add_contact_to_workflow', description: 'Add a contact to a GHL automation workflow.', input_schema: { type: 'object' as const, properties: { contactName: { type: 'string', description: 'Contact name' }, workflowName: { type: 'string', description: 'Workflow name' } }, required: ['workflowName'] } },
  { name: 'remove_contact_from_workflow', description: 'Remove a contact from a GHL automation workflow.', input_schema: { type: 'object' as const, properties: { contactName: { type: 'string', description: 'Contact name' }, workflowName: { type: 'string', description: 'Workflow name' } }, required: ['workflowName'] } },

  // ═══ GHL BULK ACTIONS (require explicit approval) ═══
  { name: 'send_sms_blast', description: 'Send SMS blast to matched buyers for a property. HIGH-STAKES: requires explicit approval.', input_schema: { type: 'object' as const, properties: { propertyAddress: { type: 'string', description: 'Property address' }, tier: { type: 'string', description: 'Buyer tier: priority | qualified | jv | all' }, message: { type: 'string', description: 'SMS message text' } }, required: ['propertyAddress', 'message'] } },
  { name: 'send_email_blast', description: 'Send email blast to matched buyers for a property. HIGH-STAKES: requires explicit approval.', input_schema: { type: 'object' as const, properties: { propertyAddress: { type: 'string', description: 'Property address' }, tier: { type: 'string', description: 'Buyer tier: priority | qualified | jv | all' }, subject: { type: 'string', description: 'Email subject' }, body: { type: 'string', description: 'Email body' } }, required: ['propertyAddress', 'subject', 'body'] } },
  { name: 'bulk_tag_contacts', description: 'Add tags to multiple contacts at once. HIGH-STAKES: requires explicit approval.', input_schema: { type: 'object' as const, properties: { contactNames: { type: 'array', items: { type: 'string' }, description: 'List of contact names' }, tags: { type: 'array', items: { type: 'string' }, description: 'Tags to add' } }, required: ['contactNames', 'tags'] } },

  // ═══ REMAINING PROPERTY ACTIONS ═══
  { name: 'log_counter_offer', description: 'Log a counter offer on a property.', input_schema: { type: 'object' as const, properties: { amount: { type: 'string', description: 'Counter offer amount in dollars' }, notes: { type: 'string', description: 'Counter offer details and terms' }, fromSeller: { type: 'boolean', description: 'True if counter is from seller, false if from buyer' } }, required: ['amount'] } },
  { name: 'remove_contact_from_property', description: 'Remove a contact/seller from the current property.', input_schema: { type: 'object' as const, properties: { contactName: { type: 'string', description: 'Contact name to remove' } }, required: ['contactName'] } },
  { name: 'remove_team_member', description: 'Remove a team member from the current property.', input_schema: { type: 'object' as const, properties: { userName: { type: 'string', description: 'Team member name to remove' } }, required: ['userName'] } },
  { name: 'approve_all_deal_intel', description: 'Approve all pending deal intel changes for the current property.', input_schema: { type: 'object' as const, properties: {}, required: [] } },
  { name: 'set_property_markets', description: 'Set which markets this property belongs to.', input_schema: { type: 'object' as const, properties: { markets: { type: 'array', items: { type: 'string' }, description: 'Market names (e.g., Nashville, Memphis)' } }, required: ['markets'] } },
  { name: 'set_project_types', description: 'Set the project type(s) for this property.', input_schema: { type: 'object' as const, properties: { types: { type: 'array', items: { type: 'string' }, description: 'Project types: flip | rental | wholesale | owner_finance | subject_to | creative' } }, required: ['types'] } },
  { name: 'trigger_property_enrichment', description: 'Trigger AI enrichment for the current property (estimates ARV, repairs, rental, neighborhood).', input_schema: { type: 'object' as const, properties: {}, required: [] } },
  { name: 'create_comp_analysis', description: 'Generate a comparable property analysis for the current property using available data.', input_schema: { type: 'object' as const, properties: { radius: { type: 'string', description: 'Search radius (e.g., 0.5 miles, 1 mile)' } }, required: [] } },

  // ═══ REMAINING CALL ACTIONS ═══
  { name: 'generate_next_steps', description: 'Generate AI-recommended next steps for the current call.', input_schema: { type: 'object' as const, properties: {}, required: [] } },
  { name: 'push_next_step', description: 'Push a specific next step action to GHL CRM (send SMS, create task, etc).', input_schema: { type: 'object' as const, properties: { stepType: { type: 'string', description: 'Action type: send_sms | create_task | add_note | change_stage' }, stepLabel: { type: 'string', description: 'The specific action description' } }, required: ['stepType', 'stepLabel'] } },
  { name: 'flag_calibration', description: 'Flag the current call as a calibration example (good or bad reference for AI grading).', input_schema: { type: 'object' as const, properties: { type: { type: 'string', description: 'good | bad' }, notes: { type: 'string', description: 'Why this is a good/bad example' } }, required: ['type'] } },

  // ═══ REMAINING BUYER ACTIONS ═══
  { name: 'move_buyer_in_pipeline', description: 'Move a buyer to a new stage in the buyer pipeline.', input_schema: { type: 'object' as const, properties: { buyerName: { type: 'string', description: 'Buyer name' }, propertyAddress: { type: 'string', description: 'Property address' }, newStage: { type: 'string', description: 'New stage: matched | responded | interested | under_contract | closed' } }, required: ['buyerName', 'newStage'] } },
  { name: 'update_buyer', description: 'Update buyer details (name, phone, email, buy box, markets).', input_schema: { type: 'object' as const, properties: { buyerName: { type: 'string', description: 'Buyer name to update' }, phone: { type: 'string', description: 'New phone' }, email: { type: 'string', description: 'New email' }, markets: { type: 'array', items: { type: 'string' }, description: 'Markets they buy in' }, buyBox: { type: 'string', description: 'Updated buy box criteria' } }, required: ['buyerName'] } },
  { name: 'rematch_buyers', description: 'Re-run buyer matching for the current property to find new potential buyers.', input_schema: { type: 'object' as const, properties: {}, required: [] } },

  // ═══ REMAINING ADMIN ACTIONS ═══
  { name: 'update_user_role', description: 'Change a team member\'s role.', input_schema: { type: 'object' as const, properties: { userName: { type: 'string', description: 'Team member name' }, newRole: { type: 'string', description: 'New role: LEAD_GENERATOR | LEAD_MANAGER | ACQUISITION_MANAGER | DISPOSITION_MANAGER | ADMIN' } }, required: ['userName', 'newRole'] } },
  { name: 'set_kpi_goals', description: 'Set KPI target goals for a role.', input_schema: { type: 'object' as const, properties: { role: { type: 'string', description: 'Role to set goals for' }, metric: { type: 'string', description: 'Metric name: dials_per_day | appointments_per_week | offers_per_week | contracts_per_month' }, target: { type: 'number', description: 'Target value' } }, required: ['role', 'metric', 'target'] } },
  { name: 'update_pipeline_config', description: 'Update the pipeline trigger configuration.', input_schema: { type: 'object' as const, properties: { pipelineName: { type: 'string', description: 'Pipeline name' }, triggerStageName: { type: 'string', description: 'Stage that triggers property creation' } }, required: ['pipelineName', 'triggerStageName'] } },

  // ═══ INFORMATION ACTIONS — REMOVED Phase 3b (Session 86, 2026-05-13) ═══
  // 13 thin "dispatcher" tools removed: call_analysis, deal_blast_info,
  // deal_health, compare_deals, what_next, rep_performance, team_overview,
  // pipeline_health, explain_field, contact_objections, seller_profile,
  // title_risk, market_analysis.
  //
  // Why: they were stub names with no real handler logic — Claude would
  // call them and the route returned the same data the query tools already
  // expose (query_properties, search_calls, get_team_performance, etc.).
  // The overlap made tool selection ambiguous. See docs/TOOL_AUDIT.md.
  //
  // Replacement intent map (for prompt training in Phase 6):
  //   call_analysis      → search_calls + get_call_intel UI link
  //   pipeline_health    → cross_entity_query + get_ghl_pipeline_state
  //   what_next          → cross_entity_query with TCP + recency filters
  //   team_overview      → get_team_performance
  //   rep_performance    → get_team_performance with userName filter
  //   seller_profile     → query_sellers with includeProfile (handler todo)
  //   contact_objections → search_calls with the contact's phone
  //   deal_health        → query_properties with includeDealIntel
  //   compare_deals      → find_similar_deals
  //   explain_field / title_risk / market_analysis / deal_blast_info →
  //     UI affordance, not assistant work

  // ═══ PHASE B — QUERY TOOLS (data retrieval across the whole tenant) ═══
  // These return real data the assistant can narrate. Each is tenant-scoped
  // and capped at 100 rows. See lib/ai/query-tools.ts for behavior.

  {
    name: 'query_properties',
    description: 'Search inventory across the whole tenant by filters: status, ARV range, TCP score, lead source, city/state, market, assigned rep, days-since-last-contact, has-offer. Use when the user asks "show me properties where…" Returns up to 100 rows.',
    input_schema: {
      type: 'object' as const,
      properties: {
        acqStatus: { type: 'string', description: 'Acquisition status filter (NEW_LEAD, QUALIFIED, OFFER_MADE, UNDER_CONTRACT, etc.)' },
        dispoStatus: { type: 'string', description: 'Disposition status filter' },
        longtermStatus: { type: 'string', description: 'Long-term status filter' },
        arvMin: { type: 'number', description: 'Minimum After Repair Value' },
        arvMax: { type: 'number', description: 'Maximum After Repair Value' },
        askingPriceMax: { type: 'number', description: 'Maximum asking price' },
        tcpMin: { type: 'number', description: 'Minimum TCP score (0.0–1.0)' },
        daysSinceLastContactMin: { type: 'number', description: 'Minimum days since last contact (>= N)' },
        daysSinceLastContactMax: { type: 'number', description: 'Maximum days since last contact (<= N)' },
        leadSource: { type: 'string', description: 'Lead source contains this fragment (e.g., "Google Ads")' },
        city: { type: 'string', description: 'City name fragment' },
        state: { type: 'string', description: 'State (e.g., TN, GA)' },
        marketName: { type: 'string', description: 'Market name (e.g., Nashville)' },
        assignedToName: { type: 'string', description: 'Assigned rep name fragment' },
        hasOffer: { type: 'boolean', description: 'Only properties with a current offer' },
        excludeLost: { type: 'boolean', description: 'Exclude properties whose all three lanes are Lost (default true)' },
        sortBy: { type: 'string', description: 'tcp | arv | lastContact | createdAt' },
        sortDir: { type: 'string', description: 'asc | desc (default desc)' },
        limit: { type: 'number', description: 'Max rows (default 25, max 100)' },
      },
      required: [],
    },
  },
  {
    name: 'search_calls',
    description: 'Search calls across the tenant by date range, rep, grade band (low/medium/high), call type, outcome, contact, property fragment, primary emotion. Returns up to 100 rows with summaries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD' },
        dateTo: { type: 'string', description: 'End date YYYY-MM-DD' },
        daysAgo: { type: 'number', description: 'Shortcut: last N days' },
        repName: { type: 'string', description: 'Rep name fragment' },
        gradeBand: { type: 'string', description: 'low (<60), medium (60-80), or high (>=80)' },
        scoreMin: { type: 'number' },
        scoreMax: { type: 'number' },
        callType: { type: 'string', description: 'cold_call | qualification_call | offer_call | follow_up_call | dispo_call | admin_call' },
        callOutcome: { type: 'string', description: 'appointment_set | contract | dead | follow_up | not_interested' },
        contactNameFragment: { type: 'string' },
        propertyAddressFragment: { type: 'string' },
        primaryEmotion: { type: 'string', description: 'anxious | hopeful | resigned | angry | grief | defensive' },
        hasObjection: { type: 'boolean' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'semantic_search_calls',
    description: 'Vector-search call transcripts by topic/meaning, e.g. "calls where seller mentioned divorce". Falls back gracefully if embeddings are not yet wired up — use search_calls as backup.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'What to search for in the transcript' },
        daysAgo: { type: 'number', description: 'Restrict to last N days' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_tasks',
    description: 'Search tasks by status, priority, assigned rep, overdue, due-within-N-days, property. Useful for "show me overdue tasks" or "what is Mike\'s open queue?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'PENDING | IN_PROGRESS | COMPLETED | CANCELLED' },
        priority: { type: 'string', description: 'LOW | MEDIUM | HIGH | URGENT' },
        assignedToName: { type: 'string' },
        overdue: { type: 'boolean' },
        dueWithinDays: { type: 'number' },
        propertyAddressFragment: { type: 'string' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'get_kpi_metrics',
    description: 'KPI deltas — call volume, avg score, appointments set, contracts locked, tasks completed — for this week vs prior, or month vs prior. Pass repName to scope to one person, omit for whole-tenant.',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: { type: 'string', description: 'week | month' },
        repName: { type: 'string', description: 'Scope to a specific rep (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'get_team_performance',
    description: 'Team leaderboard — calls, avg score, appointments, contracts, open tasks per rep over last week or month. Use to find underperformers or top performers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: { type: 'string', description: 'week | month' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'query_sellers',
    description: 'Search sellers across the tenant by motivation, likelihood to sell, urgency level, hardship type, sale timeline, city/state.',
    input_schema: {
      type: 'object' as const,
      properties: {
        motivationMin: { type: 'number', description: 'Minimum motivation score 0.0–1.0' },
        likelihoodToSellMin: { type: 'number', description: 'Minimum likelihood 0.0–1.0' },
        urgencyLevel: { type: 'string', description: 'high | medium | low | unknown' },
        hardshipType: { type: 'string', description: 'financial | divorce | death | relocation | tired_landlord | health | other' },
        saleTimeline: { type: 'string', description: 'ASAP | 30_days | 60_days | 90_days | flexible' },
        nameFragment: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'query_buyers',
    description: 'Search active buyers by market, property type, repair budget, national vs local. Useful for "who would buy this kind of deal?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        market: { type: 'string', description: 'City, county, or zip fragment to match against buyer markets' },
        propertyType: { type: 'string', description: 'SFR | MFR | commercial | land | mobile' },
        maxRepairBudgetMin: { type: 'number', description: 'Minimum repair budget the buyer will take on' },
        isNationalBuyer: { type: 'boolean' },
        active: { type: 'boolean', description: 'Default true' },
        nameFragment: { type: 'string' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'get_ghl_pipeline_state',
    description: 'Pipeline health: stage distribution + stuck deals (in same stage > N days) for acquisition / disposition / longterm.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lane: { type: 'string', description: 'acquisition | disposition | longterm (default acquisition)' },
        stuckDaysThreshold: { type: 'number', description: 'Days in stage to be considered stuck (default 14)' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'cross_entity_query',
    description: 'Composite query — properties matching X AND no recent activity Y. Example: "properties with TCP > 0.6 not called in 5 days". Use when the user asks something that requires combining property filters with activity recency.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tcpMin: { type: 'number' },
        arvMin: { type: 'number' },
        acqStatus: { type: 'string' },
        dispoStatus: { type: 'string' },
        noCallInLastDays: { type: 'number', description: 'Hasn\'t been called in N+ days' },
        noTaskInLastDays: { type: 'number' },
        assignedToName: { type: 'string' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'find_similar_deals',
    description: 'Find comparable properties to the given one — same city, similar ARV, similar beds. Useful for "how did similar deals close?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        propertyId: { type: 'string', description: 'Property to find comparables for' },
        limit: { type: 'number' },
      },
      required: ['propertyId'],
    },
  },
]
