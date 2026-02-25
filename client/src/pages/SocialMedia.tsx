import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Building2, User, Plus, Sparkles, Calendar, FileText, 
  Facebook, Instagram, MapPin, Twitter, Linkedin, Trash2,
  Clock, Lightbulb, ChevronLeft, ChevronRight, Image as ImageIcon,
  Globe, Palette, Target, MessageSquare, Link as LinkIcon, Loader2
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";

type ContentMode = "brand" | "creator";

const platformIcons: Record<string, React.ReactNode> = {
  blog: <FileText className="h-4 w-4" />,
  meta_facebook: <Facebook className="h-4 w-4" />,
  meta_instagram: <Instagram className="h-4 w-4" />,
  google_business: <MapPin className="h-4 w-4" />,
  x_twitter: <Twitter className="h-4 w-4" />,
  linkedin: <Linkedin className="h-4 w-4" />,
};

const platformLabels: Record<string, string> = {
  blog: "Blog Post",
  meta_facebook: "Facebook",
  meta_instagram: "Instagram",
  google_business: "Google Business",
  x_twitter: "X (Twitter)",
  linkedin: "LinkedIn",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-800",
  published: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function SocialMedia() {
  const [contentMode, setContentMode] = useState<ContentMode>("brand");
  const [socialTab, setSocialTab] = useState("posts");
  const [activeTab, setActiveTab] = useState("posts");
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isCreateIdeaOpen, setIsCreateIdeaOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Form states
  const [newPost, setNewPost] = useState({
    platform: "" as string,
    title: "",
    content: "",
    hashtags: "",
    scheduledAt: "",
  });
  const [generateForm, setGenerateForm] = useState({
    platform: "" as string,
    contentType: "problem_solved" as string,
    style: "crazy_story" as string,
  });
  const [newIdea, setNewIdea] = useState<{
    title: string;
    description: string;
    category: string;
    targetPlatform: "x_twitter" | "blog" | "meta" | "any";
  }>({
    title: "",
    description: "",
    category: "",
    targetPlatform: "any",
  });

  // Queries
  const { data: posts, refetch: refetchPosts } = trpc.socialPosts.list.useQuery({
    contentType: contentMode,
  });
  const { data: ideas, refetch: refetchIdeas } = trpc.contentIdeas.list.useQuery({
    status: "new",
  });
  const { data: brandAssets, refetch: refetchAssets } = trpc.brandAssets.list.useQuery({});
  const { data: brandProfile, refetch: refetchBrandProfile } = trpc.brandProfile.get.useQuery();
  const { data: contentData } = trpc.contentGeneration.getData.useQuery();
  
  // Calendar posts
  const calendarStart = startOfMonth(calendarMonth);
  const calendarEnd = endOfMonth(calendarMonth);
  const { data: calendarPosts } = trpc.socialPosts.getCalendar.useQuery({
    startDate: calendarStart,
    endDate: calendarEnd,
  });

  // Mutations
  const createPost = trpc.socialPosts.create.useMutation({
    onSuccess: () => {
      toast.success("Post created successfully");
      setIsCreatePostOpen(false);
      setNewPost({ platform: "", title: "", content: "", hashtags: "", scheduledAt: "" });
      refetchPosts();
    },
    onError: (error) => toast.error(error.message),
  });

  const deletePost = trpc.socialPosts.delete.useMutation({
    onSuccess: () => {
      toast.success("Post deleted");
      refetchPosts();
    },
    onError: (error) => toast.error(error.message),
  });

  const generateBrandContent = trpc.contentGeneration.generateBrandContent.useMutation({
    onSuccess: (data) => {
      setNewPost({
        ...newPost,
        platform: generateForm.platform,
        title: data.title || "",
        content: data.content + "\n\n" + data.callToAction,
        hashtags: data.hashtags?.join(" ") || "",
      });
      setIsGenerateOpen(false);
      setIsCreatePostOpen(true);
      toast.success("Content generated from your call data! Review and edit before posting.");
    },
    onError: (error) => toast.error(error.message),
  });

  const generateCreatorContent = trpc.contentGeneration.generateCreatorContent.useMutation({
    onSuccess: (data) => {
      setNewPost({
        ...newPost,
        platform: "x_twitter",
        title: "",
        content: data.hook + "\n\n" + data.content,
        hashtags: data.hashtags?.join(" ") || "",
      });
      setIsGenerateOpen(false);
      setIsCreatePostOpen(true);
      toast.success("Content generated from your call stories! Review and edit before posting.");
    },
    onError: (error) => toast.error(error.message),
  });

  const createIdea = trpc.contentIdeas.create.useMutation({
    onSuccess: () => {
      toast.success("Idea saved");
      setIsCreateIdeaOpen(false);
      setNewIdea({ title: "", description: "", category: "", targetPlatform: "any" });
      refetchIdeas();
    },
    onError: (error) => toast.error(error.message),
  });

  const generateIdeas = trpc.contentIdeas.generateIdeas.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.ideas.length} new content ideas`);
      refetchIdeas();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteIdea = trpc.contentIdeas.delete.useMutation({
    onSuccess: () => {
      toast.success("Idea deleted");
      refetchIdeas();
    },
    onError: (error) => toast.error(error.message),
  });

  const createAsset = trpc.brandAssets.create.useMutation({
    onSuccess: () => {
      toast.success("Asset added");
      refetchAssets();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteAsset = trpc.brandAssets.delete.useMutation({
    onSuccess: () => {
      toast.success("Asset removed");
      refetchAssets();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateBrandProfile = trpc.brandProfile.update.useMutation({
    onSuccess: () => {
      toast.success("Brand profile updated");
      refetchBrandProfile();
    },
    onError: (error) => toast.error(error.message),
  });

  const extractFromWebsite = trpc.brandProfile.extractFromWebsite.useMutation({
    onSuccess: (data) => {
      updateBrandProfile.mutate({
        extractedColors: data.extractedColors,
        companyName: data.companyName,
        tagline: data.tagline,
        brandVoice: data.brandVoice,
        targetAudience: data.targetAudience,
      });
      toast.success("Brand info extracted from website!");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleCreatePost = () => {
    if (!newPost.platform || !newPost.content) {
      toast.error("Platform and content are required");
      return;
    }
    createPost.mutate({
      contentType: contentMode,
      platform: newPost.platform as any,
      title: newPost.title || undefined,
      content: newPost.content,
      hashtags: newPost.hashtags || undefined,
      scheduledAt: newPost.scheduledAt ? new Date(newPost.scheduledAt) : undefined,
      status: newPost.scheduledAt ? "scheduled" : "draft",
    });
  };

  const handleGenerateContent = () => {
    if (contentMode === "brand") {
      if (!generateForm.platform) {
        toast.error("Platform is required");
        return;
      }
      generateBrandContent.mutate({
        platform: generateForm.platform as any,
        contentType: generateForm.contentType as any,
      });
    } else {
      generateCreatorContent.mutate({
        style: generateForm.style as any,
      });
    }
  };

  // Calendar helpers
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const getPostsForDay = (day: Date) => {
    return calendarPosts?.filter((post) => {
      if (!post.scheduledAt) return false;
      return isSameDay(new Date(post.scheduledAt), day);
    }) || [];
  };

  const brandPlatforms = ["blog", "meta_facebook", "meta_instagram", "google_business", "linkedin"];
  const creatorPlatforms = ["x_twitter"];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tighter">Social Media</h1>
        <p className="text-muted-foreground mt-1">
          Create and manage content for your brand and personal channels
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center gap-4">
        <Button
          variant={contentMode === "brand" ? "default" : "outline"}
          onClick={() => setContentMode("brand")}
          className="gap-2"
        >
          <Building2 className="h-4 w-4" />
          Brand Content
        </Button>
        <Button
          variant={contentMode === "creator" ? "default" : "outline"}
          onClick={() => setContentMode("creator")}
          className="gap-2"
        >
          <User className="h-4 w-4" />
          Content Creator
        </Button>
      </div>

      {/* Content Data Preview */}
      {contentData && (
        <div className="obs-panel bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <div className="pb-2" style={{marginBottom: 16}}>
            <h3 className="obs-section-title text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              AI Content Generation Data
            </h3>
          </div>
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Calls Available</p>
                <p className="font-semibold">{contentData.calls.length} conversations</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Deals</p>
                <p className="font-semibold">{contentData.kpis.totalDeals}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Appointments (Month)</p>
                <p className="font-semibold">{contentData.kpis.appointmentsThisMonth}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Story Ideas</p>
                <p className="font-semibold">{contentData.stories.length} high-score calls</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div>
        <div className="obs-role-tabs">
          <button className={`obs-role-tab ${socialTab === "posts" ? "active" : ""}`} onClick={() => setSocialTab("posts")}>Posts</button>
          <button className={`obs-role-tab ${socialTab === "calendar" ? "active" : ""}`} onClick={() => setSocialTab("calendar")}>Calendar</button>
          {contentMode === "creator" && <button className={`obs-role-tab ${socialTab === "ideas" ? "active" : ""}`} onClick={() => setSocialTab("ideas")}>Ideas</button>}
          {contentMode === "brand" && <button className={`obs-role-tab ${socialTab === "branding" ? "active" : ""}`} onClick={() => setSocialTab("branding")}>Branding</button>}
        </div>

        {/* Posts Tab */}
        {socialTab === "posts" && (<div key="posts" className="space-y-4 obs-fade-in">
          <div className="flex gap-2">
            <Dialog open={isCreatePostOpen} onOpenChange={setIsCreatePostOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Post
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New Post</DialogTitle>
                  <DialogDescription>
                    Create a post for {contentMode === "brand" ? "your brand channels" : "your personal brand"}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Platform</Label>
                    <Select value={newPost.platform} onValueChange={(v) => setNewPost({ ...newPost, platform: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {(contentMode === "brand" ? brandPlatforms : creatorPlatforms).map((p) => (
                          <SelectItem key={p} value={p}>
                            <div className="flex items-center gap-2">
                              {platformIcons[p]}
                              {platformLabels[p]}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Title (optional)</Label>
                    <Input
                      value={newPost.title}
                      onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                      placeholder="Post title..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Content</Label>
                    <Textarea
                      value={newPost.content}
                      onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                      placeholder="Write your post content..."
                      rows={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Hashtags</Label>
                    <Input
                      value={newPost.hashtags}
                      onChange={(e) => setNewPost({ ...newPost, hashtags: e.target.value })}
                      placeholder="#realestate #investing"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Schedule (optional)</Label>
                    <Input
                      type="datetime-local"
                      value={newPost.scheduledAt}
                      onChange={(e) => setNewPost({ ...newPost, scheduledAt: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsCreatePostOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreatePost} disabled={createPost.isPending}>
                      {createPost.isPending ? "Creating..." : "Create Post"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Generate from Calls
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate Content from Call Data</DialogTitle>
                  <DialogDescription>
                    AI will analyze your recent calls and KPIs to create authentic content
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {contentMode === "brand" ? (
                    <>
                      <div className="space-y-2">
                        <Label>Platform</Label>
                        <Select value={generateForm.platform} onValueChange={(v) => setGenerateForm({ ...generateForm, platform: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select platform" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="blog">Blog Post</SelectItem>
                            <SelectItem value="meta">Facebook/Instagram</SelectItem>
                            <SelectItem value="google_business">Google Business</SelectItem>
                            <SelectItem value="linkedin">LinkedIn</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Content Type</Label>
                        <Select value={generateForm.contentType} onValueChange={(v) => setGenerateForm({ ...generateForm, contentType: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="problem_solved">Problem We Solved</SelectItem>
                            <SelectItem value="success_story">Success Story</SelectItem>
                            <SelectItem value="market_insight">Market Insight</SelectItem>
                            <SelectItem value="tips">Tips for Sellers</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label>Content Style</Label>
                      <Select value={generateForm.style} onValueChange={(v) => setGenerateForm({ ...generateForm, style: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="crazy_story">Crazy Story (Attention Grabber)</SelectItem>
                          <SelectItem value="property_walkthrough">Property Walkthrough</SelectItem>
                          <SelectItem value="day_in_life">Day in the Life</SelectItem>
                          <SelectItem value="tips_tricks">Tips & Tricks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsGenerateOpen(false)}>Cancel</Button>
                    <Button 
                      onClick={handleGenerateContent} 
                      disabled={generateBrandContent.isPending || generateCreatorContent.isPending}
                    >
                      {(generateBrandContent.isPending || generateCreatorContent.isPending) ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : "Generate"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Posts list */}
          <div className="grid gap-4">
            {posts?.length === 0 && (
              <div className="obs-panel">
                <div className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No posts yet</p>
                  <p className="text-sm text-muted-foreground">Create your first post or generate one from your call data</p>
                </div>
              </div>
            )}
            {posts?.map((post) => (
              <div className="obs-panel" key={post.id}>
                <div className="pb-2" style={{marginBottom: 16}}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {platformIcons[post.platform]}
                      <span className="font-medium">{platformLabels[post.platform]}</span>
                      <Badge className={statusColors[post.status || "draft"]}>
                        {post.status}
                      </Badge>
                      {post.isAiGenerated === "true" && (
                        <Badge variant="outline" className="gap-1">
                          <Sparkles className="h-3 w-3" />
                          AI
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deletePost.mutate({ id: post.id })}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  {post.title && <h3 className="obs-section-title text-lg">{post.title}</h3>}
                </div>
                <div>
                  <p className="text-sm whitespace-pre-wrap">{post.content}</p>
                  {post.hashtags && (
                    <p className="text-sm text-blue-600 mt-2">{post.hashtags}</p>
                  )}
                  {post.scheduledAt && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Scheduled: {format(new Date(post.scheduledAt), "PPp")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>)}

        {/* Calendar Tab */}
        {socialTab === "calendar" && (<div key="calendar" className="space-y-4 obs-fade-in">
          <div className="obs-panel">
            <div style={{marginBottom: 16}}>
              <div className="flex items-center justify-between">
                <h3 className="obs-section-title">Content Calendar</h3>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium min-w-[140px] text-center">
                    {format(calendarMonth, "MMMM yyyy")}
                  </span>
                  <Button variant="outline" size="icon" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <div className="grid grid-cols-7 gap-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
                {Array.from({ length: calendarStart.getDay() }).map((_, i) => (
                  <div key={`pad-${i}`} className="h-24 bg-muted/30 rounded" />
                ))}
                {calendarDays.map((day) => {
                  const dayPosts = getPostsForDay(day);
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div
                      key={day.toISOString()}
                      className={`h-24 border rounded p-1 ${isToday ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <div className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {format(day, "d")}
                      </div>
                      <div className="space-y-0.5 mt-1">
                        {dayPosts.slice(0, 2).map((post) => (
                          <div
                            key={post.id}
                            className="text-xs truncate px-1 py-0.5 rounded bg-blue-100 text-blue-800"
                          >
                            {platformLabels[post.platform]}
                          </div>
                        ))}
                        {dayPosts.length > 2 && (
                          <div className="text-xs text-muted-foreground px-1">
                            +{dayPosts.length - 2} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>)}

        {/* Ideas Tab (Creator only) */}
        {socialTab === "ideas" && (<div key="ideas" className="space-y-4 obs-fade-in">
            <div className="flex gap-2">
              <Dialog open={isCreateIdeaOpen} onOpenChange={setIsCreateIdeaOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Idea
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Content Idea</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={newIdea.title}
                        onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
                        placeholder="Idea title..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={newIdea.description}
                        onChange={(e) => setNewIdea({ ...newIdea, description: e.target.value })}
                        placeholder="Describe the idea..."
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Platform</Label>
                      <Select 
                        value={newIdea.targetPlatform} 
                        onValueChange={(v) => setNewIdea({ ...newIdea, targetPlatform: v as typeof newIdea.targetPlatform })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="x_twitter">X (Twitter)</SelectItem>
                          <SelectItem value="blog">Blog</SelectItem>
                          <SelectItem value="meta">Meta</SelectItem>
                          <SelectItem value="any">Any</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsCreateIdeaOpen(false)}>Cancel</Button>
                      <Button onClick={() => createIdea.mutate(newIdea)} disabled={createIdea.isPending}>
                        {createIdea.isPending ? "Saving..." : "Save Idea"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => generateIdeas.mutate({ count: 5, targetPlatform: "x_twitter" })}
                disabled={generateIdeas.isPending}
              >
                <Sparkles className="h-4 w-4" />
                {generateIdeas.isPending ? "Generating..." : "Generate Ideas"}
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ideas?.length === 0 && (
                <div className="obs-panel col-span-full">
                  <div className="flex flex-col items-center justify-center py-12">
                    <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No content ideas yet</p>
                    <p className="text-sm text-muted-foreground">Add your own or generate some with AI</p>
                  </div>
                </div>
              )}
              {ideas?.map((idea) => (
                <div className="obs-panel" key={idea.id}>
                  <div className="pb-2" style={{marginBottom: 16}}>
                    <div className="flex items-start justify-between">
                      <Badge variant="secondary">{idea.targetPlatform}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteIdea.mutate({ id: idea.id })}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                    <h3 className="obs-section-title text-base">{idea.title}</h3>
                  </div>
                  <div>
                    {idea.description && (
                      <p className="text-sm text-muted-foreground">{idea.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>)}

        {/* Branding Tab (Brand only) */}
        {socialTab === "branding" && (<div key="branding" className="space-y-6 obs-fade-in">
            {/* Brand Profile Section */}
            <div className="obs-panel">
              <div style={{marginBottom: 16}}>
                <h3 className="obs-section-title flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Brand Profile
                </h3>
                <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>
                  Define your brand identity to help AI generate consistent content
                </p>
              </div>
              <div>
                <BrandProfileForm 
                  profile={brandProfile} 
                  onUpdate={(data) => updateBrandProfile.mutate(data)}
                  onExtractFromWebsite={(url) => extractFromWebsite.mutate({ url })}
                  isPending={updateBrandProfile.isPending}
                  isExtracting={extractFromWebsite.isPending}
                />
              </div>
            </div>

            {/* Brand Assets Section */}
            <div className="obs-panel">
              <div style={{marginBottom: 16}}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="obs-section-title flex items-center gap-2">
                      <ImageIcon className="h-5 w-5" />
                      Brand Assets
                    </h3>
                    <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>
                      Logos, images, and other brand materials
                    </p>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Asset
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Brand Asset</DialogTitle>
                      </DialogHeader>
                      <AddBrandAssetForm onSubmit={(data) => createAsset.mutate(data)} isPending={createAsset.isPending} />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {brandAssets?.length === 0 && (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      No brand assets yet. Add your logo, images, and other materials.
                    </div>
                  )}
                  {brandAssets?.map((asset) => (
                    <div className="obs-panel" key={asset.id}>
                      <div className="pb-2" style={{marginBottom: 16}}>
                        <div className="flex items-start justify-between">
                          <Badge variant="secondary">{asset.assetType.replace("_", " ")}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteAsset.mutate({ id: asset.id })}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                        <h3 className="obs-section-title text-base">{asset.name}</h3>
                      </div>
                      <div>
                        {asset.description && (
                          <p className="text-sm text-muted-foreground mb-2">{asset.description}</p>
                        )}
                        {asset.fileUrl && (
                          <a
                            href={asset.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline"
                          >
                            View File
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>)}
      </div>
    </div>
  );
}

// Brand Profile Form Component
function BrandProfileForm({ 
  profile, 
  onUpdate, 
  onExtractFromWebsite,
  isPending,
  isExtracting
}: { 
  profile: any; 
  onUpdate: (data: any) => void;
  onExtractFromWebsite: (url: string) => void;
  isPending: boolean;
  isExtracting: boolean;
}) {
  const [form, setForm] = useState({
    websiteUrl: profile?.websiteUrl || "",
    companyName: profile?.companyName || "",
    tagline: profile?.tagline || "",
    brandDescription: profile?.brandDescription || "",
    brandVoice: profile?.brandVoice || "",
    missionStatement: profile?.missionStatement || "",
    targetAudience: profile?.targetAudience || "",
    uniqueValueProposition: profile?.uniqueValueProposition || "",
    keyMessages: profile?.keyMessages || "",
    facebookUrl: profile?.facebookUrl || "",
    instagramUrl: profile?.instagramUrl || "",
    twitterUrl: profile?.twitterUrl || "",
    linkedinUrl: profile?.linkedinUrl || "",
    googleBusinessUrl: profile?.googleBusinessUrl || "",
  });

  const [websiteInput, setWebsiteInput] = useState("");

  // Update form when profile changes
  useState(() => {
    if (profile) {
      setForm({
        websiteUrl: profile.websiteUrl || "",
        companyName: profile.companyName || "",
        tagline: profile.tagline || "",
        brandDescription: profile.brandDescription || "",
        brandVoice: profile.brandVoice || "",
        missionStatement: profile.missionStatement || "",
        targetAudience: profile.targetAudience || "",
        uniqueValueProposition: profile.uniqueValueProposition || "",
        keyMessages: profile.keyMessages || "",
        facebookUrl: profile.facebookUrl || "",
        instagramUrl: profile.instagramUrl || "",
        twitterUrl: profile.twitterUrl || "",
        linkedinUrl: profile.linkedinUrl || "",
        googleBusinessUrl: profile.googleBusinessUrl || "",
      });
    }
  });

  const extractedColors = profile?.extractedColors ? JSON.parse(profile.extractedColors) : [];

  return (
    <div className="space-y-6">
      {/* Website URL Extraction */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold">Extract Brand from Website</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Enter your website URL and we'll automatically extract colors, company name, and brand voice
        </p>
        <div className="flex gap-2">
          <Input
            value={websiteInput}
            onChange={(e) => setWebsiteInput(e.target.value)}
            placeholder="https://yourcompany.com"
            className="flex-1"
          />
          <Button 
            onClick={() => onExtractFromWebsite(websiteInput)}
            disabled={isExtracting || !websiteInput}
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Extracting...
              </>
            ) : "Extract"}
          </Button>
        </div>
        {extractedColors.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Extracted Colors:</span>
            <div className="flex gap-1">
              {extractedColors.map((color: string, i: number) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded border"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Brand Identity */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Company Name
          </Label>
          <Input
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            placeholder="Your Company Name"
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Tagline
          </Label>
          <Input
            value={form.tagline}
            onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            placeholder="Your catchy tagline"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Palette className="h-4 w-4" />
          Brand Description
        </Label>
        <Textarea
          value={form.brandDescription}
          onChange={(e) => setForm({ ...form, brandDescription: e.target.value })}
          placeholder="Describe your brand in a few sentences..."
          rows={3}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Brand Voice</Label>
          <Input
            value={form.brandVoice}
            onChange={(e) => setForm({ ...form, brandVoice: e.target.value })}
            placeholder="Professional, friendly, authoritative..."
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Target Audience
          </Label>
          <Input
            value={form.targetAudience}
            onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
            placeholder="Homeowners facing difficult situations..."
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Mission Statement</Label>
        <Textarea
          value={form.missionStatement}
          onChange={(e) => setForm({ ...form, missionStatement: e.target.value })}
          placeholder="What is your company's mission?"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Unique Value Proposition</Label>
        <Textarea
          value={form.uniqueValueProposition}
          onChange={(e) => setForm({ ...form, uniqueValueProposition: e.target.value })}
          placeholder="What makes you different from competitors?"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Key Messages</Label>
        <Textarea
          value={form.keyMessages}
          onChange={(e) => setForm({ ...form, keyMessages: e.target.value })}
          placeholder="Main points you want to communicate in your content..."
          rows={2}
        />
      </div>

      {/* Social Media Links */}
      <div className="border-t pt-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <LinkIcon className="h-4 w-4" />
          Social Media Links
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Facebook className="h-4 w-4" />
              Facebook
            </Label>
            <Input
              value={form.facebookUrl}
              onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })}
              placeholder="https://facebook.com/yourpage"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Instagram className="h-4 w-4" />
              Instagram
            </Label>
            <Input
              value={form.instagramUrl}
              onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })}
              placeholder="https://instagram.com/yourhandle"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Twitter className="h-4 w-4" />
              X (Twitter)
            </Label>
            <Input
              value={form.twitterUrl}
              onChange={(e) => setForm({ ...form, twitterUrl: e.target.value })}
              placeholder="https://x.com/yourhandle"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Linkedin className="h-4 w-4" />
              LinkedIn
            </Label>
            <Input
              value={form.linkedinUrl}
              onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
              placeholder="https://linkedin.com/company/yourcompany"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Google Business
            </Label>
            <Input
              value={form.googleBusinessUrl}
              onChange={(e) => setForm({ ...form, googleBusinessUrl: e.target.value })}
              placeholder="Your Google Business Profile URL"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => onUpdate(form)} disabled={isPending}>
          {isPending ? "Saving..." : "Save Brand Profile"}
        </Button>
      </div>
    </div>
  );
}

// Add Brand Asset Form Component
function AddBrandAssetForm({ onSubmit, isPending }: { onSubmit: (data: any) => void; isPending: boolean }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    assetType: "other" as string,
    fileUrl: "",
    metadata: "",
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Asset name"
        />
      </div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={form.assetType} onValueChange={(v) => setForm({ ...form, assetType: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="logo">Logo</SelectItem>
            <SelectItem value="color_palette">Color Palette</SelectItem>
            <SelectItem value="font">Font</SelectItem>
            <SelectItem value="style_guide">Style Guide</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="document">Document</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Describe this asset..."
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>File URL (optional)</Label>
        <Input
          value={form.fileUrl}
          onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
          placeholder="https://..."
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={() => onSubmit(form)} disabled={isPending || !form.name}>
          {isPending ? "Adding..." : "Add Asset"}
        </Button>
      </div>
    </div>
  );
}
