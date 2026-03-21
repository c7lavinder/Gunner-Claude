// app/(tenant)/[tenant]/loading.tsx
// Skeleton shown during page navigation

export default function TenantLoading() {
  return (
    <div className="space-y-6 max-w-7xl animate-pulse">
      {/* Page title skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 bg-surface-tertiary rounded-[10px]" />
        <div className="h-4 w-72 bg-surface-secondary rounded-[10px]" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5 space-y-3">
            <div className="w-8 h-8 rounded-[10px] bg-surface-tertiary" />
            <div className="h-8 w-16 bg-surface-tertiary rounded-[10px]" />
            <div className="h-3 w-24 bg-surface-secondary rounded-[6px]" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5 space-y-3">
          <div className="h-4 w-32 bg-surface-tertiary rounded-[6px]" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="w-10 h-10 rounded-[10px] bg-surface-tertiary shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-full bg-surface-tertiary rounded-[6px]" />
                <div className="h-3 w-2/3 bg-surface-secondary rounded-[6px]" />
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5 space-y-3">
          <div className="h-4 w-28 bg-surface-tertiary rounded-[6px]" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <div className="w-4 h-4 rounded-[6px] bg-surface-tertiary shrink-0" />
              <div className="flex-1 h-3 bg-surface-tertiary rounded-[6px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
