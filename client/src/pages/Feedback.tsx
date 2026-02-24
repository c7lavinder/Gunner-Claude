import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MessageSquare, 
  CheckCircle, 
  Clock, 
  XCircle,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  ArrowRight,
  Phone
} from "lucide-react";
import { Link } from "wouter";

const FEEDBACK_TYPES = {
  score_too_high: { label: "Score Too High", icon: ThumbsDown, color: "text-red-500" },
  score_too_low: { label: "Score Too Low", icon: ThumbsUp, color: "text-green-500" },
  wrong_criteria: { label: "Wrong Criteria", icon: AlertTriangle, color: "text-yellow-500" },
  missed_issue: { label: "Missed Issue", icon: XCircle, color: "text-orange-500" },
  incorrect_feedback: { label: "Incorrect Feedback", icon: MessageSquare, color: "text-purple-500" },
  general_correction: { label: "General Correction", icon: MessageSquare, color: "text-blue-500" },
  praise: { label: "Praise", icon: ThumbsUp, color: "text-green-500" },
};

const STATUS_BADGES = {
  pending: { label: "Pending Review", variant: "secondary" as const, icon: Clock },
  reviewed: { label: "Reviewed", variant: "outline" as const, icon: CheckCircle },
  incorporated: { label: "Incorporated", variant: "default" as const, icon: CheckCircle },
  dismissed: { label: "Dismissed", variant: "destructive" as const, icon: XCircle },
};

export default function Feedback() {
  const { data: allFeedback, isLoading } = trpc.feedback.list.useQuery({ limit: 100 });
  const updateStatusMutation = trpc.feedback.updateStatus.useMutation();
  const utils = trpc.useUtils();

  const handleStatusChange = async (id: number, status: "reviewed" | "incorporated" | "dismissed") => {
    await updateStatusMutation.mutateAsync({ id, status });
    utils.feedback.list.invalidate();
  };

  const pendingFeedback = allFeedback?.filter(f => f.status === "pending") || [];
  const reviewedFeedback = allFeedback?.filter(f => f.status === "reviewed") || [];
  const incorporatedFeedback = allFeedback?.filter(f => f.status === "incorporated") || [];
  const dismissedFeedback = allFeedback?.filter(f => f.status === "dismissed") || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tighter">AI Feedback</h1>
        <p className="text-muted-foreground">
          Review and manage feedback on AI grading to improve future scoring
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-2xl">{pendingFeedback.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Reviewed</CardDescription>
            <CardTitle className="text-2xl">{reviewedFeedback.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Incorporated</CardDescription>
            <CardTitle className="text-2xl">{incorporatedFeedback.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Dismissed</CardDescription>
            <CardTitle className="text-2xl">{dismissedFeedback.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : allFeedback?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Feedback Yet</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              When you provide feedback on call grades, it will appear here.
              Go to any call detail page to submit feedback on the AI's grading.
            </p>
            <Link href="/calls">
              <Button>
                <Phone className="h-4 w-4 mr-2" />
                View Calls
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">
              Pending ({pendingFeedback.length})
            </TabsTrigger>
            <TabsTrigger value="reviewed">
              Reviewed ({reviewedFeedback.length})
            </TabsTrigger>
            <TabsTrigger value="incorporated">
              Incorporated ({incorporatedFeedback.length})
            </TabsTrigger>
            <TabsTrigger value="dismissed">
              Dismissed ({dismissedFeedback.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {pendingFeedback.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No pending feedback to review
                </CardContent>
              </Card>
            ) : (
              pendingFeedback.map((feedback) => (
                <FeedbackCard
                  key={feedback.id}
                  feedback={feedback}
                  onStatusChange={handleStatusChange}
                  showActions
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="reviewed" className="space-y-4">
            {reviewedFeedback.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No reviewed feedback
                </CardContent>
              </Card>
            ) : (
              reviewedFeedback.map((feedback) => (
                <FeedbackCard
                  key={feedback.id}
                  feedback={feedback}
                  onStatusChange={handleStatusChange}
                  showActions
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="incorporated" className="space-y-4">
            {incorporatedFeedback.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No incorporated feedback yet
                </CardContent>
              </Card>
            ) : (
              incorporatedFeedback.map((feedback) => (
                <FeedbackCard key={feedback.id} feedback={feedback} />
              ))
            )}
          </TabsContent>

          <TabsContent value="dismissed" className="space-y-4">
            {dismissedFeedback.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No dismissed feedback
                </CardContent>
              </Card>
            ) : (
              dismissedFeedback.map((feedback) => (
                <FeedbackCard key={feedback.id} feedback={feedback} />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function FeedbackCard({ 
  feedback, 
  onStatusChange,
  showActions = false
}: { 
  feedback: any;
  onStatusChange?: (id: number, status: "reviewed" | "incorporated" | "dismissed") => void;
  showActions?: boolean;
}) {
  const feedbackType = FEEDBACK_TYPES[feedback.feedbackType as keyof typeof FEEDBACK_TYPES] || FEEDBACK_TYPES.general_correction;
  const statusInfo = STATUS_BADGES[feedback.status as keyof typeof STATUS_BADGES] || STATUS_BADGES.pending;
  const Icon = feedbackType.icon;
  const StatusIcon = statusInfo.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-muted ${feedbackType.color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {feedbackType.label}
                <Badge variant={statusInfo.variant}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusInfo.label}
                </Badge>
              </CardTitle>
              <CardDescription>
                {feedback.criteriaName && `Criteria: ${feedback.criteriaName} • `}
                {new Date(feedback.createdAt).toLocaleString()}
              </CardDescription>
            </div>
          </div>
          {feedback.callId && (
            <Link href={`/calls/${feedback.callId}`}>
              <Button variant="ghost" size="sm">
                View Call
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score change if applicable */}
        {(feedback.originalScore || feedback.suggestedScore) && (
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            {feedback.originalScore && (
              <div>
                <p className="text-xs text-muted-foreground">Original Score</p>
                <p className="text-lg font-bold">{feedback.originalScore}%</p>
              </div>
            )}
            {feedback.originalScore && feedback.suggestedScore && (
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            )}
            {feedback.suggestedScore && (
              <div>
                <p className="text-xs text-muted-foreground">Suggested Score</p>
                <p className="text-lg font-bold text-primary">{feedback.suggestedScore}%</p>
              </div>
            )}
            {feedback.originalGrade && (
              <div className="ml-auto">
                <p className="text-xs text-muted-foreground">Grade Change</p>
                <p className="text-lg font-bold">
                  {feedback.originalGrade}
                  {feedback.suggestedGrade && ` → ${feedback.suggestedGrade}`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Explanation */}
        <div>
          <p className="text-sm font-medium mb-1">Explanation</p>
          <p className="text-sm text-muted-foreground">{feedback.explanation}</p>
        </div>

        {/* Correct behavior */}
        {feedback.correctBehavior && (
          <div>
            <p className="text-sm font-medium mb-1">What the AI Should Have Done</p>
            <p className="text-sm text-muted-foreground">{feedback.correctBehavior}</p>
          </div>
        )}

        {/* Actions */}
        {showActions && onStatusChange && (
          <div className="flex items-center gap-2 pt-2 border-t">
            {feedback.status === "pending" && (
              <>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => onStatusChange(feedback.id, "reviewed")}
                >
                  Mark as Reviewed
                </Button>
                <Button 
                  size="sm"
                  onClick={() => onStatusChange(feedback.id, "incorporated")}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Incorporate
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => onStatusChange(feedback.id, "dismissed")}
                >
                  Dismiss
                </Button>
              </>
            )}
            {feedback.status === "reviewed" && (
              <>
                <Button 
                  size="sm"
                  onClick={() => onStatusChange(feedback.id, "incorporated")}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Incorporate
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => onStatusChange(feedback.id, "dismissed")}
                >
                  Dismiss
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
