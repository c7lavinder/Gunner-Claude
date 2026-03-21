# Gunner Design System

## Philosophy
Apple Human Interface Guidelines adapted for web SaaS.
- Clarity: every element has one job — remove anything decorative
- Deference: UI recedes, content is the hero
- Flat design only — no gradients, no heavy shadows
- White space is intentional — when in doubt, add more padding

---

## Colors

```css
:root {
  /* Brand */
  --gunner-red: #C0392B;
  --gunner-red-light: #FAEDEC;
  --gunner-red-dark: #922B21;

  /* Surfaces */
  --bg-primary: #FFFFFF;
  --bg-secondary: #F8F7F4;
  --bg-tertiary: #F0EEE9;

  /* Text */
  --text-primary: #1A1A18;
  --text-secondary: #6B6B66;
  --text-muted: #9B9A94;

  /* Borders */
  --border-light: rgba(0,0,0,0.08);
  --border-medium: rgba(0,0,0,0.14);

  /* Semantic — color must mean something, never decorative */
  --green: #1D9E75;    --green-bg: #E1F5EE;
  --amber: #BA7517;    --amber-bg: #FAEEDA;
  --red: #A32D2D;      --red-bg: #FCEBEB;
  --blue: #185FA5;     --blue-bg: #E6F1FB;
  --purple: #534AB7;   --purple-bg: #EEEDFE;
}
```

---

## Typography

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;

/* Sizes */
/* 11px — timestamps, fine print        */
/* 13px — body, table cells             */
/* 14px — primary labels                */
/* 15px — card titles, nav items        */
/* 20px — section headers               */
/* 24px — page title                    */
/* 30px — KPI hero numbers              */

/* Weights: 400 | 500 | 600 ONLY. Never 700. */
```

---

## Spacing

8px grid only: `4 8 12 16 20 24 32 40 48 64px`

---

## Border Radius

```
6px    — badges, tags
10px   — buttons, inputs
14px   — cards, panels
20px   — modals
9999px — avatars, toggle pills
```

---

## Shadows

Cards use borders not shadows.
Only use shadow on floating elements (dropdowns, tooltips):
box-shadow: 0 1px 2px rgba(0,0,0,0.06);

---

## Components

### Card
background: white;
border: 0.5px solid var(--border-light);
border-radius: 14px;
padding: 16px 20px;
transition: all 150ms ease;
hover: box-shadow 0 1px 2px rgba(0,0,0,0.06); border-color var(--border-medium);

### Button — Primary (red)
background: var(--gunner-red);
color: white;
border: none;
border-radius: 10px;
padding: 9px 16px;
font-size: 13px;
font-weight: 600;
hover: background var(--gunner-red-dark);

### Button — Secondary
background: var(--bg-secondary);
color: var(--text-primary);
border: 0.5px solid var(--border-medium);
border-radius: 10px;
padding: 9px 16px;
font-size: 13px;
font-weight: 500;

### Button — AI Generate (purple)
background: var(--purple);
color: white;
border: none;
border-radius: 10px;
padding: 9px 16px;
font-size: 13px;
font-weight: 600;
Label must start with: ✦

### Status Badges
font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 9999px;
Appointment Set / Outbound / Interested → --green-bg + --green
Qualification Call                      → --purple-bg + --purple
Admin Callback                          → --bg-tertiary + --text-secondary
High priority                           → --red-bg + --red
AI badge                                → --purple-bg + --purple, prefix ✦

### Score Circle
width/height: 40px; border-radius: 50%; color: white; font-size: 13px; font-weight: 600;
90-100% → --green
80-89%  → --amber
70-79%  → --blue
<70%    → --red

### Top Navigation
height: 52px; position: sticky; top: 0; z-index: 100;
background: white; border-bottom: 0.5px solid var(--border-light);
Active link: --gunner-red text + 2px red bottom border
Font: 14px weight 500

### Tab Bar
Container: bg-tertiary, 4px padding, border-radius 14px
Active tab: white bg, 0 1px 2px rgba(0,0,0,0.06) shadow, text-primary
Inactive: transparent, text-secondary
Font: 13px weight 500

### Call List Row
[dot] [Name] [badges] ——————————— [Score circle]
[Rep] [duration] [time ago]
[address]
[summary — 2 lines max, text-secondary]
dot: green = reviewed, blue = unreviewed
hover: bg-secondary on full row

### AI Coach Panel
width: 320px; position: sticky; background: white;
border-left: 0.5px solid var(--border-light); padding: 16px;
Section headers: 10px uppercase, letter-spacing 0.08em, text-muted
Items: bg-secondary cards, 13px
Action items prefix: ⚡

### Training Issue / Win Cards
Issues: 2px left border --red, subtle red-bg
Wins:   2px left border --green, subtle green-bg
Both: title 14px 600 + AI badge + priority badge + rep chip
      checkmark and delete icons on hover (right side)

---

## Page Layouts

### /calls
[Nav 52px sticky]
[Header: "Call History" + subtitle]
[Tabs: All Calls | Needs Review | Skipped | Archived]
[Filters: Date | Team Member | Call Type | Outcome | Score]
[flex row]
  Call list — flex: 1, scrollable
  AI Coach — 320px, sticky

### /training
[Nav]
[Header: "Training"]
[Tabs: Team Training | Materials]
[AI Insights banner — purple border + Generate button]
[Role filter pills]
[Sub-tabs: Overview | Meeting Agenda]
[2-col grid: Issues to Address | Wins to Celebrate]

### /kpis
[Nav]
[Date filters]
[4 stat cards: Calls Made | Appts Set | Conversion % | Avg Score]
[Charts row]
[Team leaderboard table]

---

## AI Features

Any AI-powered feature gets:
- ✦ AI badge — purple-bg, purple text, 11px
- Purple left border on the containing card
- Section headers in --purple
- Buttons use the AI Generate style above

---

## Never
- Gradient backgrounds
- Box-shadow on cards (use 0.5px border instead)
- font-weight 700
- font-size below 11px
- border-radius above 20px on cards
- ALL CAPS text (except: KPI, SMS, CRM)
- Centered body text — left-align everything
- More than 3 badges per row item
- Colors outside the token list above
- Inter, Roboto, or any custom font — system stack only

## Always
- 0.5px borders on cards (not 1px)
- Left-align list content, right-align scores and numbers
- Sticky top nav at 52px
- Hover state on every clickable element
- More whitespace when in doubt

---

## The Standard
Every screen should feel like Apple's enterprise design team built it
for a high-performance real estate operation.
Clean. Fast. Trustworthy. Zero decoration.
When in doubt — remove one more thing.
