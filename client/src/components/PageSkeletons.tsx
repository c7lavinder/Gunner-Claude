import { Skeleton } from "@/components/ui/skeleton";

/* ═══════════════════════════════════════════════════════
   SHIMMER CARD — Reusable skeleton card with shimmer effect
   ═══════════════════════════════════════════════════════ */
function ShimmerCard({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{
        background: "var(--g-bg-card)",
        border: "1px solid var(--g-border-subtle)",
        ...style,
      }}
    >
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-4 w-28 rounded" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD SKELETON — Full dashboard loading state
   ═══════════════════════════════════════════════════════ */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 g-stagger">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-4 w-40 rounded" />
        </div>
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ShimmerCard key={i} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div
            className="rounded-2xl p-6"
            style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)", minHeight: 360 }}
          >
            <div className="flex items-center gap-2 mb-6">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-32 rounded" />
            </div>
            <div className="flex items-end gap-3" style={{ height: 240 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="flex-1 rounded-lg"
                  style={{ height: `${25 + Math.random() * 65}%` }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div
            className="rounded-2xl p-6"
            style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)", minHeight: 360 }}
          >
            <div className="flex items-center gap-2 mb-5">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <Skeleton className="w-9 h-9 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-28 rounded" />
                    <Skeleton className="h-3 w-20 rounded" />
                  </div>
                  <Skeleton className="h-6 w-12 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div
        className="rounded-2xl p-6"
        style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-28 rounded" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <Skeleton className="w-7 h-7 rounded-lg" />
              <Skeleton className="h-4 flex-1 rounded" />
              <Skeleton className="h-3 w-12 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Call table */}
      <div
        className="rounded-2xl p-6"
        style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
      >
        <div className="flex items-center gap-2 mb-5">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>
        <div className="space-y-0">
          {/* Header */}
          <div className="flex gap-4 py-3" style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16 rounded" />
            ))}
          </div>
          {/* Rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 py-3.5" style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton key={j} className="h-5 w-16 rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CALL DETAIL SKELETON — Call detail page loading state
   ═══════════════════════════════════════════════════════ */
export function CallDetailSkeleton() {
  return (
    <div className="space-y-6 g-stagger">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-4 w-48 rounded" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4">
          {/* Grade card */}
          <div
            className="rounded-2xl p-6 flex flex-col items-center gap-4"
            style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
          >
            <Skeleton className="w-20 h-20 rounded-2xl" />
            <Skeleton className="h-6 w-16 rounded" />
            <Skeleton className="h-4 w-32 rounded" />
          </div>
          {/* Audio player placeholder */}
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
          >
            <div className="flex gap-1 items-center justify-center" style={{ height: 56 }}>
              {Array.from({ length: 30 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="rounded-full"
                  style={{ width: 2, height: 8 + Math.random() * 36 }}
                />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: "1px solid var(--g-border-subtle)" }}>
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
          </div>
          {/* Call info */}
          <div
            className="rounded-2xl p-5 space-y-3"
            style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-4 w-28 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-lg" />
            ))}
          </div>
          {/* Content */}
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)", minHeight: 400 }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-3/4 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   LEADERBOARD SKELETON — Team leaderboard loading state
   ═══════════════════════════════════════════════════════ */
export function LeaderboardSkeleton() {
  return (
    <div className="space-y-6 g-stagger">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-64 rounded" />
        </div>
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>

      {/* Podium */}
      <div className="flex items-end justify-center gap-4 py-8">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="w-16 h-16 rounded-xl" />
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-6 w-12 rounded" />
          <div className="rounded-xl" style={{ width: 100, background: "var(--g-bg-inset)" }}>
            <Skeleton className="w-full rounded-xl" style={{ height: 80 }} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="w-20 h-20 rounded-xl" />
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-6 w-14 rounded" />
          <div className="rounded-xl" style={{ width: 120, background: "var(--g-bg-inset)" }}>
            <Skeleton className="w-full rounded-xl" style={{ height: 110 }} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="w-16 h-16 rounded-xl" />
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-6 w-12 rounded" />
          <div className="rounded-xl" style={{ width: 100, background: "var(--g-bg-inset)" }}>
            <Skeleton className="w-full rounded-xl" style={{ height: 60 }} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl p-6"
        style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
      >
        <div className="space-y-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-4"
              style={{ borderBottom: "1px solid var(--g-border-subtle)" }}
            >
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
              <Skeleton className="h-7 w-20 rounded-lg" />
              <Skeleton className="h-4 w-12 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CALL INBOX SKELETON — Call list loading state
   ═══════════════════════════════════════════════════════ */
export function CallInboxSkeleton() {
  return (
    <div className="space-y-6 g-stagger">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-4 w-56 rounded" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>

      {/* Call cards */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl p-5"
            style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
          >
            <div className="flex items-start gap-4">
              <Skeleton className="w-11 h-11 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-36 rounded" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="flex gap-4">
                  <Skeleton className="h-3 w-16 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-2/3 rounded" />
              </div>
              <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ANALYTICS SKELETON — Analytics page loading state
   ═══════════════════════════════════════════════════════ */
export function AnalyticsSkeleton() {
  return (
    <div className="space-y-6 g-stagger">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-4 w-56 rounded" />
        </div>
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerCard key={i} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl p-6"
            style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)", minHeight: 300 }}
          >
            <Skeleton className="h-4 w-32 rounded mb-6" />
            <div className="flex items-end gap-2" style={{ height: 200 }}>
              {Array.from({ length: 12 }).map((_, j) => (
                <Skeleton
                  key={j}
                  className="flex-1 rounded-lg"
                  style={{ height: `${20 + Math.random() * 70}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
