import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Building2, User, Plus, Sparkles, Calendar, FileText, 
  Facebook, Instagram, MapPin, Twitter, Linkedin, Trash2,
  Edit, Send, Clock, CheckCircle, XCircle, Lightbulb,
  ChevronLeft, ChevronRight, Image as ImageIcon
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";

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
  draft: "bg-gray-100 text-gray-800",
  scheduled: "bg-blue-100 text-blue-800",
  published: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function SocialMedia() {
  const [contentMode, setContentMode] = useState<ContentMode>("brand");
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
    topic: "",
    tone: "professional yet approachable",
    additionalContext: "",
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

  const generateContent = trpc.socialPosts.generateContent.useMutation({
    onSuccess: (data) => {
      setNewPost({
        ...newPost,
        platform: generateForm.platform,
        title: data.title || "",
        content: data.content,
        hashtags: data.hashtags?.join(" ") || "",
      });
      setIsGenerateOpen(false);
      setIsCreatePostOpen(true);
      toast.success("Content generated! Review and edit before posting.");
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
    if (!generateForm.platform || !generateForm.topic) {
      toast.error("Platform and topic are required");
      return;
    }
    generateContent.mutate({
      contentType: contentMode,
      platform: generateForm.platform as any,
      topic: generateForm.topic,
      tone: generateForm.tone,
      additionalContext: generateForm.additionalContext || undefined,
    });
  };

  // Calendar helpers
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const getPostsForDay = (day: Date) => {
    return calendarPosts?.filter(post => 
      post.scheduledAt && isSameDay(new Date(post.scheduledAt), day)
    ) || [];
  };

  // Brand content platforms
  const brandPlatforms = ["blog", "meta_facebook", "meta_instagram", "google_business", "linkedin"];
  // Creator platforms
  const creatorPlatforms = ["x_twitter", "meta_instagram", "linkedin"];

  const availablePlatforms = contentMode === "brand" ? brandPlatforms : creatorPlatforms;

  return (
    <div className="p-6 space-y-6">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Social Media Content</h1>
          <p className="text-muted-foreground">Create and schedule content for your brand and personal accounts</p>
        </div>
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <Button
            variant={contentMode === "brand" ? "default" : "ghost"}
            size="sm"
            onClick={() => setContentMode("brand")}
            className="gap-2"
          >
            <Building2 className="h-4 w-4" />
            Brand Content
          </Button>
          <Button
            variant={contentMode === "creator" ? "default" : "ghost"}
            size="sm"
            onClick={() => setContentMode("creator")}
            className="gap-2"
          >
            <User className="h-4 w-4" />
            Content Creator
          </Button>
        </div>
      </div>

      {/* Main content tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          {contentMode === "creator" && <TabsTrigger value="ideas">Ideas</TabsTrigger>}
          {contentMode === "brand" && <TabsTrigger value="branding">Branding</TabsTrigger>}
        </TabsList>

        {/* Posts Tab */}
        <TabsContent value="posts" className="space-y-4">
          <div className="flex gap-2">
            <Dialog open={isCreatePostOpen} onOpenChange={setIsCreatePostOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Post
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Post</DialogTitle>
                  <DialogDescription>
                    Create content for {contentMode === "brand" ? "your brand" : "your personal account"}
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
                        {availablePlatforms.map((p) => (
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
                  {newPost.platform === "blog" && (
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={newPost.title}
                        onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                        placeholder="Blog post title"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Content</Label>
                    <Textarea
                      value={newPost.content}
                      onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                      placeholder="Write your post content..."
                      rows={6}
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
                  Generate with AI
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate Content with AI</DialogTitle>
                  <DialogDescription>
                    Let AI create content based on your topic and preferences
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Platform</Label>
                    <Select value={generateForm.platform} onValueChange={(v) => setGenerateForm({ ...generateForm, platform: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePlatforms.map((p) => (
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
                    <Label>Topic</Label>
                    <Input
                      value={generateForm.topic}
                      onChange={(e) => setGenerateForm({ ...generateForm, topic: e.target.value })}
                      placeholder="e.g., Benefits of selling to cash buyers"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <Input
                      value={generateForm.tone}
                      onChange={(e) => setGenerateForm({ ...generateForm, tone: e.target.value })}
                      placeholder="e.g., professional, friendly, urgent"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Additional Context (optional)</Label>
                    <Textarea
                      value={generateForm.additionalContext}
                      onChange={(e) => setGenerateForm({ ...generateForm, additionalContext: e.target.value })}
                      placeholder="Any specific points to include..."
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsGenerateOpen(false)}>Cancel</Button>
                    <Button onClick={handleGenerateContent} disabled={generateContent.isPending}>
                      {generateContent.isPending ? "Generating..." : "Generate"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Posts list */}
          <div className="grid gap-4">
            {posts?.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No posts yet</p>
                  <p className="text-sm text-muted-foreground">Create your first post or generate one with AI</p>
                </CardContent>
              </Card>
            )}
            {posts?.map((post) => (
              <Card key={post.id}>
                <CardHeader className="pb-2">
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
                  {post.title && <CardTitle className="text-lg">{post.title}</CardTitle>}
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Content Calendar</CardTitle>
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
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
                {/* Padding for first week */}
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
                      <div className={`text-sm font-medium ${isToday ? "text-primary" : ""}`}>
                        {format(day, "d")}
                      </div>
                      <ScrollArea className="h-16">
                        {dayPosts.map((post) => (
                          <div
                            key={post.id}
                            className={`text-xs p-1 rounded mb-1 truncate ${
                              post.contentType === "brand" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
                            }`}
                          >
                            <div className="flex items-center gap-1">
                              {platformIcons[post.platform]}
                              <span className="truncate">{post.title || post.content.substring(0, 20)}...</span>
                            </div>
                          </div>
                        ))}
                      </ScrollArea>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ideas Tab (Creator only) */}
        {contentMode === "creator" && (
          <TabsContent value="ideas" className="space-y-4">
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
                    <DialogTitle>Add Content Idea</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={newIdea.title}
                        onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
                        placeholder="Content idea title"
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
                      <Label>Category</Label>
                      <Input
                        value={newIdea.category}
                        onChange={(e) => setNewIdea({ ...newIdea, category: e.target.value })}
                        placeholder="e.g., Market Tips, Success Stories"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Target Platform</Label>
                      <Select value={newIdea.targetPlatform} onValueChange={(v) => setNewIdea({ ...newIdea, targetPlatform: v as "x_twitter" | "blog" | "meta" | "any" })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any Platform</SelectItem>
                          <SelectItem value="x_twitter">X (Twitter)</SelectItem>
                          <SelectItem value="blog">Blog</SelectItem>
                          <SelectItem value="meta">Meta (FB/IG)</SelectItem>
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
                onClick={() => generateIdeas.mutate({ count: 5 })}
                disabled={generateIdeas.isPending}
              >
                <Sparkles className="h-4 w-4" />
                {generateIdeas.isPending ? "Generating..." : "Generate Ideas"}
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ideas?.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No content ideas yet</p>
                    <p className="text-sm text-muted-foreground">Add your own or generate some with AI</p>
                  </CardContent>
                </Card>
              )}
              {ideas?.map((idea) => (
                <Card key={idea.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {idea.isAiGenerated === "true" && (
                          <Badge variant="outline" className="gap-1">
                            <Sparkles className="h-3 w-3" />
                            AI
                          </Badge>
                        )}
                        {idea.category && (
                          <Badge variant="secondary">{idea.category}</Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteIdea.mutate({ id: idea.id })}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                    <CardTitle className="text-base">{idea.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{idea.description}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setGenerateForm({
                            platform: idea.targetPlatform === "any" ? "x_twitter" : idea.targetPlatform || "x_twitter",
                            topic: idea.title,
                            tone: "professional yet approachable",
                            additionalContext: idea.description || "",
                          });
                          setIsGenerateOpen(true);
                        }}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        Create Post
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}

        {/* Branding Tab (Brand only) */}
        {contentMode === "brand" && (
          <TabsContent value="branding" className="space-y-4">
            <div className="flex gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Brand Asset
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Brand Asset</DialogTitle>
                    <DialogDescription>
                      Add logos, color palettes, style guides, and other brand assets
                    </DialogDescription>
                  </DialogHeader>
                  <AddBrandAssetForm onSubmit={(data) => createAsset.mutate(data)} isPending={createAsset.isPending} />
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {brandAssets?.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No brand assets yet</p>
                    <p className="text-sm text-muted-foreground">Add your logo, colors, and style guides</p>
                  </CardContent>
                </Card>
              )}
              {brandAssets?.map((asset) => (
                <Card key={asset.id}>
                  <CardHeader className="pb-2">
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
                    <CardTitle className="text-base">{asset.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// Separate component for add brand asset form
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
      <div className="space-y-2">
        <Label>Metadata (optional, JSON)</Label>
        <Textarea
          value={form.metadata}
          onChange={(e) => setForm({ ...form, metadata: e.target.value })}
          placeholder='{"colors": ["#fff", "#000"]}'
          rows={2}
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
