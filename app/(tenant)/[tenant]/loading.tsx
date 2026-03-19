// app/(tenant)/[tenant]/loading.tsx
// Shown during page navigation within the tenant shell

export default function TenantLoading() {
  return (
    <div className="space-y-6 max-w-7xl animate-pulse">
      {/* Page title skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 bg-white/10 rounded-lg" />
        <div className="h-4 w-72 bg-white/5 rounded-lg" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-white/10" />
            <div className="h-8 w-16 bg-white/10 rounded-lg" />
            <div className="h-3 w-24 bg-white/5 rounded" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#1a1d27] border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="h-4 w-32 bg-white/10 rounded" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-full bg-white/10 rounded" />
                <div className="h-3 w-2/3 bg-white/5 rounded" />
              </div>
            </div>
          ))}
        </div>

        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="h-4 w-28 bg-white/10 rounded" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <div className="w-4 h-4 rounded bg-white/10 shrink-0" />
              <div className="flex-1 h-3 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
