# GUNNER AI — DAY HUB + CALLS FULL REPLICATION PROMPT
## For Claude Code | Based on live audit of getgunner.ai

---

## CONTEXT

You are replicating two pages — **Day Hub** (`/tasks`) and **Calls** (`/calls`) —
to work identically to the old production site at `getgunner.ai`.
Read `PROGRESS.md`, `CLAUDE.md`, and `docs/DESIGN.md` before starting.
Do NOT change auth, middleware, or Prisma schema unless noted.

---

## PAGE 1 — DAY HUB (`/[tenant]/tasks`)

### Layout Overview
Two-column layout:
- **Left (main, ~65% width):** KPI bar → Inbox/Appointments tabs → Tasks list
- **Right (sidebar, ~35% width):** AI Coach panel (sticky)

---

### SECTION 1 — PAGE HEADER

```
🔥 Day Hub    [ADMIN] [LM] [AM] [DISPO]    Full team overview — all tasks, KPIs, and inbox
                                                                          [⚙️]  [🔄]
```

- Fire emoji + "Day Hub" as page title (large, bold)
- Role tab switcher: `ADMIN` (active = dark red filled pill), `LM`, `AM`, `DISPO` (inactive = plain text)
- Subtitle text: "Full team overview — all tasks, KPIs, and inbox" (muted, shown next to tabs)
- Top-right: gear icon (⚙️) + refresh icon (🔄)
- Each role tab filters the entire page (KPIs, inbox, tasks) to that role's data

**Role views:**
- `ADMIN` — full team overview, all reps
- `LM` — Land Manager view (their leads only)
- `AM` — Acquisitions Manager view
- `DISPO` — Disposition view

---

### SECTION 2 — KPI STAT CARDS (5 cards, horizontal row)

Each card:
- Icon (outlined, red/dark) + label in caps + big number + `/goal` in smaller muted text
- Thin red bottom progress bar (filled proportionally to current/goal)
- Cards are: CALLS, CONVOS, APTS, OFFERS, CONTRACTS

```
[📞 CALLS      ] [💬 CONVOS    ] [📅 APTS      ] [🎯 OFFERS    ] [📋 CONTRACTS ]
[ 7 / 340      ] [ 1 / 40      ] [ 1 / 8       ] [ 0 / 2       ] [ 0 / 1       ]
[              ] [              ] [ 1 AM Direct  ] [              ] [              ]
[====          ] [=             ] [====          ] [              ] [=             ]
```

- APTS card can have a sub-label like "1 AM Direct" in orange when appointments come from AM
- Data source: GHL API for today's activity counts vs. team goals set in settings
- API endpoint needed: `GET /api/[tenant]/dayhub/kpis`

---

### SECTION 3 — LEFT PANEL: INBOX / APPOINTMENTS TABS

#### Tab bar
- `💬 INBOX` (active = dark red pill button) | `📅 APPOINTMENTS` (inactive = plain)

#### INBOX tab

**Inbox header row:**
```
INBOX  [21]          [All (21)]  [Missed (5)]  [Msgs (16)]  [🔄]
```
- "INBOX" label (bold caps) + count badge (dark red filled pill)
- Right side filters: `All (N)` (active = dark red pill), `Missed (N)`, `Msgs (N)` + refresh icon

**Each inbox row:**
```
[avatar]  Contact Name                                          Time
          Address line, City, State ZIP
          → RepName   Event type / message preview
```
- Avatar: circular icon — phone-with-slash (red tint) for missed call, chat bubble (blue tint) for message
- Contact name: bold
- Address: muted smaller text
- `→ RepName` in dark red bold + event text in muted gray
- Event types: "Missed call.", "Message preview text truncated..."
- Timestamp: right-aligned, muted ("12:27 AM", "Yesterday 8:25 PM")
- Row is clickable → opens inline conversation thread (replaces list with thread view)

**Missed vs Messages filter:**
- `Missed (N)` — shows only missed call rows (phone-slash avatar)
- `Msgs (N)` — shows only message conversation rows (chat bubble avatar)

**Inline conversation thread (on row click):**
```
[←]  [avatar]  Contact Name                    [📤]  [↗]
               (615) 555-0000

     [date separator: Wed, Apr 23]
                                    Opportunity created  ●
                                                2:53 PM
                                    Opportunity updated  ●
                                                2:55 PM
     [date separator: Today]
              ○  Missed Call  12:27 AM

     Reply to [Contact Name]...
```
- Back arrow `←` returns to inbox list
- Header: avatar circle + name + phone number + send icon (📤) + external link icon (↗)
- Event bubbles: dark red filled rounded pills, right-aligned, with timestamp below
  - Types: "Opportunity created", "Opportunity updated", "Opportunity status changed", "Opportunity deleted"
- Special: "Missed Call" pill — outlined (not filled), with phone icon, centered
- Date separators: centered muted text ("Wed, Apr 23", "Today")
- Reply input at bottom: placeholder "Reply to [Name]..."
- Data source: GHL conversations API for this contact

#### APPOINTMENTS tab
- Shows "Today's Appointments" heading
- Empty state: calendar icon + "No appointments today" + "Appointments from your CRM calendar will appear here."
- When populated: appointment cards with time, contact name, address, rep assigned
- Data source: GHL calendar API

---

### SECTION 4 — TASKS LIST (below inbox, full width left column)

**Tasks header:**
```
[Categories ▼]  [Team Members ▼]        252 tasks   [🔥 49 overdue]
```
- Two filter dropdowns: `Categories` and `Team Members`
- Count: "252 tasks" (total)
- Overdue badge: fire emoji + "49 overdue" (dark red filled pill)

**Each task row:**
```
[#]  [○]  [⭐ NEW LEAD]  Task Name                    Contact Name
                          Address, City, State ZIP  👤 Rep Name      [AM] [PM]  Due Today
```

Columns:
1. Row number (#)
2. Circle checkbox (○) — click to complete task
3. Category badge — color-coded outlined pill:
   - `⭐ NEW LEAD` — green outlined
   - `RESCHEDULE` — orange outlined
   - `FOLLOW-UP` — blue outlined
   - `CONTRACT` — purple outlined
4. Task name (bold)
5. Contact name + address (muted smaller)
6. 👤 Rep name
7. `AM` pill + `PM` pill — time-of-day indicators (light gray pills)
8. Due status (right-aligned):
   - `Due Today` — orange text
   - `1d overdue`, `2d overdue`, `3d+` — red text + row has light red background tint
   - `Upcoming` — muted text

**Overdue rows:** full row has a light red/pink background highlight

**Bottom of list:**
- `View More (202 remaining)` — text button to load more tasks

**Data source:** `GET /api/[tenant]/dayhub/tasks`
- Returns tasks from GHL sorted by: overdue first, then due today, then upcoming
- Filtered by role tab (ADMIN = all, LM/AM/DISPO = respective rep types)
- Filtered by Categories and Team Members dropdowns

---

### SECTION 5 — RIGHT PANEL: AI COACH

```
[🤖] AI Coach ✦                                          [sparkle settings icon]

         [🤖 icon centered]
    Ask questions or give commands —
    send SMS, add notes, create tasks, and more.

  [🎯 What should I focus on?]
  [💬 Send an SMS to...]
  [📝 Add a note for...]

  [text input: Ask AI Coach...]
```

- Header: robot icon + "AI Coach" + sparkle/AI icon
- Empty state: robot icon (large, centered, muted red circle bg) + description text
- 3 quick action chips (clickable, pill-shaped outlined buttons):
  - 🎯 "What should I focus on?"
  - 💬 "Send an SMS to..."
  - 📝 "Add a note for..."
- Text input at bottom for freeform commands
- On chip click or input submit → sends to AI, shows response in chat format
- AI can execute CRM actions: send SMS, add notes, create tasks via GHL API
- API: POST `/api/[tenant]/dayhub/coach` with `{ message, context }`

---

## PAGE 2 — CALLS (`/[tenant]/calls`)

### Layout Overview
- **Left (main ~65%):** Call list
- **Right (sidebar ~35%):** AI Coach panel (different from Day Hub version)

---

### SECTION 1 — PAGE HEADER

```
Call History
Review calls, provide feedback, and get coaching advice     [⚙️] [🔄 Syncing...] [🔄] [⋮]
```

- Title: "Call History" (large bold)
- Subtitle: "Review calls, provide feedback, and get coaching advice" (muted)
- Top right:
  - ⚙️ gear icon
  - 🔄 syncing indicator with "Syncing..." text (shows when GHL sync running)
  - 🔄 manual refresh button
  - ⋮ 3-dot menu → dropdown with:
    - "Sync BatchDialer"
    - "Upload Call"
    - "Coach Log"

---

### SECTION 2 — STATUS TABS (4 tabs, full width)

```
[📞 All Calls  2] |  [⚠️ Needs Review]  |  [Skipped  100+]  |  [🗂️ Archived]
```

- `All Calls` — active tab (white bg card, bold), count badge
- `Needs Review` — warning triangle icon + label (calls flagged for manager review)
- `Skipped` — label + count badge ("100+")
- `Archived` — archive icon + label

---

### SECTION 3 — FILTER BAR

```
[📅 Today ▼]  [👤 Team Member ▼]  [📞 Call Type ▼]  [🏷️ Outcome ▼]  [Score ▼]
```

All dropdowns with icons:
- **Date:** Today | Last 7 Days | This Month | Last 90 Days | All Time
- **Team Member:** list of all reps
- **Call Type:** Qualification Call | Admin Callback | Follow-Up | etc.
- **Outcome:** Appointment Set | No Answer | Not Interested | Follow-Up Scheduled | etc.
- **Score:** All | A (90-100%) | B (75-89%) | C (60-74%) | D (<60%)

---

### SECTION 4 — CALL LIST CARDS

Each card:
```
● Contact Name    [🟢 Outbound]  [Admin Callback]  [Appointment Set]        [A]
  👤 Rep Name  ⏱️ 1:35  📞 about 5 hours ago                               95%
  📍 196 Cheynne Ln, Powell, TN 37849
  AI summary preview text truncated here with ellipsis at the end...
```

Anatomy:
- **Blue dot** (left edge) — unread/new indicator
- **Contact name** (bold, large)
- **Direction badge:** `🟢 Outbound` (green outlined pill with phone icon) or `Inbound`
- **Call type badge:** `Qualification Call` (purple outlined), `Admin Callback` (gray outlined), `Follow-Up` (blue outlined)
- **Outcome badge:** `Appointment Set` (teal outlined), `Follow-Up Scheduled` (yellow outlined), `No Answer` (gray), `Not Interested` (red outlined)
- **Grade circle** (top right): colored circle with letter grade
  - A = green, B = blue, C = yellow, D/F = red
- **Score %** below grade circle
- **Rep name** with person icon, **duration** with clock icon, **time ago** with phone icon
- **Address pill**: 📍 icon + full address (light gray outlined pill)
- **AI summary**: 1-2 lines of text, truncated with `...`

Clicking a card navigates to `/[tenant]/calls/[id]`

---

### SECTION 5 — AI COACH PANEL (Calls page version — different from Day Hub)

```
[🤖] AI Coach  ∨                                          [—]

  Ask questions or give CRM commands

        [✦ icon]
   Ask questions or take actions

   COACHING
   [How do I handle price objections?        ]
   [Tips for building rapport quickly        ]

   ACTIONS
   [⚡ Add note to recent contact: "Called back, interested"  ]
   [⚡ Create task: Follow up with seller tomorrow             ]
   [⚡ Send SMS to recent contact: "Are you still interested?" ]

   [text input]
```

Differences from Day Hub AI Coach:
- Has `∨` dropdown (to switch context/mode) + `—` minimize button
- Subtitle: "Ask questions or give CRM commands"
- Two sections of quick chips:
  - `COACHING` section (caps label): coaching question chips
  - `ACTIONS` section (caps label): ⚡ CRM action chips
- Chips are full-width outlined rounded rectangles (not pills)

---

## PAGE 3 — CALL DETAIL (`/[tenant]/calls/[id]`)

### SECTION 1 — HEADER

```
[← Back]  Crystal Daugherty                    [💬 Feedback]  [Reclassify]

  👤 Daniel Lozano  ⏱️ 6:55  🟢 Outbound  [Qualification Call]  [Appointment Set]
  [🕐 Follow-Up Scheduled]  [📍 157 Volunteer Ln, Clinton, TN 37716]  [📋 Property no longer in inventory]

  Friday, Mar 20, 2026 at 4:12 PM
```

- `← Back` button (outlined, with arrow)
- Contact name (large, bold)
- Top right: `Feedback` button (outlined, with comment icon) + `Reclassify` button (outlined)
- Tag row: all metadata as outlined pills in different colors:
  - Rep name pill (gray)
  - Duration pill (gray, clock icon)
  - Direction badge (green outlined for Outbound)
  - Call type badge (purple outlined)
  - Outcome badge (teal outlined)
  - Follow-up status (yellow/amber outlined, clock icon)
  - Address pill (gray, pin icon)
  - Property status pill (gray, clipboard icon) — "Property no longer in inventory" / "View Property"
- Date/time stamp below tags (muted)

---

### SECTION 2 — TWO-COLUMN BODY

**Left column (~33% width):**

```
┌─────────────────────────────────┐
│      OVERALL GRADE              │
│                                 │
│         ┌───┐                   │
│         │ A │  ← green rounded  │
│         └───┘    square, glow   │
│          91%                    │
│    Flag a scoring issue         │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ ✓ STRENGTHS                     │
│                                 │
│ • Bullet point strength 1       │
│   with quoted call text         │
│ • Bullet point strength 2       │
│ • ...                           │
└─────────────────────────────────┘
```

**Grade card:**
- "OVERALL GRADE" caps label
- Large letter grade in colored rounded square (NOT circle):
  - A = green (#22c55e range)
  - B = blue
  - C = yellow/amber
  - D/F = red
- Subtle glow/shadow behind the grade square matching color
- Score % below (large bold)
- "Flag a scoring issue" — small red link text

**Strengths card:**
- `✓ STRENGTHS` header (green check + green text)
- Bullet list of strengths
- Each bullet includes quoted text from the actual call (in single quotes)

**Right column (~67% width) — 4 TABS:**

```
[💡 Coaching]  [🎯 Criteria]  [📄 Transcript]  [⚡ Next Steps  1]
```

Tab styling:
- Active tab: white background card, bold text
- Inactive: plain text, muted icons
- Next Steps tab has a count badge (red filled circle)

---

### TAB 1 — COACHING

Three sections displayed vertically:

**SUMMARY section:**
```
📄 SUMMARY
[AI-generated paragraph summary of the call]
```

**AREAS FOR IMPROVEMENT section:**
```
↗ AREAS FOR IMPROVEMENT   ← orange/amber color
• Bullet with specific feedback and quoted alternatives
```

**COACHING TIPS section:**
```
💡 COACHING TIPS   ← blue/teal color
┌──────────────────────────────────────────────┐
│ Tip paragraph with specific scripting        │
│ suggestions and better phrasing examples     │
└──────────────────────────────────────────────┘
```
- Coaching Tips displayed in a bordered/shaded card

---

### TAB 2 — CRITERIA

2-column grid of scored criteria cards:

```
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Introduction & Rapport  10/10│  │ Setting Expectations     7/10 │
│ ████████████████████████████ │  │ ████████████████░░░░░░░░░░░░ │  ← blue bar
│                              │  │                               │
│ [Analysis paragraph with     │  │ [Analysis paragraph...]       │
│  quoted call text...]        │  │                               │
└──────────────────────────────┘  └──────────────────────────────┘
```

**Each criteria card:**
- Criteria name (bold) + score `X/Y` (right-aligned, colored)
- Full-width progress bar below title:
  - Green bar = high score (>80%)
  - Blue bar = partial/medium score
  - Red bar = low score
- Analysis paragraph with specific call quotes in single quotes

**All criteria (in order, left-to-right, top-to-bottom):**
1. Introduction & Rapport — `/10`
2. Setting Expectations — `/10`
3. Property Condition — `/10`
4. Roadblock Identification — `/10`
5. Motivation Extraction — `/20`
6. Price Discussion — `/15`
7. Tonality & Empathy — `/10`
8. Objection Handling — `/10`
9. Call Outcome — `/5`

Total = 100 points

---

### TAB 3 — TRANSCRIPT

**CALL RECORDING section:**
```
▷ CALL RECORDING

┌────────────────────────────────────────────────────────────────────┐
│  | | | | | | | | | ||| || | | | ||| | | | | | || |  ← waveform   │
│  ▌                                                                  │
└────────────────────────────────────────────────────────────────────┘
  |◀    ▶    ▶|    0:00 / 6:54                            1x    🔊
```

- Section label "CALL RECORDING" with play icon prefix
- WaveSurfer.js waveform visualization:
  - Pink/rose colored bars
  - Red vertical playhead line (position indicator)
  - Clickable to seek
- Controls row below waveform:
  - `|◀` skip to start
  - `▶` play/pause (large dark red circle button)
  - `▶|` skip to end
  - `0:00 / 6:54` current time / total time
  - `1x` speed button (right side) — cycles through 0.5x, 1x, 1.5x, 2x
  - 🔊 volume button (right side)

**KEY MOMENTS section:**
```
✦ KEY MOMENTS
AI-identified highlights from this call — objections, appointments, price discussions, and more.

[✦ Generate Highlights]
```

- Sparkle icon + "KEY MOMENTS" caps label
- Description text (muted)
- `✦ Generate Highlights` button (outlined, with sparkle icon)
- After generation: shows timestamped highlight clips as cards:
  - Highlight type badge (Objection, Appointment, Price Discussion, etc.)
  - Quote text from transcript
  - Timestamp link (clicking seeks audio to that moment)

**CALL TRANSCRIPT section:**
```
CALL TRANSCRIPT
Full transcription of the call

[Full transcript text as a single flowing paragraph or
 speaker-labeled lines if speaker diarization available]
```

- "CALL TRANSCRIPT" caps label
- "Full transcription of the call" muted subtitle
- Transcript text below (paragraph format)
- If speaker diarization: each line prefixed with "Rep:" or "Seller:"

---

### TAB 4 — NEXT STEPS

```
1 pending step
Review, edit, and push each action to CRM         [+ Add Action]  [Regenerate]
```

Header:
- "N pending step(s)" count
- "Review, edit, and push each action to CRM" subtitle
- `+ Add Action` button (outlined) — manually add a custom CRM action
- `Regenerate` button (plain text) — re-runs AI to regenerate all next steps

**CRM ACTIONS section (pending):**
```
💬 CRM ACTIONS (1)

┌─────────────────────────────────────────────────────────────────┐  ← green left border
│ ✓ Check Off Task    ✦ AI                                        │
│                                                                  │
│  Qualify New Lead                                               │
│  ✦ Why this action? ∨                                          │
│                                                                  │
│  [→ Push to CRM]    [✎ Edit]    [Skip]                         │
└─────────────────────────────────────────────────────────────────┘
```

Each pending action card:
- Green left border (3px)
- Light green background tint
- **Action type badge** (colored):
  - `✓ Check Off Task` — green
  - `📅 Create Appointment` — pink/rose
  - `⇄ Change Pipeline Stage` — orange
  - `📝 Add Note` — blue
  - `✉️ Send SMS` — teal
  - `✔ Create Task` — purple
- `✦ AI` purple badge (AI-generated)
- Action content/description
- `✦ Why this action? ∨` — expandable explanation (purple sparkle icon, italic, muted)
- Action buttons:
  - `→ Push to CRM` (dark red filled, send/rocket icon) — pushes to GHL
  - `✎ Edit` (plain text, pencil icon) — inline edit the action content
  - `Skip` (plain text) — marks as skipped

**Actions Taken section (already pushed):**
```
🕐 Actions Taken (3 pushed)

┌─────────────────────────────────────────────────────────────────┐  ← yellow/amber left border
│ 📝 Add Note    ✦ AI    ✓ Pushed                                │
│                                                                  │
│  I spoke with Mrs. Dougherty today regarding her...             │
│  [full note text]                                               │
│                                                                  │
│  ✦ Why this action? ∨                                          │
│  ✓ Action completed successfully!                               │
│  🕐 Pushed Mar 20 at 4:17 PM                                   │
└─────────────────────────────────────────────────────────────────┘
```

Each pushed card:
- Yellow/amber left border
- Light yellow background tint
- Action type badge + `✦ AI` badge + `✓ Pushed` green badge
- Full action content displayed
- "✓ Action completed successfully!" (green text)
- Timestamp: "Pushed [date] at [time]"

**Push to CRM logic (per action type):**
- `Check Off Task` → `ghl.completeTask(taskId)`
- `Add Note` → `ghl.addNote(contactId, body)`
- `Create Task` → `ghl.createTask(contactId, { title, dueDate })`
- `Send SMS` → `ghl.sendSMS(contactId, message)`
- `Create Appointment` → GHL calendar API with start/end/calendarId
- `Change Pipeline Stage` → `ghl.updateOpportunityStage(opportunityId, stageId)`

---

## API ROUTES NEEDED

### Day Hub
```
GET  /api/[tenant]/dayhub/kpis
     Returns: { calls: {count, goal}, convos: {count, goal}, apts: {count, goal, amDirect}, offers: {count, goal}, contracts: {count, goal} }
     Source: GHL contacts/conversations/appointments for today

GET  /api/[tenant]/dayhub/inbox
     Query: ?filter=all|missed|msgs&role=admin|lm|am|dispo
     Returns: paginated inbox items with lastMessage, type (missed_call|message), repName, timestamp

GET  /api/[tenant]/dayhub/inbox/[contactId]/conversation
     Returns: full GHL conversation thread for a contact

GET  /api/[tenant]/dayhub/appointments
     Returns: today's appointments from GHL calendar

GET  /api/[tenant]/dayhub/tasks
     Query: ?category=&assignedTo=&role=
     Returns: paginated tasks sorted by overdue→today→upcoming

POST /api/[tenant]/dayhub/coach
     Body: { message, context }
     Returns: AI response + optional CRM actions taken
```

### Calls
```
GET  /api/[tenant]/calls
     Query: ?date=1d|7d|30d|90d|all&rep=&callType=&outcome=&score=&tab=all|review|skipped|archived
     Returns: paginated call list with grade, summary, tags

GET  /api/[tenant]/calls/[id]
     Returns: full call object with transcript, criteria scores, strengths, coaching, nextSteps

POST /api/[tenant]/calls/[id]/feedback
     Body: { type, details }

POST /api/[tenant]/calls/[id]/reclassify
     Body: { callType }

POST /api/[tenant]/calls/[id]/generate-next-steps
     Calls Anthropic API, saves to DB

POST /api/[tenant]/calls/[id]/next-steps/[stepId]/push
     Pushes action to GHL based on type

POST /api/[tenant]/calls/[id]/next-steps/[stepId]/skip

POST /api/[tenant]/calls/[id]/generate-highlights
     Calls Anthropic API to extract key moments with timestamps

POST /api/[tenant]/calls/[id]/flag-score
     Body: { issue }
```

---

## DESIGN TOKENS (from DESIGN.md — enforce on every element)

```
Primary accent:    bg-[#1a1d27] dark bg, orange-500 accent (old)
                   OR white bg, dark red (#8B1A1A range) accent (new site)
Cards:             0.5px border, no box-shadow
Badges/pills:      outlined (border only, no fill) for tags
                   filled (dark bg) for active states and grade indicators
Font weights:      Never 700. Use 500 for headers, 400 for body
Border radius:     8px cards, 20px pills max
Spacing:           generous — when in doubt add more whitespace
Text sizes:        Never below 11px
```

---

## AUDIT CHECKLIST — verify each item works

### Day Hub
- [ ] ADMIN / LM / AM / DISPO role tabs switch data correctly
- [ ] 5 KPI cards load real today's data from GHL
- [ ] Progress bars fill proportionally to current/goal
- [ ] Inbox shows real GHL conversations
- [ ] Missed / Messages filter works
- [ ] Clicking inbox row opens conversation thread inline
- [ ] Back arrow returns to inbox list
- [ ] Appointments tab shows today's GHL calendar appointments
- [ ] Tasks list loads from GHL, sorted overdue→today→upcoming
- [ ] Category + Team Member filters work
- [ ] Overdue rows have red background tint
- [ ] "View More" loads additional tasks
- [ ] AI Coach sends message, gets response
- [ ] AI Coach quick chips work
- [ ] Gear icon opens settings
- [ ] Refresh icon reloads data

### Calls list
- [ ] 4 status tabs (All / Needs Review / Skipped / Archived) filter correctly
- [ ] Date filter (Today/7d/Month/90d/All) works
- [ ] Team Member filter works
- [ ] Call Type filter works
- [ ] Outcome filter works
- [ ] Score filter works
- [ ] Each call card shows: grade, score, direction, type, outcome badges
- [ ] Blue dot shows on ungraded/new calls
- [ ] Syncing indicator shows during GHL sync
- [ ] 3-dot menu: Sync BatchDialer, Upload Call, Coach Log all work
- [ ] AI Coach coaching chips send real questions
- [ ] AI Coach action chips execute real GHL actions

### Call detail
- [ ] Back button returns to calls list
- [ ] All header tags render correctly
- [ ] Feedback button opens modal
- [ ] Reclassify button opens modal with call type options
- [ ] Grade card shows letter + % + correct color
- [ ] "Flag a scoring issue" link works
- [ ] Strengths list renders with quoted text
- [ ] Coaching tab: Summary, Areas for Improvement, Coaching Tips all present
- [ ] Criteria tab: all 8-9 criteria cards with progress bars + scores
- [ ] Transcript tab: waveform loads and plays audio
- [ ] Waveform seek (click) works
- [ ] Speed control cycles 0.5x→1x→1.5x→2x
- [ ] Key Moments "Generate Highlights" button works
- [ ] Next Steps tab shows pending and completed actions
- [ ] "Push to CRM" sends correct GHL API call per action type
- [ ] "Edit" allows inline editing before push
- [ ] "Skip" marks step as skipped
- [ ] "Add Action" adds a custom step
- [ ] "Regenerate" re-runs AI for new next steps
- [ ] "Why this action?" expands with AI reasoning

---

## CONSTRAINTS

- TypeScript strict — no `any` types
- Do NOT change auth, middleware, or Prisma schema
- All GHL calls go through existing `GHLClient` methods
- Use `requireSession()` on all API routes
- Multi-tenancy: always filter by `tenantId`
- Match the DESIGN.md token system exactly
- Push to git when done with each section
