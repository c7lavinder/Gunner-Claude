import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  DollarSign, TrendingUp, Users, Phone, MessageSquare, 
  Target, Calendar, Plus, Building, FileText, BarChart3,
  ArrowUpRight, ArrowDownRight, Percent
} from "lucide-react";

// Channel display names
const CHANNEL_NAMES: Record<string, string> = {
  cold_calls: "Cold Calls",
  sms: "SMS",
  forms: "Forms",
  ppl: "PPL",
  jv: "JV",
  ppc: "PPC",
  postcards: "Postcards",
  referrals: "Referrals",
};

// Role display names
const ROLE_NAMES: Record<string, string> = {
  am: "Acquisition Manager",
  lm: "Lead Manager",
  lg_cold_caller: "Lead Gen (Cold Caller)",
  lg_sms: "Lead Gen (SMS)",
};

// Status colors
const STATUS_COLORS: Record<string, string> = {
  under_contract: "bg-blue-100 text-blue-800",
  due_diligence: "bg-yellow-100 text-yellow-800",
  closed: "bg-green-100 text-green-800",
  fell_through: "bg-red-100 text-red-800",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// Stat Card Component
function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  trendValue 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: React.ElementType;
  trend?: "up" | "down";
  trendValue?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="p-2 bg-muted rounded-lg">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            {trend && trendValue && (
              <div className={`flex items-center text-xs ${trend === "up" ? "text-green-600" : "text-red-600"}`}>
                {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {trendValue}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function KpiDashboard() {
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("scoreboard");
  const [showNewPeriodDialog, setShowNewPeriodDialog] = useState(false);
  const [showNewDealDialog, setShowNewDealDialog] = useState(false);
  const [showTeamKpiDialog, setShowTeamKpiDialog] = useState(false);
  const [showCampaignKpiDialog, setShowCampaignKpiDialog] = useState(false);

  // New period form state
  const [newPeriod, setNewPeriod] = useState({
    periodType: "weekly" as "daily" | "weekly" | "monthly",
    periodStart: "",
    periodEnd: "",
    periodLabel: "",
  });

  // New deal form state
  const [newDeal, setNewDeal] = useState({
    propertyAddress: "",
    sellerName: "",
    leadSource: "" as string,
    contractPrice: "",
    estimatedArv: "",
    estimatedRepairs: "",
    assignmentFee: "",
    status: "under_contract" as string,
    contractDate: "",
    notes: "",
  });

  // Team KPI form state
  const [teamKpiForm, setTeamKpiForm] = useState({
    teamMemberId: "",
    roleType: "am" as "am" | "lm" | "lg_cold_caller" | "lg_sms",
    metric1: "",
    metric2: "",
    metric3: "",
    notes: "",
  });

  // Campaign KPI form state
  const [campaignKpiForm, setCampaignKpiForm] = useState({
    market: "global" as "tennessee" | "global",
    channel: "cold_calls" as string,
    spent: "",
    volume: "",
    contacts: "",
    leads: "",
    offers: "",
    contracts: "",
    dealsCount: "",
    revenue: "",
    notes: "",
  });

  // Queries
  const { data: periods, isLoading: periodsLoading } = trpc.kpi.getPeriods.useQuery({});
  const { data: teamMembers } = trpc.team.list.useQuery();
  const { data: scoreboard, isLoading: scoreboardLoading } = trpc.kpi.getScoreboard.useQuery(
    { periodId: selectedPeriodId! },
    { enabled: !!selectedPeriodId }
  );
  const { data: teamKpis, isLoading: teamKpisLoading } = trpc.kpi.getTeamMemberKpis.useQuery(
    { periodId: selectedPeriodId! },
    { enabled: !!selectedPeriodId }
  );
  const { data: deals, isLoading: dealsLoading } = trpc.kpi.getDeals.useQuery(
    { periodId: selectedPeriodId ?? undefined },
    { enabled: true }
  );

  // Mutations
  const utils = trpc.useUtils();
  
  const createPeriodMutation = trpc.kpi.createPeriod.useMutation({
    onSuccess: () => {
      toast.success("Period created successfully");
      utils.kpi.getPeriods.invalidate();
      setShowNewPeriodDialog(false);
      setNewPeriod({ periodType: "weekly", periodStart: "", periodEnd: "", periodLabel: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const createDealMutation = trpc.kpi.createDeal.useMutation({
    onSuccess: () => {
      toast.success("Deal created successfully");
      utils.kpi.getDeals.invalidate();
      setShowNewDealDialog(false);
      setNewDeal({
        propertyAddress: "", sellerName: "", leadSource: "", contractPrice: "",
        estimatedArv: "", estimatedRepairs: "", assignmentFee: "",
        status: "under_contract", contractDate: "", notes: "",
      });
    },
    onError: (error) => toast.error(error.message),
  });

  const upsertTeamKpiMutation = trpc.kpi.upsertTeamMemberKpi.useMutation({
    onSuccess: () => {
      toast.success("Team KPI saved successfully");
      utils.kpi.getTeamMemberKpis.invalidate();
      setShowTeamKpiDialog(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const upsertCampaignKpiMutation = trpc.kpi.upsertCampaignKpi.useMutation({
    onSuccess: () => {
      toast.success("Campaign KPI saved successfully");
      utils.kpi.getCampaignKpis.invalidate();
      utils.kpi.getScoreboard.invalidate();
      setShowCampaignKpiDialog(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteDealMutation = trpc.kpi.deleteDeal.useMutation({
    onSuccess: () => {
      toast.success("Deal deleted");
      utils.kpi.getDeals.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  // Auto-select most recent period
  useMemo(() => {
    if (periods && periods.length > 0 && !selectedPeriodId) {
      setSelectedPeriodId(periods[0].id);
    }
  }, [periods, selectedPeriodId]);

  // Metric labels based on role
  const getMetricLabels = (roleType: string) => {
    switch (roleType) {
      case "am": return ["Calls", "Offers", "Contracts"];
      case "lm": return ["Calls", "Conversations", "Appointments"];
      case "lg_cold_caller": return ["Time (mins)", "Conversations", "Leads"];
      case "lg_sms": return ["SMS Sent", "Responses", "Leads"];
      default: return ["Metric 1", "Metric 2", "Metric 3"];
    }
  };

  // Handle form submissions
  const handleCreatePeriod = () => {
    if (!newPeriod.periodStart || !newPeriod.periodEnd || !newPeriod.periodLabel) {
      toast.error("Please fill in all required fields");
      return;
    }
    createPeriodMutation.mutate({
      periodType: newPeriod.periodType,
      periodStart: new Date(newPeriod.periodStart),
      periodEnd: new Date(newPeriod.periodEnd),
      periodLabel: newPeriod.periodLabel,
    });
  };

  const handleCreateDeal = () => {
    if (!newDeal.propertyAddress) {
      toast.error("Property address is required");
      return;
    }
    createDealMutation.mutate({
      periodId: selectedPeriodId ?? undefined,
      propertyAddress: newDeal.propertyAddress,
      sellerName: newDeal.sellerName || undefined,
      leadSource: newDeal.leadSource as any || undefined,
      contractPrice: newDeal.contractPrice ? parseFloat(newDeal.contractPrice) : undefined,
      estimatedArv: newDeal.estimatedArv ? parseFloat(newDeal.estimatedArv) : undefined,
      estimatedRepairs: newDeal.estimatedRepairs ? parseFloat(newDeal.estimatedRepairs) : undefined,
      assignmentFee: newDeal.assignmentFee ? parseFloat(newDeal.assignmentFee) : undefined,
      status: newDeal.status as any || undefined,
      contractDate: newDeal.contractDate ? new Date(newDeal.contractDate) : undefined,
      notes: newDeal.notes || undefined,
    });
  };

  const handleSaveTeamKpi = () => {
    if (!teamKpiForm.teamMemberId || !selectedPeriodId) {
      toast.error("Please select a team member and period");
      return;
    }
    upsertTeamKpiMutation.mutate({
      teamMemberId: parseInt(teamKpiForm.teamMemberId),
      periodId: selectedPeriodId,
      roleType: teamKpiForm.roleType,
      metric1: parseFloat(teamKpiForm.metric1) || 0,
      metric2: parseFloat(teamKpiForm.metric2) || 0,
      metric3: parseFloat(teamKpiForm.metric3) || 0,
      notes: teamKpiForm.notes || undefined,
    });
  };

  const handleSaveCampaignKpi = () => {
    if (!selectedPeriodId) {
      toast.error("Please select a period");
      return;
    }
    upsertCampaignKpiMutation.mutate({
      periodId: selectedPeriodId,
      market: campaignKpiForm.market,
      channel: campaignKpiForm.channel as any,
      spent: parseFloat(campaignKpiForm.spent) || 0,
      volume: parseFloat(campaignKpiForm.volume) || 0,
      contacts: parseFloat(campaignKpiForm.contacts) || 0,
      leads: parseFloat(campaignKpiForm.leads) || 0,
      offers: parseFloat(campaignKpiForm.offers) || 0,
      contracts: parseFloat(campaignKpiForm.contracts) || 0,
      dealsCount: parseFloat(campaignKpiForm.dealsCount) || 0,
      revenue: parseFloat(campaignKpiForm.revenue) || 0,
      notes: campaignKpiForm.notes || undefined,
    });
  };

  const metricLabels = getMetricLabels(teamKpiForm.roleType);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">KPI Dashboard</h1>
          <p className="text-muted-foreground">Track team performance, campaigns, and deals</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <Select
            value={selectedPeriodId?.toString() || ""}
            onValueChange={(val) => setSelectedPeriodId(parseInt(val))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periods?.map((period) => (
                <SelectItem key={period.id} value={period.id.toString()}>
                  {period.periodLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* New Period Button */}
          <Dialog open={showNewPeriodDialog} onOpenChange={setShowNewPeriodDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Period</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Period Type</Label>
                  <Select
                    value={newPeriod.periodType}
                    onValueChange={(val) => setNewPeriod({ ...newPeriod, periodType: val as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    placeholder="e.g., Week 5 - Feb 2026"
                    value={newPeriod.periodLabel}
                    onChange={(e) => setNewPeriod({ ...newPeriod, periodLabel: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={newPeriod.periodStart}
                      onChange={(e) => setNewPeriod({ ...newPeriod, periodStart: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={newPeriod.periodEnd}
                      onChange={(e) => setNewPeriod({ ...newPeriod, periodEnd: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleCreatePeriod} disabled={createPeriodMutation.isPending}>
                  Create Period
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scoreboard">
            <BarChart3 className="h-4 w-4 mr-2" />
            Scoreboard
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="h-4 w-4 mr-2" />
            Team KPIs
          </TabsTrigger>
          <TabsTrigger value="campaigns">
            <Target className="h-4 w-4 mr-2" />
            Campaigns
          </TabsTrigger>
          <TabsTrigger value="deals">
            <Building className="h-4 w-4 mr-2" />
            Deals
          </TabsTrigger>
        </TabsList>

        {/* Scoreboard Tab */}
        <TabsContent value="scoreboard" className="space-y-6">
          {!selectedPeriodId ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select or create a period to view the scoreboard</p>
              </CardContent>
            </Card>
          ) : scoreboardLoading ? (
            <div className="text-center py-8">Loading scoreboard...</div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <StatCard
                  title="Total Spent"
                  value={formatCurrency(scoreboard?.totals.spent || 0)}
                  icon={DollarSign}
                />
                <StatCard
                  title="Leads"
                  value={scoreboard?.totals.leads || 0}
                  subtitle={`${formatCurrency(scoreboard?.totals.costPerLead || 0)}/lead`}
                  icon={Users}
                />
                <StatCard
                  title="Offers"
                  value={scoreboard?.totals.offers || 0}
                  subtitle={`${formatCurrency(scoreboard?.totals.costPerOffer || 0)}/offer`}
                  icon={FileText}
                />
                <StatCard
                  title="Contracts"
                  value={scoreboard?.totals.contracts || 0}
                  subtitle={`${formatCurrency(scoreboard?.totals.costPerContract || 0)}/contract`}
                  icon={Target}
                />
                <StatCard
                  title="Deals"
                  value={scoreboard?.totals.deals || 0}
                  subtitle={`${formatCurrency(scoreboard?.totals.costPerDeal || 0)}/deal`}
                  icon={Building}
                />
                <StatCard
                  title="Revenue"
                  value={formatCurrency(scoreboard?.totals.revenue || 0)}
                  icon={TrendingUp}
                />
                <StatCard
                  title="ROI"
                  value={formatPercent(scoreboard?.totals.roi || 0)}
                  icon={Percent}
                  trend={(scoreboard?.totals.roi || 0) > 0 ? "up" : "down"}
                />
              </div>

              {/* Channel Breakdown Table */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Channel Performance</CardTitle>
                    <CardDescription>Breakdown by lead generation channel</CardDescription>
                  </div>
                  <Dialog open={showCampaignKpiDialog} onOpenChange={setShowCampaignKpiDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Campaign Data
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Enter Campaign KPIs</DialogTitle>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-4 py-4">
                        <div className="space-y-2">
                          <Label>Market</Label>
                          <Select
                            value={campaignKpiForm.market}
                            onValueChange={(val) => setCampaignKpiForm({ ...campaignKpiForm, market: val as "tennessee" | "global" })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tennessee">Tennessee</SelectItem>
                              <SelectItem value="global">Global</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Channel</Label>
                          <Select
                            value={campaignKpiForm.channel}
                            onValueChange={(val) => setCampaignKpiForm({ ...campaignKpiForm, channel: val })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(CHANNEL_NAMES).map(([key, name]) => (
                                <SelectItem key={key} value={key}>{name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>$ Spent</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={campaignKpiForm.spent}
                            onChange={(e) => setCampaignKpiForm({ ...campaignKpiForm, spent: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Volume (Sent/Made)</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={campaignKpiForm.volume}
                            onChange={(e) => setCampaignKpiForm({ ...campaignKpiForm, volume: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Contacts (Answered/Responded)</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={campaignKpiForm.contacts}
                            onChange={(e) => setCampaignKpiForm({ ...campaignKpiForm, contacts: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Leads</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={campaignKpiForm.leads}
                            onChange={(e) => setCampaignKpiForm({ ...campaignKpiForm, leads: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Offers</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={campaignKpiForm.offers}
                            onChange={(e) => setCampaignKpiForm({ ...campaignKpiForm, offers: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Contracts</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={campaignKpiForm.contracts}
                            onChange={(e) => setCampaignKpiForm({ ...campaignKpiForm, contracts: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Deals</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={campaignKpiForm.dealsCount}
                            onChange={(e) => setCampaignKpiForm({ ...campaignKpiForm, dealsCount: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Revenue</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={campaignKpiForm.revenue}
                            onChange={(e) => setCampaignKpiForm({ ...campaignKpiForm, revenue: e.target.value })}
                          />
                        </div>
                        <div className="col-span-2 space-y-2">
                          <Label>Notes</Label>
                          <Input
                            placeholder="Optional notes"
                            value={campaignKpiForm.notes}
                            onChange={(e) => setCampaignKpiForm({ ...campaignKpiForm, notes: e.target.value })}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button onClick={handleSaveCampaignKpi} disabled={upsertCampaignKpiMutation.isPending}>
                          Save
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Market</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead className="text-right">Spent</TableHead>
                        <TableHead className="text-right">Volume</TableHead>
                        <TableHead className="text-right">Contacts</TableHead>
                        <TableHead className="text-right">Contact %</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">Offers</TableHead>
                        <TableHead className="text-right">Contracts</TableHead>
                        <TableHead className="text-right">Deals</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Cost/Lead</TableHead>
                        <TableHead className="text-right">ROI</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scoreboard?.channels.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                            No campaign data for this period. Click "Add Campaign Data" to get started.
                          </TableCell>
                        </TableRow>
                      ) : (
                        scoreboard?.channels.map((channel, idx) => (
                          <TableRow key={`${channel.market}-${channel.channel}-${idx}`}>
                            <TableCell className="font-medium capitalize">{channel.market}</TableCell>
                            <TableCell className="font-medium">{CHANNEL_NAMES[channel.channel] || channel.channel}</TableCell>
                            <TableCell className="text-right">{formatCurrency(channel.spent)}</TableCell>
                            <TableCell className="text-right">{channel.volume}</TableCell>
                            <TableCell className="text-right">{channel.contacts}</TableCell>
                            <TableCell className="text-right">{formatPercent(channel.contactRate)}</TableCell>
                            <TableCell className="text-right">{channel.leads}</TableCell>
                            <TableCell className="text-right">{channel.offers}</TableCell>
                            <TableCell className="text-right">{channel.contracts}</TableCell>
                            <TableCell className="text-right">{channel.deals}</TableCell>
                            <TableCell className="text-right">{formatCurrency(channel.revenue)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(channel.costPerLead)}</TableCell>
                            <TableCell className="text-right">
                              <span className={channel.roi > 0 ? "text-green-600" : "text-red-600"}>
                                {formatPercent(channel.roi)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Team KPIs Tab */}
        <TabsContent value="team" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Team Member KPIs</CardTitle>
                <CardDescription>Track individual performance metrics</CardDescription>
              </div>
              <Dialog open={showTeamKpiDialog} onOpenChange={setShowTeamKpiDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={!selectedPeriodId}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Team KPI
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Enter Team Member KPIs</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Team Member</Label>
                      <Select
                        value={teamKpiForm.teamMemberId}
                        onValueChange={(val) => setTeamKpiForm({ ...teamKpiForm, teamMemberId: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                        <SelectContent>
                          {teamMembers?.map((member) => (
                            <SelectItem key={member.id} value={member.id.toString()}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Role Type</Label>
                      <Select
                        value={teamKpiForm.roleType}
                        onValueChange={(val) => setTeamKpiForm({ ...teamKpiForm, roleType: val as any })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_NAMES).map(([key, name]) => (
                            <SelectItem key={key} value={key}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>{metricLabels[0]}</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={teamKpiForm.metric1}
                          onChange={(e) => setTeamKpiForm({ ...teamKpiForm, metric1: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{metricLabels[1]}</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={teamKpiForm.metric2}
                          onChange={(e) => setTeamKpiForm({ ...teamKpiForm, metric2: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{metricLabels[2]}</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={teamKpiForm.metric3}
                          onChange={(e) => setTeamKpiForm({ ...teamKpiForm, metric3: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Input
                        placeholder="Optional notes"
                        value={teamKpiForm.notes}
                        onChange={(e) => setTeamKpiForm({ ...teamKpiForm, notes: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleSaveTeamKpi} disabled={upsertTeamKpiMutation.isPending}>
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {!selectedPeriodId ? (
                <div className="text-center py-8 text-muted-foreground">
                  Select a period to view team KPIs
                </div>
              ) : teamKpisLoading ? (
                <div className="text-center py-8">Loading...</div>
              ) : teamKpis?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No team KPIs for this period. Click "Add Team KPI" to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Metric 1</TableHead>
                      <TableHead className="text-right">Metric 2</TableHead>
                      <TableHead className="text-right">Metric 3</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamKpis?.map((item) => (
                      <TableRow key={item.kpi.id}>
                        <TableCell className="font-medium">{item.teamMember?.name || "Unknown"}</TableCell>
                        <TableCell>{ROLE_NAMES[item.kpi.roleType] || item.kpi.roleType}</TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm text-muted-foreground">{item.kpi.metric1Label}</div>
                          <div className="font-medium">{item.kpi.metric1}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm text-muted-foreground">{item.kpi.metric2Label}</div>
                          <div className="font-medium">{item.kpi.metric2}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm text-muted-foreground">{item.kpi.metric3Label}</div>
                          <div className="font-medium">{item.kpi.metric3}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.kpi.notes || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
              <CardDescription>Detailed view of each lead generation channel</CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedPeriodId ? (
                <div className="text-center py-8 text-muted-foreground">
                  Select a period to view campaign details
                </div>
              ) : scoreboardLoading ? (
                <div className="text-center py-8">Loading...</div>
              ) : scoreboard?.channels.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No campaign data for this period
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scoreboard?.channels.map((channel) => (
                    <Card key={channel.channel}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{CHANNEL_NAMES[channel.channel]}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Spent</span>
                          <span className="font-medium">{formatCurrency(channel.spent)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Volume</span>
                          <span className="font-medium">{channel.volume}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Leads</span>
                          <span className="font-medium">{channel.leads}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cost/Lead</span>
                          <span className="font-medium">{formatCurrency(channel.costPerLead)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Revenue</span>
                          <span className="font-medium">{formatCurrency(channel.revenue)}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                          <span className="text-muted-foreground">ROI</span>
                          <span className={`font-bold ${channel.roi > 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatPercent(channel.roi)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deals Tab */}
        <TabsContent value="deals" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Deal Log</CardTitle>
                <CardDescription>Track all deals under contract</CardDescription>
              </div>
              <Dialog open={showNewDealDialog} onOpenChange={setShowNewDealDialog}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Deal
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add New Deal</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="col-span-2 space-y-2">
                      <Label>Property Address *</Label>
                      <Input
                        placeholder="123 Main St, City, State"
                        value={newDeal.propertyAddress}
                        onChange={(e) => setNewDeal({ ...newDeal, propertyAddress: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Seller Name</Label>
                      <Input
                        placeholder="John Doe"
                        value={newDeal.sellerName}
                        onChange={(e) => setNewDeal({ ...newDeal, sellerName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Lead Source</Label>
                      <Select
                        value={newDeal.leadSource}
                        onValueChange={(val) => setNewDeal({ ...newDeal, leadSource: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CHANNEL_NAMES).map(([key, name]) => (
                            <SelectItem key={key} value={key}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Contract Price</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={newDeal.contractPrice}
                        onChange={(e) => setNewDeal({ ...newDeal, contractPrice: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Estimated ARV</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={newDeal.estimatedArv}
                        onChange={(e) => setNewDeal({ ...newDeal, estimatedArv: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Estimated Repairs</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={newDeal.estimatedRepairs}
                        onChange={(e) => setNewDeal({ ...newDeal, estimatedRepairs: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Assignment Fee</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={newDeal.assignmentFee}
                        onChange={(e) => setNewDeal({ ...newDeal, assignmentFee: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={newDeal.status}
                        onValueChange={(val) => setNewDeal({ ...newDeal, status: val })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="under_contract">Under Contract</SelectItem>
                          <SelectItem value="due_diligence">Due Diligence</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                          <SelectItem value="fell_through">Fell Through</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Contract Date</Label>
                      <Input
                        type="date"
                        value={newDeal.contractDate}
                        onChange={(e) => setNewDeal({ ...newDeal, contractDate: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Notes</Label>
                      <Input
                        placeholder="Optional notes"
                        value={newDeal.notes}
                        onChange={(e) => setNewDeal({ ...newDeal, notes: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleCreateDeal} disabled={createDealMutation.isPending}>
                      Add Deal
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {dealsLoading ? (
                <div className="text-center py-8">Loading...</div>
              ) : deals?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No deals yet. Click "Add Deal" to log your first deal.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Seller</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Contract</TableHead>
                      <TableHead className="text-right">ARV</TableHead>
                      <TableHead className="text-right">Assignment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deals?.map((deal) => (
                      <TableRow key={deal.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{deal.propertyAddress}</TableCell>
                        <TableCell>{deal.sellerName || "-"}</TableCell>
                        <TableCell>{deal.leadSource ? CHANNEL_NAMES[deal.leadSource] : "-"}</TableCell>
                        <TableCell className="text-right">{deal.contractPrice ? formatCurrency(deal.contractPrice) : "-"}</TableCell>
                        <TableCell className="text-right">{deal.estimatedArv ? formatCurrency(deal.estimatedArv) : "-"}</TableCell>
                        <TableCell className="text-right">{deal.assignmentFee ? formatCurrency(deal.assignmentFee) : "-"}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[deal.status || "under_contract"]}>
                            {deal.status?.replace("_", " ") || "Under Contract"}
                          </Badge>
                        </TableCell>
                        <TableCell>{deal.contractDate ? new Date(deal.contractDate).toLocaleDateString() : "-"}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (confirm("Delete this deal?")) {
                                deleteDealMutation.mutate({ id: deal.id });
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
