import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: countData } = trpc.notifications.getUnreadCount.useQuery(undefined, {
    refetchInterval: 60_000, // poll every minute
  });
  const { data: recent } = trpc.notifications.getRecent.useQuery(
    { limit: 10 },
    { enabled: open }
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.notifications.getUnreadCount.invalidate();
      void utils.notifications.getRecent.invalidate();
    },
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      void utils.notifications.getUnreadCount.invalidate();
      void utils.notifications.getRecent.invalidate();
    },
  });

  const unreadCount = countData?.count ?? 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-lg" aria-label="Notifications">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-0 text-xs text-[var(--g-accent-text)]"
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-80">
          {!recent?.length ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--g-text-tertiary)]">No notifications</p>
          ) : (
            recent.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={`flex flex-col items-start gap-0.5 px-3 py-2.5 cursor-pointer ${n.isRead === "false" ? "bg-[var(--g-accent-soft)]" : ""}`}
                onClick={() => {
                  if (n.isRead === "false") markRead.mutate({ id: n.id });
                }}
              >
                <span className="font-medium text-sm">{n.title}</span>
                {n.body && <span className="text-xs text-[var(--g-text-tertiary)] line-clamp-2">{n.body}</span>}
                <span className="text-[10px] text-[var(--g-text-tertiary)] mt-0.5">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
