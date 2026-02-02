import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Phone, Clock, User, RefreshCw, CheckCircle, AlertTriangle, Lightbulb, TrendingUp, FileText } from "lucide-react";
import { Link, useParams } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

function GradeBadge({ grade, size = "default" }: { grade: string; size?: "default" | "large" }) {
  const gradeClass = `grade-${grade.toLowerCase()}`;
  const sizeClass = size === "large" ? "text-2xl px-4 py-2" : "";
  return <span className={`grade-badge ${gradeClass} ${sizeClass}`}>{grade}</span>;
}

function CriteriaCard({ criteria }: { criteria: any }) {
  const percentage = (criteria.score / criteria.maxPoints) * 100;
  
  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium">{criteria.name}</h4>
        <span className="text-sm font-bold">
          {criteria.score}/{criteria.maxPoints}
        </span>
      </div>
      <Progress value={percentage} className="h-2 mb-2" />
      <p className="text-sm text-muted-foreground">{criteria.feedback}</p>
    </div>
  );
}

export default function CallDetail() {
  const params = useParams<{ id: string }>();
  const callId = parseInt(params.id || "0", 10);

  const { data: call, isLoading: callLoading } = trpc.calls.getById.useQuery(
    { id: callId },
    { enabled: callId > 0 }
  );
  
  const { data: grade, isLoading: gradeLoading } = trpc.calls.getGrade.useQuery(
    { callId },
    { enabled: callId > 0 }
  );

  const reprocessMutation = trpc.calls.reprocess.useMutation({
    onSuccess: () => {
      toast.success("Call queued for reprocessing");
    },
    onError: (error) => {
      toast.error(`Failed to reprocess: ${error.message}`);
    },
  });

  const isLoading = callLoading || gradeLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Phone className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Call not found</h3>
        <Link href="/calls">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Inbox
          </Button>
        </Link>
      </div>
    );
  }

  const criteriaScores = grade?.criteriaScores as any[] || [];
  const strengths = grade?.strengths as string[] || [];
  const improvements = grade?.improvements as string[] || [];
  const coachingTips = grade?.coachingTips as string[] || [];
  const redFlags = grade?.redFlags as string[] || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/calls">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {call.contactName || call.contactPhone || "Unknown Contact"}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
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
            {call.createdAt && (
              <span>
                {format(new Date(call.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </span>
            )}
          </div>
        </div>
        {call.status === "failed" && (
          <Button 
            variant="outline"
            onClick={() => reprocessMutation.mutate({ callId })}
            disabled={reprocessMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${reprocessMutation.isPending ? "animate-spin" : ""}`} />
            Retry
          </Button>
        )}
      </div>

      {/* Main Content */}
      {call.status !== "completed" ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <RefreshCw className="h-12 w-12 text-muted-foreground/50 mb-4 animate-spin" />
            <h3 className="text-lg font-semibold mb-2">Processing Call</h3>
            <p className="text-muted-foreground text-center">
              Status: <span className="font-medium capitalize">{call.status}</span>
            </p>
            {call.status === "failed" && (
              <Button 
                className="mt-4"
                onClick={() => reprocessMutation.mutate({ callId })}
                disabled={reprocessMutation.isPending}
              >
                Retry Processing
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Grade Overview */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-sm text-muted-foreground">Overall Grade</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <GradeBadge grade={grade?.overallGrade || "?"} size="large" />
                <p className="text-3xl font-bold mt-4">
                  {grade?.overallScore ? `${Math.round(parseFloat(grade.overallScore))}%` : "N/A"}
                </p>
                <Badge variant="secondary" className="mt-2 capitalize">
                  {call.callType === "offer" ? "Offer Call" : "Qualification Call"}
                </Badge>
              </CardContent>
            </Card>

            {/* Strengths */}
            {strengths.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {strengths.map((strength, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">•</span>
                        {strength}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Red Flags */}
            {redFlags.length > 0 && (
              <Card className="border-red-200 dark:border-red-900">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    Red Flags
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {redFlags.map((flag, i) => (
                      <li key={i} className="text-sm flex items-start gap-2 text-red-600 dark:text-red-400">
                        <span className="mt-0.5">•</span>
                        {flag}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Details */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="coaching" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="coaching">Coaching</TabsTrigger>
                <TabsTrigger value="criteria">Criteria</TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
              </TabsList>

              <TabsContent value="coaching" className="space-y-4 mt-4">
                {/* Summary */}
                {grade?.summary && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{grade.summary}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Improvements */}
                {improvements.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-orange-500" />
                        Areas for Improvement
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {improvements.map((item, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <span className="text-orange-500 mt-0.5">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Coaching Tips */}
                {coachingTips.length > 0 && (
                  <Card className="border-blue-200 dark:border-blue-900">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-blue-600 dark:text-blue-400">
                        <Lightbulb className="h-4 w-4" />
                        Coaching Tips
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {coachingTips.map((tip, i) => (
                          <li key={i} className="text-sm p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="criteria" className="mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {criteriaScores.map((criteria, i) => (
                    <CriteriaCard key={i} criteria={criteria} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="transcript" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Call Transcript</CardTitle>
                    <CardDescription>
                      Full transcription of the call
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {call.transcript ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p className="whitespace-pre-wrap">{call.transcript}</p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">
                        No transcript available
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
