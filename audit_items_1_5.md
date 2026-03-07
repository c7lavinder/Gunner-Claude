# Audit: Items 1-5 Current State

## Item 1: KPI Boxes Clickable ✅ ALREADY DONE
- KPI boxes have onClick handlers (line 324-328)
- Opens Trust Ledger modal with contact name, address, time, team member
- Supports search, manual entries, delete
- Auto-detected items show grade badges

## Item 2: Role Views Show Only Personal Data — NEEDS FIX
- Current: Non-admin users get forced to their role tab (line 3846-3855)
- BUT: Role tabs are ONLY shown to admins (line 4117: `{isAdmin && (`)
- Non-admin users see "Your tasks & conversations" text but NO tab selector
- Backend scopes tasks to user's GHL ID for non-admins
- ISSUE: Spec says "Daniel (LM) should not see the AM or Dispo tab" — this is already the case since non-admins don't see tabs at all
- ISSUE: Spec says "role views show only personal data" — backend already scopes for non-admins
- The real issue is that admins switching to LM/AM/Dispo tabs see ALL team data for that role, not just one person
- Need to verify: KPI data, inbox, tasks all filter correctly per role tab

## Item 3: Dispo Inbox — Only Dispo-Relevant Messages — NEEDS WORK
- DispoLeftPanel exists (line 4172) for dispo tab
- Need to check if it filters to only inventory/buyer contacts

## Item 4: Inbox Shows Team Member — ✅ ALREADY DONE
- Line 1467-1478: `memberName` badge shows "{memberName}'s line"
- Uses phoneToMemberName mapping from team members' LC phones
- Shows as purple badge on right side of inbox item

## Item 5: Conversation Expander — NEEDS FIX
- Line 1328-1335: `scrollIntoView` causes page scroll (the exact bug!)
- Fix: Remove the scrollIntoView or change to scroll within parent ScrollArea only
- Max height is 240px (line 1514) — could be taller
- Messages load last 50 (line 1310) — spec wants at least 10 visible
