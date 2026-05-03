// app/(tenant)/[tenant]/tasks/page.tsx
// Legacy redirect — the canonical Day Hub now lives at /{tenant}/day-hub
// (consolidated 2026-05-03 in Session 66 per CLAUDE.md Rule 3 § 7).
// This stub exists to preserve any external bookmarks pointing at /tasks.
import { redirect } from 'next/navigation'

export default function TasksLegacyRedirect({ params }: { params: { tenant: string } }) {
  redirect(`/${params.tenant}/day-hub`)
}
