import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [feedbackTab, setFeedbackTab] = useState("pending");
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
        <div className="obs-panel">
          <div className="pb-2" style={{marginBottom: 16}}>
            <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>Pending</p>
            <h3 className="obs-section-title text-2xl">{pendingFeedback.length}</h3>
          </div>
        </div>
        <div className="obs-panel">
          <div className="pb-2" style={{marginBottom: 16}}>
            <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>Reviewed</p>
            <h3 className="obs-section-title text-2xl">{reviewedFeedback.length}</h3>
          </div>
        </div>
        <div className="obs-panel">
          <div className="pb-2" style={{marginBottom: 16}}>
            <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>Incorporated</p>
            <h3 className="obs-section-title text-2xl">{incorporatedFeedback.length}</h3>
          </div>
        </div>
        <div className="obs-panel">
          <div className="pb-2" style={{marginBottom: 16}}>
            <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>Dismissed</p>
            <h3 className="obs-section-title text-2xl">{dismissedFeedback.length}</h3>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div className="obs-panel" key={i}>
              <div style={{marginBottom: 16}}>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : allFeedback?.length === 0 ? (
        <div className="obs-panel">
          <div className="flex flex-col items-center justify-center py-12">
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
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="obs-role-tabs">
            <button className={`obs-role-tab ${feedbackTab === "pending" ? "active" : ""}`} onClick={() => setFeedbackTab("pending")}>
              Pending ({pendingFeedback.length})
            </button>
            <button className={`obs-role-tab ${feedbackTab === "reviewed" ? "active" : ""}`} onClick={() => setFeedbackTab("reviewed")}>
              Reviewed ({reviewedFeedback.length})
            </button>
            <button className={`obs-role-tab ${feedbackTab === "incorporated" ? "active" : ""}`} onClick={() => setFeedbackTab("incorporated")}>
              Incorporated ({incorporatedFeedback.length})
            </button>
            <button className={`obs-role-tab ${feedbackTab === "dismissed" ? "active" : ""}`} onClick={() => setFeedbackTab("dismissed")}>
              Dismissed ({dismissedFeedback.length})
            </button>
          </div>

          {feedbackTab === "pending" && (<div key="pending" className="space-y-4 obs-fade-in">
            {pendingFeedback.length === 0 ? (
              <div className="obs-panel">
                <div className="py-8 text-center text-muted-foreground">
                  No pending feedback to review
                </div>
              </div>
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
          </div>)}

          {feedbackTab === "reviewed" && (<div key="reviewed" className="space-y-4 obs-fade-in">
            {reviewedFeedback.length === 0 ? (
              <div className="obs-panel">
                <div className="py-8 text-center text-muted-foreground">
                  No reviewed feedback
                </div>
              </div>
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
          </div>)}

          {feedbackTab === "incorporated" && (<div key="incorporated" className="space-y-4 obs-fade-in">
            {incorporatedFeedback.length === 0 ? (
              <div className="obs-panel">
                <div className="py-8 text-center text-muted-foreground">
                  No incorporated feedback yet
                </div>
              </div>
            ) : (
              incorporatedFeedback.map((feedback) => (
                <FeedbackCard key={feedback.id} feedback={feedback} />
              ))
            )}
          </div>)}

          {feedbackTab === "dismissed" && (<div key="dismissed" className="space-y-4 obs-fade-in">
            {dismissedFeedback.length === 0 ? (
              <div className="obs-panel">
                <div className="py-8 text-center text-muted-foreground">
                  No dismissed feedback
                </div>
              </div>
            ) : (
              dismissedFeedback.map((feedback) => (
                <FeedbackCard key={feedback.id} feedback={feedback} />
              ))
            )}
          </div>)}
        </div>
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
    <div className="obs-panel">
      <div className="pb-3" style={{marginBottom: 16}}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-muted ${feedbackType.color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="obs-section-title text-base flex items-center gap-2">
                {feedbackType.label}
                <Badge variant={statusInfo.variant}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusInfo.label}
                </Badge>
              </h3>
              <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>
                {feedback.criteriaName && `Criteria: ${feedback.criteriaName} • `}
                {new Date(feedback.createdAt).toLocaleString()}
              </p>
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
      </div>
      <div className="space-y-4">
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
      </div>
    </div>
  );
}
