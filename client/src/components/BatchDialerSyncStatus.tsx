import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Cloud, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

export function BatchDialerSyncStatus({ onSyncComplete }: { onSyncComplete?: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.teamRole === 'admin';

  const syncMutation = trpc.calls.syncBatchDialer.useMutation({
    onSuccess: (stats) => {
      if (stats.imported === 0 && stats.skipped === 0 && stats.errors === 0) {
        toast.info("No new calls found from BatchDialer");
      } else {
        toast.success(
          `BatchDialer sync complete! Imported: ${stats.imported}, Skipped: ${stats.skipped}${stats.errors > 0 ? `, Errors: ${stats.errors}` : ""}`
        );
      }
      onSyncComplete?.();
    },
    onError: (error) => {
      toast.error(`BatchDialer sync failed: ${error.message}`);
    },
  });

  const handleSync = () => {
    syncMutation.mutate();
  };

  // Only show for admin users
  if (!isAdmin) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={syncMutation.isPending}
      className="h-8 sm:h-9"
    >
      {syncMutation.isPending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          <span className="hidden sm:inline">Syncing...</span>
        </>
      ) : (
        <>
          <Cloud className="h-4 w-4" />
          <span className="hidden sm:inline ml-2">Sync BatchDialer</span>
        </>
      )}
    </Button>
  );
}
