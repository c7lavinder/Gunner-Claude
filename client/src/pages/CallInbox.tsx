import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Phone, Clock, User, RefreshCw, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

function GradeBadge({ grade }: { grade: string }) {
  const gradeClass = `grade-${grade.toLowerCase()}`;
  return <span className={`grade-badge ${gradeClass}`}>{grade}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    transcribing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    grading: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${variants[status] || variants.pending}`}>
      {status}
    </span>
  );
}

function CallCard({ call, grade }: { call: any; grade: any }) {
  const timeAgo = call.createdAt ? formatDistanceToNow(new Date(call.createdAt), { addSuffix: true }) : "Unknown";
  
  return (
    <Link href={`/calls/${call.id}`}>
      <Card className="card-hover cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold truncate">
                  {call.contactName || call.contactPhone || "Unknown Contact"}
                </h3>
                {call.callType === "offer" ? (
                  <Badge variant="secondary" className="text-xs">Offer</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Qualification</Badge>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {call.teamMemberName && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {call.teamMemberName}
                  </span>
                )}
                {call.duration && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {Math.floor(call.duration / 60)}:{(call.duration % 60).toString().padStart(2, "0")}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {timeAgo}
                </span>
              </div>

              {call.propertyAddress && (
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  {call.propertyAddress}
                </p>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              {call.status === "completed" && grade ? (
                <>
                  <GradeBadge grade={grade.overallGrade || "?"} />
                  <span className="text-sm font-medium">
                    {grade.overallScore ? `${Math.round(parseFloat(grade.overallScore))}%` : ""}
                  </span>
                </>
              ) : (
                <StatusBadge status={call.status} />
              )}
            </div>
          </div>

          {grade?.summary && (
            <p className="text-sm text-muted-foreground mt-3 line-clamp-2 border-t pt-3">
              {grade.summary}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function CallInbox() {
  const { data: calls, isLoading, refetch, isRefetching } = trpc.calls.withGrades.useQuery({ limit: 50 });
  const utils = trpc.useUtils();

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Call Inbox</h1>
          <p className="text-muted-foreground mt-1">
            Review and analyze your team's calls
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleRefresh}
          disabled={isRefetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : calls && calls.length > 0 ? (
        <div className="space-y-4">
          {calls.map((item) => (
            <CallCard key={item.id} call={item} grade={item.grade} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Phone className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No calls yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Calls will appear here once they're received via the GoHighLevel webhook. 
              Make sure your webhook is configured correctly.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
