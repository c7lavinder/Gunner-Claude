import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing, Clock, User, RefreshCw, CheckCircle, AlertTriangle, Lightbulb, TrendingUp, FileText, MessageSquare, ThumbsUp, ThumbsDown, MessageCircle, Quote } from "lucide-react";
import { Link, useParams } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { Zap } from "lucide-react";
import { useDemo } from "@/hooks/useDemo";
// Badge confetti removed - badges are now awarded at grading time, not view time

const FEEDBACK_TYPES = [
  { value: "score_too_high", label: "Score is too high" },
  { value: "score_too_low", label: "Score is too low" },
  { value: "wrong_criteria", label: "Wrong criteria applied" },
  { value: "missed_issue", label: "Missed an issue" },
  { value: "incorrect_feedback", label: "Incorrect feedback given" },
  { value: "general_correction", label: "General correction" },
  { value: "praise", label: "AI did great!" },
];

function GradeBadge({ grade, size = "default" }: { grade: string; size?: "default" | "large" }) {
  const gradeClass = `grade-${grade.toLowerCase()}`;
  const sizeClass = size === "large" ? "grade-badge-lg" : "";
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
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [reclassifyDialogOpen, setReclassifyDialogOpen] = useState(false);
  const { isDemo, guardAction: guardDemoAction } = useDemo();
  const [selectedClassification, setSelectedClassification] = useState("");
  const [feedbackForm, setFeedbackForm] = useState({
    feedbackType: "general_correction",
    criteriaName: "",
    suggestedGrade: "",
    explanation: "",
    correctBehavior: "",
  });

  const { data: call, isLoading: callLoading } = trpc.calls.getById.useQuery(
    { id: callId },
    { enabled: callId > 0 }
  );
  
  const { data: grade, isLoading: gradeLoading } = trpc.calls.getGrade.useQuery(
    { callId },
    { enabled: callId > 0 }
  );

  const { data: existingFeedback } = trpc.feedback.list.useQuery(
    { callId, limit: 10 },
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

  const feedbackMutation = trpc.feedback.create.useMutation({
    onSuccess: () => {
      toast.success("Feedback submitted successfully");
      setFeedbackDialogOpen(false);
      setFeedbackForm({
        feedbackType: "general_correction",
        criteriaName: "",
        suggestedGrade: "",
        explanation: "",
        correctBehavior: "",
      });
    },
    onError: (error) => {
      toast.error(`Failed to submit feedback: ${error.message}`);
    },
  });

  const utils = trpc.useUtils();

  // XP processing for gamification (badges are awarded automatically at grading time)
  const processedRef = useRef(false);
  const processRewardsMutation = trpc.gamification.processCallView.useMutation({
    onSuccess: (data) => {
      if (data && data.xpEarned > 0) {
        toast.success(
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            <span>+{data.xpEarned} XP earned!</span>
          </div>
        );
      }
    },
  });

  // Process rewards when viewing a graded call for the first time
  useEffect(() => {
    if (grade && !processedRef.current && callId > 0) {
      processedRef.current = true;
      processRewardsMutation.mutate({ callId });
    }
  }, [grade, callId]);
  const reclassifyMutation = trpc.calls.reclassify.useMutation({
    onSuccess: (result) => {
      toast.success(`Call reclassified to ${result.classification.replace(/_/g, " ")}`);
      setReclassifyDialogOpen(false);
      setSelectedClassification("");
      utils.calls.getById.invalidate({ id: callId });
      utils.calls.withGrades.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to reclassify: ${error.message}`);
    },
  });

  const handleSubmitFeedback = () => {
    if (guardDemoAction("Submitting feedback")) return;
    if (!feedbackForm.explanation.trim()) {
      toast.error("Please provide an explanation");
      return;
    }

    feedbackMutation.mutate({
      callId,
      callGradeId: grade?.id,
      feedbackType: feedbackForm.feedbackType as any,
      criteriaName: feedbackForm.criteriaName || undefined,
      originalGrade: grade?.overallGrade as any,
      suggestedGrade: feedbackForm.suggestedGrade ? feedbackForm.suggestedGrade as any : undefined,
      explanation: feedbackForm.explanation,
      correctBehavior: feedbackForm.correctBehavior || undefined,
    });
  };

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
        <Button variant="outline" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Inbox
        </Button>
      </div>
    );
  }

  const criteriaScores = grade?.criteriaScores as any[] || [];
  const strengths = grade?.strengths as string[] || [];
  const improvements = grade?.improvements as string[] || [];
  const coachingTips = grade?.coachingTips as string[] || [];
  const redFlags = grade?.redFlags as string[] || [];
  const objectionHandling = grade?.objectionHandling as Array<{
    objection: string;
    context: string;
    suggestedResponses: string[];
  }> || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter">
            {call.contactName || call.contactPhone || "Unknown Contact"}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-0.5" style={{ color: 'var(--obs-text-tertiary)' }}>
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
        <div className="flex items-center gap-2">
          {call.status === "completed" && grade && (
            <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Give Feedback
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Provide Feedback on AI Grading</DialogTitle>
                  <DialogDescription>
                    Help improve the AI by letting us know what it got right or wrong.
                    Your feedback will be used to improve future grading.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Feedback Type</Label>
                    <Select
                      value={feedbackForm.feedbackType}
                      onValueChange={(value) => setFeedbackForm({ ...feedbackForm, feedbackType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FEEDBACK_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Current Grade</Label>
                      <div className="p-2 border rounded-lg text-center">
                        <GradeBadge grade={grade?.overallGrade || "?"} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Suggested Grade (optional)</Label>
                      <Select
                        value={feedbackForm.suggestedGrade}
                        onValueChange={(value) => setFeedbackForm({ ...feedbackForm, suggestedGrade: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select grade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                          <SelectItem value="D">D</SelectItem>
                          <SelectItem value="F">F</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Specific Criteria (optional)</Label>
                    <Select
                      value={feedbackForm.criteriaName}
                      onValueChange={(value) => setFeedbackForm({ ...feedbackForm, criteriaName: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select criteria" />
                      </SelectTrigger>
                      <SelectContent>
                        {criteriaScores.map((criteria) => (
                          <SelectItem key={criteria.name} value={criteria.name}>
                            {criteria.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Explanation *</Label>
                    <Textarea
                      placeholder="Describe what the AI got wrong or right..."
                      value={feedbackForm.explanation}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, explanation: e.target.value })}
                      className="min-h-[100px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>What Should the AI Have Done? (optional)</Label>
                    <Textarea
                      placeholder="Describe the correct behavior or scoring..."
                      value={feedbackForm.correctBehavior}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, correctBehavior: e.target.value })}
                      className="min-h-[80px]"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSubmitFeedback}
                    disabled={feedbackMutation.isPending}
                  >
                    {feedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {call.status === "failed" && (
            <Button 
              variant="outline"
              onClick={() => { if (!guardDemoAction("Reprocessing")) reprocessMutation.mutate({ callId }); }}
              disabled={reprocessMutation.isPending || isDemo}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${reprocessMutation.isPending ? "animate-spin" : ""}`} />
              Retry
            </Button>
          )}
          {/* Reclassify Dialog - hidden in demo */}
          {!isDemo && (
          <Dialog open={reclassifyDialogOpen} onOpenChange={setReclassifyDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                Reclassify
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Reclassify Call</DialogTitle>
                <DialogDescription>
                  Change the classification of this call. "Conversation" triggers full grading. "Admin Call" auto-grades with the admin rubric. Other options skip grading.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Current Classification</Label>
                  <div className="p-2 border rounded-lg">
                    <Badge variant="outline" className="capitalize">
                      {call.classification?.replace(/_/g, " ") || "Unknown"}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>New Classification</Label>
                  <Select
                    value={selectedClassification}
                    onValueChange={setSelectedClassification}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select classification" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conversation">Conversation (will be graded)</SelectItem>
                      <SelectItem value="admin_call">Admin Call (auto-graded)</SelectItem>
                      <SelectItem value="voicemail">Voicemail (skipped)</SelectItem>
                      <SelectItem value="no_answer">No Answer (skipped)</SelectItem>
                      <SelectItem value="callback_request">Callback Request (skipped)</SelectItem>
                      <SelectItem value="wrong_number">Wrong Number (skipped)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReclassifyDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    if (!selectedClassification) {
                      toast.error("Please select a classification");
                      return;
                    }
                    reclassifyMutation.mutate({
                      callId,
                      classification: selectedClassification as any,
                    });
                  }}
                  disabled={reclassifyMutation.isPending || !selectedClassification}
                >
                  {reclassifyMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {/* Existing Feedback Notice */}
      {existingFeedback && existingFeedback.length > 0 && (
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="flex items-center gap-4 py-4">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                You've submitted {existingFeedback.length} feedback item(s) for this call
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {existingFeedback.filter(f => f.status === "incorporated").length} incorporated, 
                {" "}{existingFeedback.filter(f => f.status === "pending").length} pending review
              </p>
            </div>
            <Link href="/feedback">
              <Button variant="outline" size="sm">
                View All Feedback
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      {call.status !== "completed" ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            {call.status === "skipped" ? (
              <>
                <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Call Skipped</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  This call was classified as non-gradable: <span className="font-medium capitalize">{call.classification?.replace(/_/g, " ")}</span>
                </p>
                {call.classificationReason && (
                  <p className="text-sm text-muted-foreground mt-2 text-center max-w-md">
                    {call.classificationReason}
                  </p>
                )}
              </>
            ) : (
              <>
                <RefreshCw className="h-12 w-12 text-muted-foreground/50 mb-4 animate-spin" />
                <h3 className="text-lg font-semibold mb-2">Processing Call</h3>
                <p className="text-muted-foreground text-center">
                  Status: <span className="font-medium capitalize">{call.status}</span>
                </p>
                {call.status === "failed" && (
                  <Button 
                    className="mt-4"
                    onClick={() => { if (!guardDemoAction("Reprocessing")) reprocessMutation.mutate({ callId }); }}
                    disabled={reprocessMutation.isPending || isDemo}
                  >
                    Retry Processing
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Grade Overview */}
          <div className="space-y-6">
            <div className="obs-panel">
              <h3 className="obs-section-title text-center mb-4">Overall Grade</h3>
              <div className="flex flex-col items-center">
                <GradeBadge grade={grade?.overallGrade || "?"} size="large" />
                <p className="text-3xl font-extrabold mt-3 tracking-tight">
                  {grade?.overallScore ? `${Math.round(parseFloat(grade.overallScore))}%` : "N/A"}
                </p>
                <div className="flex flex-wrap gap-2 mt-2 justify-center">
                  {call.callDirection === "inbound" ? (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                      <PhoneIncoming className="h-3 w-3 mr-1" />
                      Inbound
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                      <PhoneOutgoing className="h-3 w-3 mr-1" />
                      Outbound
                    </Badge>
                  )}
                  <Badge variant="secondary" className={`capitalize ${
                    call.callType === 'cold_call' ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200' :
                    call.callType === 'qualification' ? 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200' :
                    call.callType === 'follow_up' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' :
                    call.callType === 'offer' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' :
                    call.callType === 'seller_callback' ? 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200' :
                    call.callType === 'admin_callback' ? 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200' : ''
                  }`}>
                    {call.callType === 'cold_call' ? 'Cold Call' :
                     call.callType === 'qualification' ? 'Qualification' :
                     call.callType === 'follow_up' ? 'Follow-Up' :
                     call.callType === 'offer' ? 'Offer' :
                     call.callType === 'seller_callback' ? 'Admin' :
                     call.callType === 'admin_callback' ? 'Admin' :
                     String(call.callType || '').replace(/_/g, ' ') || 'Unknown'}
                  </Badge>
                  {(call as any).callOutcome && (call as any).callOutcome !== 'pending' && (
                    <Badge variant="outline" className="capitalize">
                      {{
                        appointment_set: 'Appointment Set',
                        offer_made: 'Offer Made',
                        callback_scheduled: 'Callback Scheduled',
                        callback_requested: 'Callback Requested',
                        interested: 'Interested',
                        left_vm: 'Left Voicemail',
                        left_voicemail: 'Left Voicemail',
                        no_answer: 'No Answer',
                        not_interested: 'Not Interested',
                        dead: 'Dead Lead',
                        wrong_number: 'Wrong Number',
                        do_not_call: 'Do Not Call',
                        follow_up: 'Follow Up',
                        offer_accepted: 'Offer Accepted',
                        offer_rejected: 'Offer Rejected',
                      }[(call as any).callOutcome as string] || (call as any).callOutcome?.replace(/_/g, ' ')}
                    </Badge>
                  )}
                  {call.propertyAddress && (
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800">
                      {call.propertyAddress}
                    </Badge>
                  )}
                  {(call as any).callTypeSource === 'ai_detected' && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      AI-detected type
                    </Badge>
                  )}
                </div>
              </div>
            </div>

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
              <TabsList>
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

                {/* Objection Handling - Potential Replies */}
                {objectionHandling.length > 0 && (
                  <Card className="border-purple-200 dark:border-purple-900">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-purple-600 dark:text-purple-400">
                        <MessageCircle className="h-4 w-4" />
                        Potential Replies to Objections
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Objections identified in this call with suggested responses
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {objectionHandling.map((item, i) => (
                        <div key={i} className="border rounded-lg overflow-hidden">
                          {/* Objection Header */}
                          <div className="bg-purple-50 dark:bg-purple-950 px-4 py-3 border-b">
                            <div className="font-medium text-purple-700 dark:text-purple-300">
                              {item.objection}
                            </div>
                          </div>
                          
                          {/* Context Quote */}
                          <div className="px-4 py-3 bg-muted/30 border-b">
                            <div className="flex gap-2">
                              <Quote className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              <p className="text-sm italic text-muted-foreground">
                                {item.context}
                              </p>
                            </div>
                          </div>
                          
                          {/* Suggested Responses */}
                          <div className="px-4 py-3">
                            <p className="text-xs font-medium text-muted-foreground mb-2">SUGGESTED RESPONSES:</p>
                            <ul className="space-y-2">
                              {item.suggestedResponses.map((response, j) => (
                                <li key={j} className="text-sm p-3 bg-purple-50 dark:bg-purple-950/50 rounded-lg border-l-2 border-purple-400">
                                  "{response}"
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
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
