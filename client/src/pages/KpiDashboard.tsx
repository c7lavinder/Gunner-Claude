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
  ArrowUpRight, ArrowDownRight, Percent, Settings, Trash2,
  UserPlus, MapPin, Layers, Edit, AlertTriangle, Check, X
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

// Inventory Status display names and colors
const INVENTORY_STATUS_NAMES: Record<string, string> = {
  for_sale: "For Sale",
  assigned: "Assigned",
  funded: "Funded",
};

const INVENTORY_STATUS_COLORS: Record<string, string> = {
  for_sale: "bg-blue-100 text-blue-800",
  assigned: "bg-yellow-100 text-yellow-800",
  funded: "bg-green-100 text-green-800",
};

// Location display names
const LOCATION_NAMES: Record<string, string> = {
  nashville: "Nashville",
  nash_sw: "Nash SW",
  knoxville: "Knoxville",
  chattanooga: "Chattanooga",
  global: "Global",
  nah: "NAH",
};

// Team member display names
const LM_NAMES: Record<string, string> = {
  chris: "Chris",
  daniel: "Daniel",
};

const AM_NAMES: Record<string, string> = {
  kyle: "Kyle",
};

const DM_NAMES: Record<string, string> = {
  esteban: "Esteban",
  steve: "Steve",
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
  const [showManageStaffDialog, setShowManageStaffDialog] = useState(false);
  const [showManageMarketsDialog, setShowManageMarketsDialog] = useState(false);
  const [showManageChannelsDialog, setShowManageChannelsDialog] = useState(false);
  const [showAddStaffDialog, setShowAddStaffDialog] = useState(false);
  const [showAddMarketDialog, setShowAddMarketDialog] = useState(false);
  const [showAddChannelDialog, setShowAddChannelDialog] = useState(false);
  const [editingStaff, setEditingStaff] = useState<{ id: number; name: string; roleType: string; active: boolean } | null>(null);
  const [editingMarket, setEditingMarket] = useState<{ id: number; name: string; active: boolean } | null>(null);
  const [editingChannel, setEditingChannel] = useState<{ id: number; name: string; key: string; active: boolean } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ type: 'staff' | 'market' | 'channel'; id: number; name: string } | null>(null);

  // New staff/market/channel form state
  const [newStaff, setNewStaff] = useState({ name: "", roleType: "lg_cold_caller" as "lg_cold_caller" | "lg_sms" | "am" | "lm" });
  const [newMarket, setNewMarket] = useState({ name: "" });
  const [newChannel, setNewChannel] = useState({ name: "", code: "" });

  // New period form state
  const [newPeriod, setNewPeriod] = useState({
    periodType: "weekly" as "daily" | "weekly" | "monthly",
    periodStart: "",
    periodEnd: "",
    periodLabel: "",
  });

  // New inventory item form state
  const [newDeal, setNewDeal] = useState({
    propertyAddress: "",
    sellerName: "",
    inventoryStatus: "for_sale" as string,
    location: "" as string,
    leadSource: "" as string,
    lmName: "" as string,
    amName: "" as string,
    dmName: "" as string,
    isNah: "no" as string,
    contractPrice: "",
    estimatedArv: "",
    estimatedRepairs: "",
    assignmentFee: "",
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

  // Lead Gen Staff, Markets, Channels queries
  const { data: leadGenStaff } = trpc.kpi.getLeadGenStaff.useQuery({ activeOnly: false });
  const { data: markets } = trpc.kpi.getMarkets.useQuery({ activeOnly: false });
  const { data: channels } = trpc.kpi.getChannels.useQuery({ activeOnly: false });

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
        propertyAddress: "", sellerName: "", inventoryStatus: "for_sale",
        location: "", leadSource: "", lmName: "", amName: "", dmName: "",
        isNah: "no", contractPrice: "", estimatedArv: "", estimatedRepairs: "",
        assignmentFee: "", contractDate: "", notes: "",
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

  // Lead Gen Staff mutations
  const createStaffMutation = trpc.kpi.createLeadGenStaff.useMutation({
    onSuccess: () => {
      toast.success("Staff member added");
      utils.kpi.getLeadGenStaff.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateStaffMutation = trpc.kpi.updateLeadGenStaff.useMutation({
    onSuccess: () => {
      toast.success("Staff member updated");
      utils.kpi.getLeadGenStaff.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteStaffMutation = trpc.kpi.deleteLeadGenStaff.useMutation({
    onSuccess: () => {
      toast.success("Staff member deleted");
      utils.kpi.getLeadGenStaff.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  // Markets mutations
  const createMarketMutation = trpc.kpi.createMarket.useMutation({
    onSuccess: () => {
      toast.success("Market added");
      utils.kpi.getMarkets.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMarketMutation = trpc.kpi.updateMarket.useMutation({
    onSuccess: () => {
      toast.success("Market updated");
      utils.kpi.getMarkets.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMarketMutation = trpc.kpi.deleteMarket.useMutation({
    onSuccess: () => {
      toast.success("Market deleted");
      utils.kpi.getMarkets.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  // Channels mutations
  const createChannelMutation = trpc.kpi.createChannel.useMutation({
    onSuccess: () => {
      toast.success("Channel added");
      utils.kpi.getChannels.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateChannelMutation = trpc.kpi.updateChannel.useMutation({
    onSuccess: () => {
      toast.success("Channel updated");
      utils.kpi.getChannels.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteChannelMutation = trpc.kpi.deleteChannel.useMutation({
    onSuccess: () => {
      toast.success("Channel deleted");
      utils.kpi.getChannels.invalidate();
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
      inventoryStatus: newDeal.inventoryStatus as any || undefined,
      location: newDeal.location as any || undefined,
      leadSource: newDeal.leadSource as any || undefined,
      lmName: newDeal.lmName as any || undefined,
      amName: newDeal.amName as any || undefined,
      dmName: newDeal.dmName as any || undefined,
      isNah: newDeal.isNah as any || undefined,
      contractPrice: newDeal.contractPrice ? parseFloat(newDeal.contractPrice) : undefined,
      estimatedArv: newDeal.estimatedArv ? parseFloat(newDeal.estimatedArv) : undefined,
      estimatedRepairs: newDeal.estimatedRepairs ? parseFloat(newDeal.estimatedRepairs) : undefined,
      assignmentFee: newDeal.assignmentFee ? parseFloat(newDeal.assignmentFee) : undefined,
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
            Inventory
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
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowManageMarketsDialog(true)}>
                      <MapPin className="h-4 w-4 mr-2" />
                      Manage Markets
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowManageChannelsDialog(true)}>
                      <Layers className="h-4 w-4 mr-2" />
                      Manage Channels
                    </Button>
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
                  </div>
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
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowManageStaffDialog(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Manage Staff
                </Button>
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
              </div>
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

        {/* Inventory Tab */}
        <TabsContent value="deals" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Inventory</CardTitle>
                <CardDescription>Track all properties in your pipeline</CardDescription>
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
                    <DialogTitle>Add Inventory Item</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-3 gap-4 py-4">
                    <div className="col-span-3 space-y-2">
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
                      <Label>Status</Label>
                      <Select
                        value={newDeal.inventoryStatus}
                        onValueChange={(val) => setNewDeal({ ...newDeal, inventoryStatus: val })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(INVENTORY_STATUS_NAMES).map(([key, name]) => (
                            <SelectItem key={key} value={key}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Select
                        value={newDeal.location}
                        onValueChange={(val) => setNewDeal({ ...newDeal, location: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(LOCATION_NAMES).map(([key, name]) => (
                            <SelectItem key={key} value={key}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Source</Label>
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
                      <Label>LM</Label>
                      <Select
                        value={newDeal.lmName}
                        onValueChange={(val) => setNewDeal({ ...newDeal, lmName: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select LM" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(LM_NAMES).map(([key, name]) => (
                            <SelectItem key={key} value={key}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>AM</Label>
                      <Select
                        value={newDeal.amName}
                        onValueChange={(val) => setNewDeal({ ...newDeal, amName: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select AM" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(AM_NAMES).map(([key, name]) => (
                            <SelectItem key={key} value={key}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>DM</Label>
                      <Select
                        value={newDeal.dmName}
                        onValueChange={(val) => setNewDeal({ ...newDeal, dmName: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select DM" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(DM_NAMES).map(([key, name]) => (
                            <SelectItem key={key} value={key}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>NAH?</Label>
                      <Select
                        value={newDeal.isNah}
                        onValueChange={(val) => setNewDeal({ ...newDeal, isNah: val })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
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
                      <Label>Contract Date</Label>
                      <Input
                        type="date"
                        value={newDeal.contractDate}
                        onChange={(e) => setNewDeal({ ...newDeal, contractDate: e.target.value })}
                      />
                    </div>
                    <div className="col-span-3 space-y-2">
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
                      Add Item
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
                  No inventory items yet. Click "Add Deal" to add your first property.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Seller</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>LM</TableHead>
                      <TableHead>AM</TableHead>
                      <TableHead>DM</TableHead>
                      <TableHead>NAH?</TableHead>
                      <TableHead className="text-right">Contract</TableHead>
                      <TableHead className="text-right">ARV</TableHead>
                      <TableHead className="text-right">Assignment</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deals?.map((deal) => (
                      <TableRow key={deal.id}>
                        <TableCell className="font-medium max-w-[150px] truncate">{deal.propertyAddress}</TableCell>
                        <TableCell>{deal.sellerName || "-"}</TableCell>
                        <TableCell>
                          <Badge className={INVENTORY_STATUS_COLORS[deal.inventoryStatus || "for_sale"]}>
                            {deal.inventoryStatus ? INVENTORY_STATUS_NAMES[deal.inventoryStatus] : "For Sale"}
                          </Badge>
                        </TableCell>
                        <TableCell>{deal.location ? LOCATION_NAMES[deal.location] : "-"}</TableCell>
                        <TableCell>{deal.leadSource ? CHANNEL_NAMES[deal.leadSource] : "-"}</TableCell>
                        <TableCell>{deal.lmName ? LM_NAMES[deal.lmName] : "-"}</TableCell>
                        <TableCell>{deal.amName ? AM_NAMES[deal.amName] : "-"}</TableCell>
                        <TableCell>{deal.dmName ? DM_NAMES[deal.dmName] : "-"}</TableCell>
                        <TableCell>{deal.isNah === "yes" ? "Yes" : "No"}</TableCell>
                        <TableCell className="text-right">{deal.contractPrice ? formatCurrency(deal.contractPrice) : "-"}</TableCell>
                        <TableCell className="text-right">{deal.estimatedArv ? formatCurrency(deal.estimatedArv) : "-"}</TableCell>
                        <TableCell className="text-right">{deal.assignmentFee ? formatCurrency(deal.assignmentFee) : "-"}</TableCell>
                        <TableCell>{deal.contractDate ? new Date(deal.contractDate).toLocaleDateString() : "-"}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (confirm("Delete this item?")) {
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

      {/* Manage Staff Dialog */}
      <Dialog open={showManageStaffDialog} onOpenChange={setShowManageStaffDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Manage Lead Gen Staff
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Add and manage lead generation team members (Cold Callers, SMS)</p>
              <Button size="sm" onClick={() => setShowAddStaffDialog(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Staff
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadGenStaff?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No lead gen staff added yet. Click "Add Staff" to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  leadGenStaff?.map((staff) => (
                    <TableRow key={staff.id}>
                      <TableCell className="font-medium">{staff.name}</TableCell>
                      <TableCell>{ROLE_NAMES[staff.roleType] || staff.roleType}</TableCell>
                      <TableCell>
                        <Badge className={staff.isActive === "true" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {staff.isActive === "true" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>{staff.startDate ? new Date(staff.startDate).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              updateStaffMutation.mutate({
                                id: staff.id,
                                isActive: staff.isActive === "true" ? "false" : "true",
                              });
                            }}
                          >
                            {staff.isActive === "true" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setDeleteConfirmation({ type: 'staff', id: staff.id, name: staff.name })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Staff Dialog */}
      <Dialog open={showAddStaffDialog} onOpenChange={setShowAddStaffDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Lead Gen Staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="Enter staff name"
                value={newStaff.name}
                onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={newStaff.roleType}
                onValueChange={(val) => setNewStaff({ ...newStaff, roleType: val as "lg_cold_caller" | "lg_sms" | "am" | "lm" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lg_cold_caller">Lead Gen (Cold Caller)</SelectItem>
                  <SelectItem value="lg_sms">Lead Gen (SMS)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (!newStaff.name.trim()) {
                  toast.error("Please enter a name");
                  return;
                }
                createStaffMutation.mutate({
                  name: newStaff.name.trim(),
                  roleType: newStaff.roleType,
                });
                setNewStaff({ name: "", roleType: "lg_cold_caller" });
                setShowAddStaffDialog(false);
              }}
              disabled={createStaffMutation.isPending}
            >
              Add Staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Markets Dialog */}
      <Dialog open={showManageMarketsDialog} onOpenChange={setShowManageMarketsDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Manage Markets
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Add and manage geographic markets</p>
              <Button size="sm" onClick={() => setShowAddMarketDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Market
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {markets?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      No markets added yet. Click "Add Market" to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  markets?.map((market) => (
                    <TableRow key={market.id}>
                      <TableCell className="font-medium">{market.name}</TableCell>
                      <TableCell>
                        <Badge className={market.isActive === "true" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {market.isActive === "true" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              updateMarketMutation.mutate({
                                id: market.id,
                                isActive: market.isActive === "true" ? "false" : "true",
                              });
                            }}
                          >
                            {market.isActive === "true" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setDeleteConfirmation({ type: 'market', id: market.id, name: market.name })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Market Dialog */}
      <Dialog open={showAddMarketDialog} onOpenChange={setShowAddMarketDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Market</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Market Name</Label>
              <Input
                placeholder="e.g., Nashville, Atlanta"
                value={newMarket.name}
                onChange={(e) => setNewMarket({ ...newMarket, name: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (!newMarket.name.trim()) {
                  toast.error("Please enter a market name");
                  return;
                }
                createMarketMutation.mutate({
                  name: newMarket.name.trim(),
                });
                setNewMarket({ name: "" });
                setShowAddMarketDialog(false);
              }}
              disabled={createMarketMutation.isPending}
            >
              Add Market
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Channels Dialog */}
      <Dialog open={showManageChannelsDialog} onOpenChange={setShowManageChannelsDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Manage Channels
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Add and manage lead generation channels</p>
              <Button size="sm" onClick={() => setShowAddChannelDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Channel
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No channels added yet. Click "Add Channel" to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  channels?.map((channel) => (
                    <TableRow key={channel.id}>
                      <TableCell className="font-medium">{channel.name}</TableCell>
                      <TableCell className="text-muted-foreground">{channel.code}</TableCell>
                      <TableCell>
                        <Badge className={channel.isActive === "true" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {channel.isActive === "true" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              updateChannelMutation.mutate({
                                id: channel.id,
                                isActive: channel.isActive === "true" ? "false" : "true",
                              });
                            }}
                          >
                            {channel.isActive === "true" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setDeleteConfirmation({ type: 'channel', id: channel.id, name: channel.name })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Channel Dialog */}
      <Dialog open={showAddChannelDialog} onOpenChange={setShowAddChannelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Channel Name</Label>
              <Input
                placeholder="e.g., Cold Calls, SMS"
                value={newChannel.name}
                onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Code (lowercase, no spaces)</Label>
              <Input
                placeholder="e.g., cold_calls, sms"
                value={newChannel.code}
                onChange={(e) => setNewChannel({ ...newChannel, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (!newChannel.name.trim() || !newChannel.code.trim()) {
                  toast.error("Please enter both name and code");
                  return;
                }
                createChannelMutation.mutate({
                  name: newChannel.name.trim(),
                  code: newChannel.code.trim(),
                });
                setNewChannel({ name: "", code: "" });
                setShowAddChannelDialog(false);
              }}
              disabled={createChannelMutation.isPending}
            >
              Add Channel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmation} onOpenChange={() => setDeleteConfirmation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Confirm Permanent Delete
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to permanently delete <strong>{deleteConfirmation?.name}</strong>?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">
                <strong>Warning:</strong> This action cannot be undone. All historical data associated with this {deleteConfirmation?.type} will be lost.
              </p>
              <p className="text-sm text-red-800 mt-2">
                Consider using the toggle button to deactivate instead, which preserves historical data.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmation(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deleteConfirmation) return;
                if (deleteConfirmation.type === 'staff') {
                  deleteStaffMutation.mutate({ id: deleteConfirmation.id });
                } else if (deleteConfirmation.type === 'market') {
                  deleteMarketMutation.mutate({ id: deleteConfirmation.id });
                } else if (deleteConfirmation.type === 'channel') {
                  deleteChannelMutation.mutate({ id: deleteConfirmation.id });
                }
                setDeleteConfirmation(null);
              }}
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
