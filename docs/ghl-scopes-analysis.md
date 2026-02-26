# GHL OAuth Scopes Required for Gunner AI

## Analysis: API Endpoints Used → Required Scopes

### Contacts API
| Endpoint Used | File | Scope Required |
|---|---|---|
| GET /contacts/?locationId=... | ghlActions.ts, webhook.ts | contacts.readonly |
| GET /contacts/:contactId | ghlActions.ts, ghlService.ts, opportunityDetection.ts | contacts.readonly |
| PUT /contacts/:contactId | ghlActions.ts (update tags, fields) | contacts.write |
| GET /contacts/:contactId/notes | ghlActions.ts | contacts.readonly |
| POST /contacts/:contactId/notes | ghlActions.ts (addNoteToContact) | contacts.write |
| GET /contacts/:contactId/tasks | ghlActions.ts, opportunityDetection.ts | contacts.readonly |
| POST /contacts/:contactId/tasks | ghlActions.ts | contacts.write |
| PUT /contacts/:contactId/tasks/:taskId | ghlActions.ts | contacts.write |
| PUT /contacts/:contactId/tasks/:taskId/completed | ghlActions.ts | contacts.write |
| POST /contacts/:contactId/tags | ghlActions.ts (addTag) | contacts.write |
| GET /contacts/:contactId/appointments | opportunityDetection.ts | contacts.readonly |
| POST /contacts/:contactId/workflow/:workflowId | ghlActions.ts | contacts.write |
| DELETE /contacts/:contactId/workflow/:workflowId | ghlActions.ts | contacts.write |

**Required scopes: `contacts.readonly`, `contacts.write`**

### Conversations API
| Endpoint Used | File | Scope Required |
|---|---|---|
| GET /conversations/search | ghlActions.ts, ghlService.ts, opportunityDetection.ts | conversations.readonly |
| GET /conversations/:conversationId/messages | ghlActions.ts, ghlService.ts, opportunityDetection.ts | conversations/message.readonly |
| POST /conversations/messages | ghlActions.ts (sendSms) | conversations/message.write |
| GET /conversations/messages/:messageId/locations/:locationId/recording | ghlService.ts | conversations/message.readonly |

**Required scopes: `conversations.readonly`, `conversations/message.readonly`, `conversations/message.write`**

### Opportunities API
| Endpoint Used | File | Scope Required |
|---|---|---|
| GET /opportunities/search | ghlActions.ts, opportunityDetection.ts | opportunities.readonly |
| GET /opportunities/pipelines | ghlActions.ts, ghlService.ts, opportunityDetection.ts | opportunities.readonly |
| PUT /opportunities/:id | ghlActions.ts (update stage/status) | opportunities.write |

**Required scopes: `opportunities.readonly`, `opportunities.write`**

### Users API
| Endpoint Used | File | Scope Required |
|---|---|---|
| GET /users/search | ghlService.ts | users.readonly |
| GET /users/:userId | ghlActions.ts, ghlService.ts | users.readonly |

**Required scopes: `users.readonly`**

### Calendars API
| Endpoint Used | File | Scope Required |
|---|---|---|
| GET /calendars/?locationId=... | ghlActions.ts | calendars.readonly |
| GET /calendars/events | ghlActions.ts | calendars/events.readonly |
| GET /calendars/events/appointments | ghlActions.ts | calendars/events.readonly |
| POST /calendars/events/appointments | ghlActions.ts | calendars/events.write |
| PUT /calendars/events/appointments/:eventId | ghlActions.ts | calendars/events.write |
| DELETE /calendars/events/:eventId | ghlActions.ts | calendars/events.write |

**Required scopes: `calendars.readonly`, `calendars/events.readonly`, `calendars/events.write`**

### Workflows API
| Endpoint Used | File | Scope Required |
|---|---|---|
| GET /workflows/?locationId=... | ghlActions.ts | workflows.readonly |

**Required scopes: `workflows.readonly`**

### Locations API
| Endpoint Used | File | Scope Required |
|---|---|---|
| (Used via locationId in queries, no direct location endpoints) | - | locations.readonly (for webhook events) |

**Required scopes: `locations.readonly`** (needed for LocationCreate/LocationUpdate webhook events)

---

## Webhook Events Required → Scopes

| Webhook Event | Scope That Grants It |
|---|---|
| ContactCreate | contacts.readonly |
| ContactDelete | contacts.readonly |
| ContactDndUpdate | contacts.readonly |
| ContactTagUpdate | contacts.readonly |
| NoteCreate | contacts.readonly |
| NoteDelete | contacts.readonly |
| TaskCreate | contacts.readonly |
| TaskDelete | contacts.readonly |
| InboundMessage | conversations/message.readonly |
| OutboundMessage | conversations/message.readonly |
| OpportunityCreate | opportunities.readonly |
| OpportunityDelete | opportunities.readonly |
| OpportunityStageUpdate | opportunities.readonly |
| OpportunityStatusUpdate | opportunities.readonly |
| OpportunityMonetaryValueUpdate | opportunities.readonly |
| ConversationUnreadWebhook | conversations.readonly |

---

## Complete Scope List for Gunner AI

```
contacts.readonly
contacts.write
conversations.readonly
conversations/message.readonly
conversations/message.write
opportunities.readonly
opportunities.write
users.readonly
calendars.readonly
calendars/events.readonly
calendars/events.write
workflows.readonly
locations.readonly
```

**Total: 13 scopes**
**Access Type: All Sub-Account level**
