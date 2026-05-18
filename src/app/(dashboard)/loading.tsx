export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Chart + KPIs row */}
      <div className="flex gap-6 items-start">
        <div className="flex-1 h-64 rounded-xl bg-muted" />
        <div className="w-52 shrink-0 space-y-4 pt-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="py-3 border-b last:border-0 space-y-1.5">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-7 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="h-6 w-32 rounded bg-muted" />
        <div className="h-8 w-20 rounded bg-muted" />
      </div>

      {/* Holdings tree + donut row */}
      <div className="flex gap-6 items-start">
        <div className="flex-1 rounded-xl border bg-card overflow-hidden">
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 rounded bg-muted" />
            ))}
          </div>
        </div>
        <div className="w-72 shrink-0 h-72 rounded-full bg-muted" />
      </div>
    </div>
  )
}
