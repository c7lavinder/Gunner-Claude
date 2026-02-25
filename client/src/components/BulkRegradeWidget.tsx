import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle } from "lucide-react";

export function BulkRegradeWidget() {
  const [filter, setFilter] = useState<"callback_only" | "all_completed">("callback_only");
  const [daysBack, setDaysBack] = useState(30);

  const bulkRegrade = (trpc as any).bulkRegrade.useMutation({
    onSuccess: (data: any) => {
      toast.success(`${data.queued} calls queued for re-grading (${data.filter === "callback_only" ? "Callback-only" : "All completed"}, last ${data.daysBack} days). Runs in background.`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Re-grade failed");
    },
  });

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px 24px',
      marginTop: 16,
      background: 'var(--card)',
    }}>
      <h4 style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
        Bulk Re-Grade Calls
      </h4>
      <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 16 }}>
        Re-grade past calls using the latest rubric and outcome classification rules.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 4 }}>
            Filter
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: 13,
            }}
          >
            <option value="callback_only">Callback-only outcomes</option>
            <option value="all_completed">All completed calls</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 4 }}>
            Days back
          </label>
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: 13,
            }}
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>

        <Button
          size="sm"
          onClick={() => bulkRegrade.mutate({ filter, daysBack })}
          disabled={bulkRegrade.isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${bulkRegrade.isPending ? 'animate-spin' : ''}`} />
          {bulkRegrade.isPending ? "Starting..." : "Start Re-Grade"}
        </Button>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: 'var(--muted-foreground)',
        padding: '8px 10px',
        background: 'rgba(234, 179, 8, 0.08)',
        borderRadius: 6,
        border: '1px solid rgba(234, 179, 8, 0.2)',
      }}>
        <AlertTriangle className="h-3.5 w-3.5" style={{ color: 'rgb(234, 179, 8)', flexShrink: 0 }} />
        Each re-graded call uses AI credits. Max 200 calls per batch. Runs in background.
      </div>
    </div>
  );
}
