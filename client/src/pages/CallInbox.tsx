import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageShell } from "@/components/layout/PageShell";
import { ActionConfirmDialog } from "@/components/actions/ActionConfirmDialog";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useCallInboxData } from "@/hooks/useCallInboxData";
import { CallFilters } from "@/components/callinbox/CallFilters";
import { CallCard } from "@/components/callinbox/CallCard";

export function CallInbox() {
  const { t, callTypes } = useTenantConfig();
  const resolveCallType = (code: string | null) =>
    callTypes.find((ct) => ct.code === code)?.name ?? code ?? "\u2014";

  const d = useCallInboxData();

  if (d.isError) {
    return (
      <PageShell title={t.callPlural ?? "Calls"}>
        <ErrorState onRetry={() => window.location.reload()} />
      </PageShell>
    );
  }

  return (
    <PageShell title={t.callPlural ?? "Calls"} actions={
      <CallFilters
          search={d.search}
          onSearchChange={d.setSearch}
          dateRange={d.dateRange}
          onDateRangeChange={d.setDateRange}
          gradeFilter={d.gradeFilter}
          onGradeFilterChange={d.setGradeFilter}
          callTypeFilter={d.callTypeFilter}
          onCallTypeFilterChange={d.setCallTypeFilter}
          callTypes={callTypes}
          contactLabel={t.contact}
        />
    }>

      <Tabs value={d.tab} onValueChange={(v) => { d.setTab(v); d.setCurrentPage(1); }}>
        <TabsList className="h-8">
          <TabsTrigger value="all" className="text-xs">All {d.stats ? `(${d.stats.total})` : ""}</TabsTrigger>
          <TabsTrigger value="needs-review" className="text-xs">Needs Review</TabsTrigger>
          <TabsTrigger value="graded" className="text-xs">Graded {d.stats ? `(${d.stats.graded})` : ""}</TabsTrigger>
          <TabsTrigger value="starred" className="text-xs">Starred</TabsTrigger>
        </TabsList>
        <TabsContent value={d.tab} className="mt-4">
          {d.isLoading ? (
            <div className="space-y-3 p-4 md:p-6">
              <Skeleton className="h-8 w-48" />
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : d.filtered.length === 0 ? (
            <EmptyState
              icon={Phone}
              title="No calls yet"
              description="Connect your CRM to start importing and grading calls automatically."
              actionLabel="Go to Settings"
              onAction={() => window.location.assign("/settings")}
            />
          ) : (
            <ScrollArea className="h-[calc(100vh-220px)]">
              <div className="space-y-2 pr-4">
                {d.filtered.map((call) => (
                  <CallCard
                    key={call.id}
                    call={call}
                    isExpanded={d.expandedId === call.id}
                    isStarred={d.starred.has(call.id)}
                    onToggleExpand={() => d.setExpandedId(d.expandedId === call.id ? null : call.id)}
                    onToggleStar={(e) => d.toggleStar(call.id, e)}
                    resolveCallType={resolveCallType}
                    grade={d.expandedId === call.id ? d.grade ?? null : null}
                    callDetail={d.expandedId === call.id && d.callDetail ? { recordingUrl: d.callDetail.recordingUrl, transcript: d.callDetail.transcript } : null}
                    transcriptOpen={d.transcriptOpenId === call.id}
                    onTranscriptToggle={(open) => d.setTranscriptOpenId(open ? call.id : null)}
                    onTaskAction={() => {
                      d.setActionTarget({ name: call.contactName ?? "Unknown", contactId: call.ghlContactId ?? String(call.id) });
                      d.setTaskDialogOpen(true);
                    }}
                    onNoteAction={() => {
                      d.setActionTarget({ name: call.contactName ?? "Unknown", contactId: call.ghlContactId ?? String(call.id) });
                      d.setNoteDialogOpen(true);
                    }}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
          {d.totalPages > 1 && !d.isLoading && d.filtered.length > 0 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={d.currentPage <= 1} onClick={() => d.setCurrentPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-[var(--g-text-secondary)]">
                Page {d.currentPage} of {d.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={d.currentPage >= d.totalPages} onClick={() => d.setCurrentPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {d.actionTarget && (
        <>
          <ActionConfirmDialog
            open={d.taskDialogOpen}
            onOpenChange={(o) => { d.setTaskDialogOpen(o); if (!o) { d.setActionTarget(null); d.reset(); } }}
            action={{ type: "task", from: { name: "You" }, to: { name: d.actionTarget.name }, payload: {} }}
            onConfirm={() => d.executeAction("task", d.actionTarget!.contactId, { title: `Follow up with ${d.actionTarget!.name}` })}
            isExecuting={d.isExecuting}
            result={d.result}
          />
          <ActionConfirmDialog
            open={d.noteDialogOpen}
            onOpenChange={(o) => { d.setNoteDialogOpen(o); if (!o) { d.setActionTarget(null); d.reset(); } }}
            action={{ type: "note", from: { name: "You" }, to: { name: d.actionTarget.name }, payload: {} }}
            onConfirm={() => d.executeAction("note", d.actionTarget!.contactId, { body: `Call review note for ${d.actionTarget!.name}` })}
            isExecuting={d.isExecuting}
            result={d.result}
          />
        </>
      )}
    </PageShell>
  );
}
