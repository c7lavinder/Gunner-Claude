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
  PhoneIncoming,
  PhoneOutgoing,
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
  Loader2,
  Upload,
  FileAudio,
  Cloud,
  CloudOff,
  Filter,
  ChevronDown,
  X
} from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
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
import { formatDistanceToNow } from "date-fns";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

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
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-sm sm:text-base truncate">
                  {call.contactName || call.contactPhone || "Unknown Contact"}
                </h3>
                {/* Hide direction badge on mobile */}
                {call.callDirection === "inbound" ? (
                  <Badge variant="outline" className="hidden sm:flex text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                    <PhoneIncoming className="h-3 w-3 mr-1" />
                    Inbound
                  </Badge>
                ) : (
                  <Badge variant="outline" className="hidden sm:flex text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                    <PhoneOutgoing className="h-3 w-3 mr-1" />
                    Outbound
                  </Badge>
                )}
                {call.callType === "offer" ? (
                  <Badge variant="secondary" className="text-[10px] sm:text-xs">Offer</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] sm:text-xs">Qualification</Badge>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
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
                <span className="hidden sm:flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {timeAgo}
                </span>
                <span className="sm:hidden text-[10px]">{timeAgo}</span>
              </div>

              {call.propertyAddress && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate hidden sm:block">
                  {call.propertyAddress}
                </p>
              )}
            </div>

            <div className="flex flex-col items-end gap-1 sm:gap-2 shrink-0">
              {call.status === "completed" && grade ? (
                <>
                  <GradeBadge grade={grade.overallGrade || "?"} />
                  <span className="text-xs sm:text-sm font-medium">
                    {grade.overallScore ? `${Math.round(parseFloat(grade.overallScore))}%` : ""}
                  </span>
                </>
              ) : (
                <StatusBadge status={call.status} />
              )}
            </div>
          </div>

          {grade?.summary && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-2 sm:mt-3 line-clamp-2 border-t pt-2 sm:pt-3">
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

  const clearConversation = () => {
    setConversation([]);
  };

  return (
    <Card className="h-[500px] flex flex-col border-2">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            AI Coach
          </CardTitle>
          {conversation.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearConversation} className="h-7 text-xs">
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 p-3 pt-0">
        <ScrollArea className="flex-1">
          {conversation.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                Ask for coaching tips
              </p>
              <div className="flex flex-col gap-2 w-full max-w-[220px]">
                {[
                  "How do I handle price objections?",
                  "Best way to set the anchor?",
                  "Tips for building rapport quickly",
                  "How to close for commitment?"
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuestion(prompt);
                      setConversation([{ role: "user", content: prompt }]);
                      setIsAsking(true);
                      askCoachMutation.mutate({ question: prompt });
                    }}
                    className="text-xs text-left px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {conversation.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-1">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                  )}
                  <div className={`rounded-xl px-3 py-2 ${
                    msg.role === "user" 
                      ? "bg-primary text-primary-foreground max-w-[80%]" 
                      : "bg-muted/60 flex-1"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert">
                        <Streamdown>{msg.content}</Streamdown>
                      </div>
                    ) : (
                      <p className="text-sm">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isAsking && (
                <div className="flex justify-start">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-2">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <div className="bg-muted/60 rounded-xl px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <Textarea
            placeholder="Ask a question..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[44px] max-h-[80px] resize-none text-sm"
            disabled={isAsking}
          />
          <Button 
            onClick={handleAsk} 
            disabled={!question.trim() || isAsking}
            size="sm"
            className="self-end h-[44px] w-[44px] p-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Manual Upload Dialog Component
function ManualUploadDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [teamMemberId, setTeamMemberId] = useState<string>("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const { data: teamMembers } = trpc.team.list.useQuery();
  const uploadMutation = trpc.calls.uploadManual.useMutation({
    onSuccess: () => {
      toast.success("Call uploaded successfully! Processing will begin shortly.");
      setOpen(false);
      resetForm();
      onSuccess();
    },
    onError: (error) => {
      toast.error("Failed to upload call: " + error.message);
      setIsUploading(false);
    },
  });

  const resetForm = () => {
    setAudioFile(null);
    setTeamMemberId("");
    setContactName("");
    setContactPhone("");
    setPropertyAddress("");
    setIsUploading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/webm", "audio/ogg"];
    const validExtensions = [".mp3", ".wav", ".m4a", ".webm", ".ogg"];
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      toast.error("Please upload an audio file (MP3, WAV, M4A, WebM, or OGG)");
      return;
    }

    if (file.size > 16 * 1024 * 1024) {
      toast.error("File size must be less than 16MB");
      return;
    }

    setAudioFile(file);
  };

  const handleSubmit = async () => {
    if (!audioFile) {
      toast.error("Please select an audio file");
      return;
    }
    if (!teamMemberId) {
      toast.error("Please select a team member");
      return;
    }

    setIsUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMutation.mutate({
          audioData: base64,
          audioType: audioFile.type || "audio/mpeg",
          fileName: audioFile.name,
          teamMemberId: parseInt(teamMemberId),
          contactName: contactName || undefined,
          contactPhone: contactPhone || undefined,
          propertyAddress: propertyAddress || undefined,
        });
      };
      reader.onerror = () => {
        toast.error("Failed to read audio file");
        setIsUploading(false);
      };
      reader.readAsDataURL(audioFile);
    } catch (error) {
      toast.error("Failed to process audio file");
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Upload Call
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Call Recording</DialogTitle>
          <DialogDescription>
            Upload a call recording to transcribe and grade. Supports MP3, WAV, M4A, WebM, and OGG files.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Audio File Upload */}
          <div className="space-y-2">
            <Label>Audio File *</Label>
            <div className="border-2 border-dashed rounded-lg p-4 hover:border-primary/50 transition-colors">
              {audioFile ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileAudio className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium">{audioFile.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setAudioFile(null)}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Click to upload audio file</span>
                  <span className="text-xs text-muted-foreground mt-1">Max 16MB</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".mp3,.wav,.m4a,.webm,.ogg,audio/*"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Team Member Selection */}
          <div className="space-y-2">
            <Label>Team Member *</Label>
            <Select value={teamMemberId} onValueChange={setTeamMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers?.map((member) => (
                  <SelectItem key={member.id} value={member.id.toString()}>
                    {member.name} ({member.teamRole === "acquisition_manager" ? "Acquisition" : "Lead Manager"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input
                placeholder="John Smith"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                placeholder="(555) 123-4567"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Property Address</Label>
            <Input
              placeholder="123 Main St, Nashville, TN"
              value={propertyAddress}
              onChange={(e) => setPropertyAddress(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isUploading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isUploading || !audioFile || !teamMemberId}>
            {isUploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" />Upload & Process</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// GHL Sync Status Component
function GHLSyncStatus({ onSyncComplete }: { onSyncComplete: () => void }) {
  const { data: status, refetch: refetchStatus } = trpc.ghlSync.status.useQuery();
  const syncNowMutation = trpc.ghlSync.syncNow.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Synced ${result.synced} calls from GoHighLevel`);
        onSyncComplete();
      } else {
        toast.error("Sync failed: " + result.errors.join(", "));
      }
      refetchStatus();
    },
    onError: (error) => {
      toast.error("Sync failed: " + error.message);
    },
  });

  const lastSyncText = status?.lastPollTime 
    ? formatDistanceToNow(new Date(status.lastPollTime), { addSuffix: true })
    : null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => syncNowMutation.mutate()}
      disabled={syncNowMutation.isPending || status?.isPolling}
      title={lastSyncText ? `Last synced ${lastSyncText}` : undefined}
    >
      {syncNowMutation.isPending || status?.isPolling ? (
        <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Syncing...</>
      ) : (
        <><Cloud className="h-4 w-4 mr-2" />Sync from GHL{lastSyncText && <span className="ml-1 text-muted-foreground font-normal">({lastSyncText})</span>}</>
      )}
    </Button>
  );
}

// Multi-select filter component
function MultiSelectFilter({ 
  label, 
  options, 
  selected, 
  onChange,
  icon: Icon
}: { 
  label: string; 
  options: { value: string; label: string }[]; 
  selected: string[]; 
  onChange: (values: string[]) => void;
  icon?: React.ElementType;
}) {
  const [open, setOpen] = useState(false);
  
  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const clearAll = () => {
    onChange([]);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          {Icon && <Icon className="h-3.5 w-3.5 mr-2" />}
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-2 rounded-sm px-1 font-normal">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 ml-2 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-2">
          {options.map((option) => (
            <div
              key={option.value}
              className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
              onClick={() => toggleOption(option.value)}
            >
              <Checkbox
                checked={selected.includes(option.value)}
                onCheckedChange={() => toggleOption(option.value)}
              />
              <span className="text-sm">{option.label}</span>
            </div>
          ))}
          {selected.length > 0 && (
            <div className="border-t pt-2 mt-2">
              <Button variant="ghost" size="sm" className="w-full justify-center" onClick={clearAll}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function CallInbox() {
  const [activeTab, setActiveTab] = useState("calls");
  const { data: calls, isLoading, refetch, isRefetching } = trpc.calls.withGrades.useQuery({ limit: 50 });
  const { data: allFeedback, isLoading: feedbackLoading } = trpc.feedback.list.useQuery({ limit: 100 });
  const updateStatusMutation = trpc.feedback.updateStatus.useMutation();
  const reclassifyMutation = trpc.calls.reclassify.useMutation({
    onSuccess: () => {
      toast.success("Call reclassified - grading will begin shortly");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to reclassify: ${error.message}`);
    },
  });
  const utils = trpc.useUtils();

  // Filter states
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);
  const [selectedCallTypes, setSelectedCallTypes] = useState<string[]>([]);
  const [selectedScoreRanges, setSelectedScoreRanges] = useState<string[]>([]);
  const [selectedDirections, setSelectedDirections] = useState<string[]>([]);

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

  // Get unique team members from calls for filter options
  const teamMemberOptions = useMemo(() => {
    const members = new Set<string>();
    calls?.forEach(c => {
      if (c.teamMemberName) members.add(c.teamMemberName);
    });
    return Array.from(members).sort().map(name => ({ value: name, label: name }));
  }, [calls]);

  // Call type options
  const callTypeOptions = [
    { value: "qualification", label: "Qualification" },
    { value: "offer", label: "Offer Call" },
  ];

  // Score range options
  const scoreRangeOptions = [
    { value: "high", label: "High (80%+)" },
    { value: "medium", label: "Medium (60-79%)" },
    { value: "low", label: "Low (Below 60%)" },
  ];

  // Call direction options
  const directionOptions = [
    { value: "inbound", label: "Inbound" },
    { value: "outbound", label: "Outbound" },
  ];

  // Separate graded calls from skipped/admin/failed/pending calls
  const allGradedCalls = calls?.filter(c => c.status === "completed" && c.classification === "conversation") || [];
  const adminCalls = calls?.filter(c => c.classification === "admin_call") || [];
  const failedCalls = calls?.filter(c => c.status === "failed") || [];
  const pendingCalls = calls?.filter(c => c.status === "pending" || c.status === "transcribing" || c.status === "grading") || [];
  const skippedCalls = calls?.filter(c => 
    (c.status === "skipped" || (c.classification && c.classification !== "conversation" && c.classification !== "pending" && c.classification !== "admin_call")) && c.status !== "failed"
  ) || [];

  // Apply filters to graded calls
  const gradedCalls = useMemo(() => {
    let filtered = allGradedCalls;

    // Filter by team member
    if (selectedTeamMembers.length > 0) {
      filtered = filtered.filter(c => c.teamMemberName && selectedTeamMembers.includes(c.teamMemberName));
    }

    // Filter by call type
    if (selectedCallTypes.length > 0) {
      filtered = filtered.filter(c => c.callType && selectedCallTypes.includes(c.callType));
    }

    // Filter by score range
    if (selectedScoreRanges.length > 0) {
      filtered = filtered.filter(c => {
        const score = parseFloat(c.grade?.overallScore || "0");
        return selectedScoreRanges.some(range => {
          if (range === "high") return score >= 80;
          if (range === "medium") return score >= 60 && score < 80;
          if (range === "low") return score < 60;
          return false;
        });
      });
    }

    // Filter by call direction
    if (selectedDirections.length > 0) {
      filtered = filtered.filter(c => c.callDirection && selectedDirections.includes(c.callDirection));
    }

    return filtered;
  }, [allGradedCalls, selectedTeamMembers, selectedCallTypes, selectedScoreRanges, selectedDirections]);

  // Check if any filters are active
  const hasActiveFilters = selectedTeamMembers.length > 0 || selectedCallTypes.length > 0 || 
    selectedScoreRanges.length > 0 || selectedDirections.length > 0;

  const clearAllFilters = () => {
    setSelectedTeamMembers([]);
    setSelectedCallTypes([]);
    setSelectedScoreRanges([]);
    setSelectedDirections([]);
  };

  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Call History</h1>
          <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">
            Review calls, provide feedback, and get coaching advice
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <GHLSyncStatus onSyncComplete={handleRefresh} />
          <ManualUploadDialog onSuccess={handleRefresh} />
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
            disabled={isRefetching}
            className="h-8 sm:h-9"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline ml-2">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Main Content - Calls and Feedback */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Mobile: Horizontal scroll tabs */}
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabsList className="mb-4 w-max sm:w-auto">
                <TabsTrigger value="pending" className="text-xs sm:text-sm px-2 sm:px-3">
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Pending </span>({pendingCalls.length})
                </TabsTrigger>
                <TabsTrigger value="calls" className="text-xs sm:text-sm px-2 sm:px-3">
                  <Phone className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Graded </span>({gradedCalls.length})
                </TabsTrigger>
                <TabsTrigger value="admin" className="text-xs sm:text-sm px-2 sm:px-3">
                  N/A ({adminCalls.length})
                </TabsTrigger>
                <TabsTrigger value="skipped" className="text-xs sm:text-sm px-2 sm:px-3">
                  <span className="hidden sm:inline">Skipped </span>Skip ({skippedCalls.length})
                </TabsTrigger>
                <TabsTrigger value="failed" className="text-xs sm:text-sm px-2 sm:px-3">
                  <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  ({failedCalls.length})
                </TabsTrigger>
                <TabsTrigger value="feedback" className="text-xs sm:text-sm px-2 sm:px-3">
                  <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  ({pendingFeedback.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Filters - shown only on calls tab */}
            {activeTab === "calls" && (
              <div className="mb-4">
                {/* Mobile: Collapsible filter button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="sm:hidden w-full justify-between mb-2"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <span className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Filters {hasActiveFilters && `(${selectedTeamMembers.length + selectedCallTypes.length + selectedScoreRanges.length + selectedDirections.length})`}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </Button>
                
                {/* Filter content - always visible on desktop, collapsible on mobile */}
                <div className={`${showFilters ? 'block' : 'hidden'} sm:block`}>
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border">
                    <div className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground mr-2">
                      <Filter className="h-4 w-4" />
                      <span>Filters:</span>
                    </div>
                    <MultiSelectFilter
                      label="Team Member"
                      options={teamMemberOptions}
                      selected={selectedTeamMembers}
                      onChange={setSelectedTeamMembers}
                      icon={User}
                    />
                    <MultiSelectFilter
                      label="Call Type"
                      options={callTypeOptions}
                      selected={selectedCallTypes}
                      onChange={setSelectedCallTypes}
                      icon={Phone}
                    />
                    <MultiSelectFilter
                      label="Score"
                      options={scoreRangeOptions}
                      selected={selectedScoreRanges}
                      onChange={setSelectedScoreRanges}
                    />
                    <MultiSelectFilter
                      label="Direction"
                      options={directionOptions}
                      selected={selectedDirections}
                      onChange={setSelectedDirections}
                    />
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-muted-foreground hover:text-foreground"
                        onClick={clearAllFilters}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Clear all
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <TabsContent value="pending" className="space-y-4">
              {pendingCalls.length > 0 ? (
                <div className="space-y-4">
                  {pendingCalls.map((item) => (
                    <Card key={item.id} className="border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold truncate">
                                {item.contactName || item.contactPhone || "Unknown Contact"}
                              </h3>
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                {item.status === "pending" ? "Queued" : item.status === "transcribing" ? "Transcribing" : "Grading"}
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
                              {item.createdAt && (
                                <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <CheckCircle className="h-16 w-16 text-green-500/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No calls in queue</h3>
                    <p className="text-muted-foreground text-center max-w-md">
                      All calls have been processed. New calls will appear here when they're being transcribed or graded.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

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

            <TabsContent value="admin" className="space-y-4">
              {adminCalls.length > 0 ? (
                <div className="space-y-4">
                  {adminCalls.map((item) => (
                    <Link key={item.id} href={`/calls/${item.id}`}>
                      <Card className="card-hover cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold truncate">
                                  {item.contactName || item.contactPhone || "Unknown Contact"}
                                </h3>
                                <Badge variant="secondary" className="text-xs bg-gray-200 text-gray-700">
                                  N/A
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
                                {item.createdAt && (
                                  <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                                )}
                              </div>
                              {item.classificationReason && (
                                <p className="text-sm text-muted-foreground mt-2 italic">
                                  {item.classificationReason}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <CheckCircle className="h-16 w-16 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No administrative calls</h3>
                    <p className="text-muted-foreground text-center max-w-md">
                      Administrative calls (scheduling, follow-ups, etc.) that don't require grading will appear here.
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
                          <div className="flex items-center gap-2">
                            <StatusBadge status="skipped" />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                reclassifyMutation.mutate({ 
                                  callId: item.id, 
                                  classification: "conversation",
                                  reason: "Manually reclassified for grading"
                                });
                              }}
                              disabled={reclassifyMutation.isPending}
                            >
                              {reclassifyMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                              <span className="ml-1">Grade This Call</span>
                            </Button>
                          </div>
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

            <TabsContent value="failed" className="space-y-4">
              {failedCalls.length > 0 ? (
                <div className="space-y-4">
                  {failedCalls.map((item) => (
                    <Card key={item.id} className="border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold truncate">
                                {item.contactName || item.contactPhone || "Unknown Contact"}
                              </h3>
                              <Badge variant="destructive" className="text-xs">
                                <XCircle className="h-3 w-3 mr-1" />
                                Failed
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
                              {item.createdAt && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                                </span>
                              )}
                            </div>
                            {item.classificationReason && (
                              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                                <AlertTriangle className="h-3 w-3 inline mr-1" />
                                {item.classificationReason}
                              </p>
                            )}
                          </div>
                          <Link href={`/calls/${item.id}`}>
                            <Button variant="outline" size="sm">
                              View Details
                              <ArrowRight className="h-4 w-4 ml-1" />
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <CheckCircle className="h-16 w-16 text-green-500/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No failed calls</h3>
                    <p className="text-muted-foreground text-center max-w-md">
                      All calls have been processed successfully. Failed transcriptions or grading attempts will appear here.
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
