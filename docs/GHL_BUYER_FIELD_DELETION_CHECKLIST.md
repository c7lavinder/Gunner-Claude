# GHL Buyer Custom Field Deletion Checklist

> Session 78 — Gunner is now the source of truth for buyer-info fields.
> GHL keeps only contact info (name, phone, email, address, tags, source).
> This doc walks through deleting the GHL custom fields safely.

## Before you delete anything

1. **Run the backfill** — guarantees every existing Buyer row has the canonical
   keys filled from GHL one last time:

   ```
   npx tsx scripts/backfill-buyer-fields.ts --dry-run
   ```

   If the dry-run summary looks reasonable, run for real:

   ```
   npx tsx scripts/backfill-buyer-fields.ts
   ```

2. **Spot-check ~5 buyers in Gunner** — pull up `/buyers/<id>` and confirm
   the hero card shows tier, funding, markets, buybox, last contact date.
   If any are missing, do not proceed — fix the backfill first.

3. **Verify the sync no longer overwrites** — see [lib/buyers/sync.ts][1].
   `syncBuyerFromGHL` now updates only `name / phone / email / ghlContactId`
   on existing rows. If you don't see that, do not proceed.

[1]: ../lib/buyers/sync.ts

## Field IDs

These are the eight GHL custom fields Gunner used to read from. After you
confirm the steps above, you can delete them in **GHL Settings → Custom
Fields**.

| Field ID                 | GHL label              | Replaced by (Gunner)                        |
|--------------------------|------------------------|---------------------------------------------|
| `Y4ton500NvCkJKtb4YzP`   | Buyer Tier             | `Buyer.customFields.tier`                   |
| `ghOapC4jq1iSzmCzv5up`   | Markets                | `Buyer.primaryMarkets`                      |
| `VcdWDP2lXuuV1LwedOhs`   | Buybox                 | `Buyer.customFields.buybox`                 |
| `RbNnV6OxCiF6ai2krkyy`   | Response Speed         | `Buyer.customFields.responseSpeed`          |
| `IZdG26j5rw0yiU1jvDEo`   | Verified Funding       | `Buyer.customFields.verifiedFunding`        |
| `FRyMcgqWes9BuWqo97HF`   | Last Contact Date      | Auto-derived (latest Call.calledAt or OutreachLog.loggedAt) |
| `4qyjtjm5DWVgFgMCHdqQ`   | Notes                  | `Buyer.internalNotes`                       |
| `DOGXpCgOc2jMoWwY4dpc`   | Secondary Market       | **Retired (Session 78b)** — folded into `Buyer.primaryMarkets` by the backfill. |

Notes:

- **Secondary Market** is gone as a concept. The backfill script folds
  any existing `secondaryMarkets[]` values into `primaryMarkets` (case-
  insensitive dedupe) and drops the key from `customFields`. After the
  backfill runs cleanly, you can delete the GHL field with no data loss.
- **Last Contact Date** is now computed live from the latest call or
  outreach log for the buyer's GHL contact id. The stored value is kept
  as a manual override if the rep edits it explicitly.
- **`hasPurchased`** never existed in GHL — Gunner tracks "Purchased
  Before" in `customFields.hasPurchased`, set in the edit slideover.
  Nothing to delete in GHL for that one.

## Order of operations

Delete in this order to keep the read path safe:

1. **Buyer Tier** — Gunner reads from `customFields.tier`; tag-based
   `tier:*` fallback still works.
2. **Markets** — already on `Buyer.primaryMarkets`.
3. **Buybox** — already on `customFields.buybox`.
4. **Response Speed**, **Verified Funding**, **Last Contact Date**,
   **Secondary Market** — independent, delete in any order.
5. **Notes** — last. Gunner stores its own `internalNotes`; the GHL Notes
   field is purely a one-way historical reference now.

After each delete, click around `/buyers` and a deal's Section 3 in
Gunner. Anything broken should fail loud (empty pill, missing tag) — not
silent data loss.

## If you need to roll back

The constants are still in code:

- [lib/buyers/sync.ts][1] — `GHL_FIELD_MAP`
- [app/api/properties/\[propertyId\]/buyers/route.ts](../app/api/properties/[propertyId]/buyers/route.ts) — `GHL_FIELD_MAP`

Re-creating the GHL fields with the same IDs would restore the original
read path. The sync still runs on every webhook; it just won't write to
`customFields` on existing buyers. If you want it to overwrite again,
revert [lib/buyers/sync.ts][1] to the pre-Session-78 shape.
