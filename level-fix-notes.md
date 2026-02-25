# Level Title Mismatch Fix

## Issue
- Screenshot 1 (Detail Panel): Shows "LVL 4 PLAYMAKER 2,210 XP" — uses `title` from gamificationData (server-side)
- Screenshot 2 (Roster Card): Shows "4 LVL EPIC" — uses `getLevelTitle(level)` (client-side hardcoded)

## Root Cause
CharacterCard (roster card) at line 104 uses `getLevelTitle(level)` which maps levels to gaming terms (COMMON/UNCOMMON/RARE/EPIC/LEGENDARY).
CharacterDetailPanel at line 272/312 uses `title` from gamificationData which comes from the server's LEVEL_THRESHOLDS (Rookie/Starter/Playmaker/All-Star/etc.).

## Fix
Replace `getLevelTitle(level)` usage in CharacterCard with the `title` variable that already exists at line 94 (from gamificationData).
Line 202: change `{levelTitle}` to `{title}`.
Remove line 104 (`const levelTitle = getLevelTitle(level);`) and the entire getLevelTitle function (lines 36-43).
