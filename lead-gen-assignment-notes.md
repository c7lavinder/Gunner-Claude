# Lead Generator Assignment Data Model

The `team_assignments` table is reused for BOTH:
1. Lead Manager → Acquisition Manager assignments (original purpose)
2. Lead Generator → Lead Manager assignments (reused with different semantics)

For Lead Generator assignments:
- `leadManagerId` = the Lead Generator's team member ID
- `acquisitionManagerId` = the Lead Manager's team member ID

To find Lead Generators assigned to a Lead Manager:
```sql
SELECT leadManagerId as leadGeneratorId 
FROM team_assignments 
WHERE acquisitionManagerId = <lead_manager_team_member_id>
  AND leadManagerId IN (SELECT id FROM team_members WHERE teamRole = 'lead_generator')
```

The filter in TenantSettings.tsx at line 1011 confirms: `lgUser?.teamRole !== 'lead_generator'` is used to distinguish LG assignments from AM assignments in the same table.
