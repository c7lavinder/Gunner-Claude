import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Phone, 
  Clock, 
  User, 
  RefreshCw, 
  MessageSquare,
  CheckCircle,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  ArrowRight,
  Send,
  Bot,
  Sparkles,
  Loader2
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

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
    skipped: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
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

// Feedback Types
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
  pending: { label: "Pending", variant: "secondary" as const, icon: Clock },
  reviewed: { label: "Reviewed", variant: "outline" as const, icon: CheckCircle },
  incorporated: { label: "Incorporated", variant: "default" as const, icon: CheckCircle },
  dismissed: { label: "Dismissed", variant: "destructive" as const, icon: XCircle },
};

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
        {(feedback.originalScore || feedback.suggestedScore) && (
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            {feedback.originalScore && (
              <div>
                <p className="text-xs text-muted-foreground">Original</p>
                <p className="text-lg font-bold">{feedback.originalScore}%</p>
              </div>
            )}
            {feedback.originalScore && feedback.suggestedScore && (
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            )}
            {feedback.suggestedScore && (
              <div>
                <p className="text-xs text-muted-foreground">Suggested</p>
                <p className="text-lg font-bold text-primary">{feedback.suggestedScore}%</p>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="text-sm font-medium mb-1">Explanation</p>
          <p className="text-sm text-muted-foreground">{feedback.explanation}</p>
        </div>

        {feedback.correctBehavior && (
          <div>
            <p className="text-sm font-medium mb-1">Correct Behavior</p>
            <p className="text-sm text-muted-foreground">{feedback.correctBehavior}</p>
          </div>
        )}

        {showActions && onStatusChange && (
          <div className="flex items-center gap-2 pt-2 border-t">
            {feedback.status === "pending" && (
              <>
                <Button size="sm" variant="outline" onClick={() => onStatusChange(feedback.id, "reviewed")}>
                  Mark Reviewed
                </Button>
                <Button size="sm" onClick={() => onStatusChange(feedback.id, "incorporated")}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Incorporate
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onStatusChange(feedback.id, "dismissed")}>
                  Dismiss
                </Button>
              </>
            )}
            {feedback.status === "reviewed" && (
              <>
                <Button size="sm" onClick={() => onStatusChange(feedback.id, "incorporated")}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Incorporate
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onStatusChange(feedback.id, "dismissed")}>
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

// AI Coach Q&A Component
function AICoachQA() {
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [conversation, setConversation] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  
  const askCoachMutation = trpc.coach.askQuestion.useMutation({
    onSuccess: (response) => {
      setConversation(prev => [...prev, { role: "assistant", content: response.answer }]);
      setIsAsking(false);
    },
    onError: (error) => {
      toast.error("Failed to get answer: " + error.message);
      setIsAsking(false);
    },
  });

  const handleAsk = () => {
    if (!question.trim()) return;
    
    setConversation(prev => [...prev, { role: "user", content: question }]);
    setIsAsking(true);
    askCoachMutation.mutate({ question });
    setQuestion("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          AI Sales Coach
        </CardTitle>
        <CardDescription>
          Ask questions about objections, techniques, or get coaching advice
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1 pr-4">
          {conversation.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <Sparkles className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-medium mb-2">Ask Your AI Coach</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Get coaching advice based on your training materials and past successful calls.
              </p>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p className="italic">"How should I handle the 'I need to think about it' objection?"</p>
                <p className="italic">"What's the best way to anchor price?"</p>
                <p className="italic">"Show me examples of good motivation extraction"</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {conversation.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg p-3 ${
                    msg.role === "user" 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted"
                  }`}>
                    {msg.role === "assistant" ? (
                      <Streamdown>{msg.content}</Streamdown>
                    ) : (
                      <p className="text-sm">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isAsking && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg p-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        
        <div className="flex gap-2 mt-4 pt-4 border-t">
          <Textarea
            placeholder="Ask about objections, techniques, or get coaching advice..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[60px] resize-none"
            disabled={isAsking}
          />
          <Button 
            onClick={handleAsk} 
            disabled={!question.trim() || isAsking}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CallInbox() {
  const [activeTab, setActiveTab] = useState("calls");
  const { data: calls, isLoading, refetch, isRefetching } = trpc.calls.withGrades.useQuery({ limit: 50 });
  const { data: allFeedback, isLoading: feedbackLoading } = trpc.feedback.list.useQuery({ limit: 100 });
  const updateStatusMutation = trpc.feedback.updateStatus.useMutation();
  const utils = trpc.useUtils();

  const handleRefresh = () => {
    refetch();
    utils.feedback.list.invalidate();
  };

  const handleStatusChange = async (id: number, status: "reviewed" | "incorporated" | "dismissed") => {
    await updateStatusMutation.mutateAsync({ id, status });
    utils.feedback.list.invalidate();
  };

  const pendingFeedback = allFeedback?.filter(f => f.status === "pending") || [];
  const processedFeedback = allFeedback?.filter(f => f.status !== "pending") || [];

  // Separate graded calls from skipped calls
  const gradedCalls = calls?.filter(c => c.status === "completed" && c.classification === "conversation") || [];
  const skippedCalls = calls?.filter(c => c.status === "skipped" || (c.classification && c.classification !== "conversation" && c.classification !== "pending")) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Call History</h1>
          <p className="text-muted-foreground mt-1">
            Review calls, provide feedback, and get coaching advice
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content - Calls and Feedback */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="calls">
                <Phone className="h-4 w-4 mr-2" />
                Graded Calls ({gradedCalls.length})
              </TabsTrigger>
              <TabsTrigger value="skipped">
                Skipped ({skippedCalls.length})
              </TabsTrigger>
              <TabsTrigger value="feedback">
                <MessageSquare className="h-4 w-4 mr-2" />
                Feedback ({pendingFeedback.length} pending)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calls" className="space-y-4">
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
              ) : gradedCalls.length > 0 ? (
                <div className="space-y-4">
                  {gradedCalls.map((item) => (
                    <CallCard key={item.id} call={item} grade={item.grade} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <Phone className="h-16 w-16 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No graded calls yet</h3>
                    <p className="text-muted-foreground text-center max-w-md">
                      Calls will appear here once they're received and graded via the GoHighLevel webhook.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="skipped" className="space-y-4">
              {skippedCalls.length > 0 ? (
                <div className="space-y-4">
                  {skippedCalls.map((item) => (
                    <Card key={item.id} className="opacity-75">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold truncate">
                                {item.contactName || item.contactPhone || "Unknown Contact"}
                              </h3>
                              <Badge variant="outline" className="text-xs capitalize">
                                {item.classification?.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                              {item.teamMemberName && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {item.teamMemberName}
                                </span>
                              )}
                              {item.duration && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, "0")}
                                </span>
                              )}
                            </div>
                            {item.classificationReason && (
                              <p className="text-sm text-muted-foreground mt-2 italic">
                                {item.classificationReason}
                              </p>
                            )}
                          </div>
                          <StatusBadge status="skipped" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <CheckCircle className="h-16 w-16 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No skipped calls</h3>
                    <p className="text-muted-foreground text-center max-w-md">
                      Voicemails, no-answers, and brief callbacks will appear here.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="feedback" className="space-y-4">
              {feedbackLoading ? (
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
                    <p className="text-muted-foreground text-center max-w-md">
                      When you provide feedback on call grades, it will appear here.
                      Click on any call to view details and submit feedback.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Tabs defaultValue="pending" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="pending">Pending ({pendingFeedback.length})</TabsTrigger>
                    <TabsTrigger value="processed">Processed ({processedFeedback.length})</TabsTrigger>
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

                  <TabsContent value="processed" className="space-y-4">
                    {processedFeedback.length === 0 ? (
                      <Card>
                        <CardContent className="py-8 text-center text-muted-foreground">
                          No processed feedback yet
                        </CardContent>
                      </Card>
                    ) : (
                      processedFeedback.map((feedback) => (
                        <FeedbackCard key={feedback.id} feedback={feedback} />
                      ))
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* AI Coach Sidebar */}
        <div className="lg:col-span-1">
          <AICoachQA />
        </div>
      </div>
    </div>
  );
}
