import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Plus, Search, Home, MapPin, DollarSign, Send, Eye, Handshake,
  MoreVertical, Trash2, Edit, ChevronDown, ChevronUp, Building,
  Calendar, Phone, Mail, Facebook, Users, MessageSquare, Clock,
  CheckCircle2, XCircle, AlertCircle, Flame, Thermometer, Snowflake,
  Package, Filter, ArrowUpDown, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── TYPES ───
type PropertyStatus = "new" | "marketing" | "negotiating" | "under_contract" | "sold" | "dead";
type SendChannel = "sms" | "email" | "facebook" | "investor_base" | "other";
type OfferStatus = "pending" | "accepted" | "rejected" | "countered" | "expired";
type ShowingStatus = "scheduled" | "completed" | "cancelled" | "no_show";
type InterestLevel = "hot" | "warm" | "cold" | "none";

// ─── CONSTANTS ───
const STATUS_CONFIG: Record<PropertyStatus, { label: string; color: string; bg: string }> = {
  new: { label: "New", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  marketing: { label: "Marketing", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  negotiating: { label: "Negotiating", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  under_contract: { label: "Under Contract", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  sold: { label: "Sold", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  dead: { label: "Dead", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

const CHANNEL_CONFIG: Record<SendChannel, { label: string; icon: React.ElementType; color: string }> = {
  sms: { label: "SMS", icon: MessageSquare, color: "#3b82f6" },
  email: { label: "Email", icon: Mail, color: "#8b5cf6" },
  facebook: { label: "Facebook", icon: Facebook, color: "#1877f2" },
  investor_base: { label: "Investor Base", icon: Users, color: "#f59e0b" },
  other: { label: "Other", icon: Send, color: "#6b7280" },
};

const INTEREST_CONFIG: Record<InterestLevel, { label: string; icon: React.ElementType; color: string }> = {
  hot: { label: "Hot", icon: Flame, color: "#ef4444" },
  warm: { label: "Warm", icon: Thermometer, color: "#f59e0b" },
  cold: { label: "Cold", icon: Snowflake, color: "#3b82f6" },
  none: { label: "None", icon: XCircle, color: "#6b7280" },
};

function formatCurrency(cents: number | null | undefined): string {
  if (!cents) return "—";
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatCurrencyInput(cents: number | null | undefined): string {
  if (!cents) return "";
  return (cents / 100).toString();
}

function parseCurrencyInput(val: string): number | undefined {
  const num = parseFloat(val.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return undefined;
  return Math.round(num * 100);
}

function timeAgo(date: string | Date | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─── ADD / EDIT PROPERTY DIALOG ───
function PropertyFormDialog({
  open, onOpenChange, property, onSave, isSaving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  property?: any;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    address: property?.address || "",
    city: property?.city || "",
    state: property?.state || "",
    zip: property?.zip || "",
    propertyType: property?.propertyType || "house",
    askingPrice: formatCurrencyInput(property?.askingPrice),
    contractPrice: formatCurrencyInput(property?.contractPrice),
    arv: formatCurrencyInput(property?.arv),
    repairEstimate: formatCurrencyInput(property?.estRepairs),
    bedrooms: property?.beds?.toString() || "",
    bathrooms: property?.baths || "",
    sqft: property?.sqft?.toString() || "",
    yearBuilt: property?.yearBuilt?.toString() || "",
    sellerName: property?.sellerName || "",
    sellerPhone: property?.sellerPhone || "",
    notes: property?.notes || "",
    description: property?.description || "",
    mediaLink: property?.mediaLink || "",
    lockboxCode: property?.lockboxCode || "",
    occupancyStatus: property?.occupancyStatus || "unknown",
  });

  const handleSubmit = () => {
    if (!form.address || !form.city || !form.state) {
      toast.error("Address, City, and State are required");
      return;
    }
    onSave({
      address: form.address,
      city: form.city,
      state: form.state,
      zip: form.zip || undefined,
      propertyType: form.propertyType || undefined,
      askingPrice: parseCurrencyInput(form.askingPrice),
      contractPrice: parseCurrencyInput(form.contractPrice),
      arv: parseCurrencyInput(form.arv),
      repairEstimate: parseCurrencyInput(form.repairEstimate),
      bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
      bathrooms: form.bathrooms ? parseFloat(form.bathrooms) : undefined,
      sqft: form.sqft ? parseInt(form.sqft) : undefined,
      yearBuilt: form.yearBuilt ? parseInt(form.yearBuilt) : undefined,
      sellerName: form.sellerName || undefined,
      sellerPhone: form.sellerPhone || undefined,
      notes: form.notes || undefined,
      description: form.description || undefined,
      mediaLink: form.mediaLink || undefined,
      lockboxCode: form.lockboxCode || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" style={{ background: "var(--g-bg-surface)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--g-text-primary)" }}>
            {property ? "Edit Property" : "Add Property"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Address Section */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Property Address</label>
            <Input placeholder="Street Address *" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="City *" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <Input placeholder="State *" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              <Input placeholder="ZIP" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
            </div>
          </div>

          {/* Property Details */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Property Details</label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={form.propertyType} onValueChange={(v) => setForm({ ...form, propertyType: v })}>
                <SelectTrigger><SelectValue placeholder="Property Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="house">House</SelectItem>
                  <SelectItem value="lot">Lot</SelectItem>
                  <SelectItem value="land">Land</SelectItem>
                  <SelectItem value="multi_family">Multi-Family</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={form.occupancyStatus} onValueChange={(v) => setForm({ ...form, occupancyStatus: v })}>
                <SelectTrigger><SelectValue placeholder="Occupancy" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacant">Vacant</SelectItem>
                  <SelectItem value="occupied">Occupied</SelectItem>
                  <SelectItem value="tenant">Tenant</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Input placeholder="Beds" type="number" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} />
              <Input placeholder="Baths" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} />
              <Input placeholder="Sqft" type="number" value={form.sqft} onChange={(e) => setForm({ ...form, sqft: e.target.value })} />
              <Input placeholder="Year Built" type="number" value={form.yearBuilt} onChange={(e) => setForm({ ...form, yearBuilt: e.target.value })} />
            </div>
          </div>

          {/* Financials */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Financials</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--g-text-tertiary)" }}>$</span>
                <Input className="pl-7" placeholder="Contract Price" value={form.contractPrice} onChange={(e) => setForm({ ...form, contractPrice: e.target.value })} />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--g-text-tertiary)" }}>$</span>
                <Input className="pl-7" placeholder="Asking Price" value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: e.target.value })} />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--g-text-tertiary)" }}>$</span>
                <Input className="pl-7" placeholder="ARV" value={form.arv} onChange={(e) => setForm({ ...form, arv: e.target.value })} />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--g-text-tertiary)" }}>$</span>
                <Input className="pl-7" placeholder="Est. Repairs" value={form.repairEstimate} onChange={(e) => setForm({ ...form, repairEstimate: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Seller Info */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Seller Info</label>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Seller Name" value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} />
              <Input placeholder="Seller Phone" value={form.sellerPhone} onChange={(e) => setForm({ ...form, sellerPhone: e.target.value })} />
            </div>
          </div>

          {/* Access & Media */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Access & Media</label>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Lockbox Code" value={form.lockboxCode} onChange={(e) => setForm({ ...form, lockboxCode: e.target.value })} />
              <Input placeholder="Media Link (Google Drive, etc.)" value={form.mediaLink} onChange={(e) => setForm({ ...form, mediaLink: e.target.value })} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Description</label>
            <Textarea placeholder="Property description (visible to buyers)" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Internal Notes</label>
            <Textarea placeholder="Internal notes (not visible to buyers)" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSaving} style={{ background: "var(--g-accent)", color: "#fff" }}>
            {isSaving ? "Saving..." : property ? "Update" : "Add Property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── LOG SEND DIALOG ───
function LogSendDialog({
  open, onOpenChange, propertyId, onSave, isSaving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  propertyId: number;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [channel, setChannel] = useState<SendChannel>("sms");
  const [buyerGroup, setBuyerGroup] = useState("");
  const [recipientCount, setRecipientCount] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ background: "var(--g-bg-surface)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--g-text-primary)" }}>Log Send</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--g-text-tertiary)" }}>Channel</label>
            <Select value={channel} onValueChange={(v) => setChannel(v as SendChannel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CHANNEL_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input placeholder="Buyer Group (e.g. Nashville Buyers)" value={buyerGroup} onChange={(e) => setBuyerGroup(e.target.value)} />
          <Input placeholder="# Recipients" type="number" value={recipientCount} onChange={(e) => setRecipientCount(e.target.value)} />
          <Textarea placeholder="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              onSave({
                propertyId,
                channel,
                buyerGroup: buyerGroup || undefined,
                recipientCount: recipientCount ? parseInt(recipientCount) : undefined,
                notes: notes || undefined,
              });
            }}
            disabled={isSaving}
            style={{ background: "var(--g-accent)", color: "#fff" }}
          >
            {isSaving ? "Logging..." : "Log Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ADD OFFER DIALOG ───
function AddOfferDialog({
  open, onOpenChange, propertyId, onSave, isSaving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  propertyId: number;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    buyerName: "", buyerPhone: "", buyerEmail: "", buyerCompany: "", offerAmount: "", notes: "",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ background: "var(--g-bg-surface)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--g-text-primary)" }}>Add Offer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Buyer Name *" value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Phone" value={form.buyerPhone} onChange={(e) => setForm({ ...form, buyerPhone: e.target.value })} />
            <Input placeholder="Email" value={form.buyerEmail} onChange={(e) => setForm({ ...form, buyerEmail: e.target.value })} />
          </div>
          <Input placeholder="Company" value={form.buyerCompany} onChange={(e) => setForm({ ...form, buyerCompany: e.target.value })} />
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--g-text-tertiary)" }}>$</span>
            <Input className="pl-7" placeholder="Offer Amount *" value={form.offerAmount} onChange={(e) => setForm({ ...form, offerAmount: e.target.value })} />
          </div>
          <Textarea placeholder="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!form.buyerName || !form.offerAmount) { toast.error("Buyer name and offer amount are required"); return; }
              onSave({
                propertyId,
                buyerName: form.buyerName,
                buyerPhone: form.buyerPhone || undefined,
                buyerEmail: form.buyerEmail || undefined,
                buyerCompany: form.buyerCompany || undefined,
                offerAmount: parseCurrencyInput(form.offerAmount) || 0,
                notes: form.notes || undefined,
              });
            }}
            disabled={isSaving}
            style={{ background: "var(--g-accent)", color: "#fff" }}
          >
            {isSaving ? "Adding..." : "Add Offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ADD SHOWING DIALOG ───
function AddShowingDialog({
  open, onOpenChange, propertyId, onSave, isSaving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  propertyId: number;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    buyerName: "", buyerPhone: "", buyerCompany: "", showingDate: "", showingTime: "", notes: "",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ background: "var(--g-bg-surface)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--g-text-primary)" }}>Schedule Showing</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Buyer Name *" value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Phone" value={form.buyerPhone} onChange={(e) => setForm({ ...form, buyerPhone: e.target.value })} />
            <Input placeholder="Company" value={form.buyerCompany} onChange={(e) => setForm({ ...form, buyerCompany: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={form.showingDate} onChange={(e) => setForm({ ...form, showingDate: e.target.value })} />
            <Input type="time" value={form.showingTime} onChange={(e) => setForm({ ...form, showingTime: e.target.value })} />
          </div>
          <Textarea placeholder="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!form.buyerName || !form.showingDate) { toast.error("Buyer name and date are required"); return; }
              onSave({
                propertyId,
                buyerName: form.buyerName,
                buyerPhone: form.buyerPhone || undefined,
                buyerCompany: form.buyerCompany || undefined,
                showingDate: form.showingDate,
                showingTime: form.showingTime || undefined,
                notes: form.notes || undefined,
              });
            }}
            disabled={isSaving}
            style={{ background: "var(--g-accent)", color: "#fff" }}
          >
            {isSaving ? "Scheduling..." : "Schedule Showing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── PROPERTY DETAIL PANEL ───
function PropertyDetail({
  propertyId, onClose,
}: {
  propertyId: number;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: property, isLoading } = trpc.inventory.getPropertyById.useQuery({ propertyId });
  const [editOpen, setEditOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [showingOpen, setShowingOpen] = useState(false);

  const updateMutation = trpc.inventory.updateProperty.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); toast.success("Property updated"); setEditOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateStatusMutation = trpc.inventory.updateProperty.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); toast.success("Status updated"); },
    onError: (e) => toast.error(e.message),
  });
  const addSendMutation = trpc.inventory.addSend.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); utils.inventory.getDispoKpiSummary.invalidate(); toast.success("Send logged"); setSendOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteSendMutation = trpc.inventory.deleteSend.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); toast.success("Send deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const addOfferMutation = trpc.inventory.addOffer.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); utils.inventory.getDispoKpiSummary.invalidate(); toast.success("Offer added"); setOfferOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateOfferMutation = trpc.inventory.updateOfferStatus.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); utils.inventory.getDispoKpiSummary.invalidate(); toast.success("Offer updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteOfferMutation = trpc.inventory.deleteOffer.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); toast.success("Offer deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const addShowingMutation = trpc.inventory.addShowing.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); utils.inventory.getDispoKpiSummary.invalidate(); toast.success("Showing scheduled"); setShowingOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateShowingMutation = trpc.inventory.updateShowing.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); toast.success("Showing updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteShowingMutation = trpc.inventory.deleteShowing.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); toast.success("Showing deleted"); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
  if (!property) return <div className="p-6 text-center" style={{ color: "var(--g-text-tertiary)" }}>Property not found</div>;

  const statusCfg = STATUS_CONFIG[property.status as PropertyStatus] || STATUS_CONFIG.new;
  const spread = property.askingPrice && property.contractPrice ? property.askingPrice - property.contractPrice : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between" style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge style={{ background: statusCfg.bg, color: statusCfg.color, border: "none" }}>{statusCfg.label}</Badge>
            <Select
              value={property.status}
              onValueChange={(v) => updateStatusMutation.mutate({ propertyId, status: v as any })}
            >
              <SelectTrigger className="h-6 w-6 p-0 border-none" style={{ background: "transparent" }}>
                <ChevronDown className="h-3 w-3" style={{ color: "var(--g-text-tertiary)" }} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <h2 className="text-lg font-bold truncate" style={{ color: "var(--g-text-primary)" }}>{property.address}</h2>
          <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
            {property.city}, {property.state} {property.zip}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Financial Summary */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Contract", value: formatCurrency(property.contractPrice) },
            { label: "Asking", value: formatCurrency(property.askingPrice) },
            { label: "ARV", value: formatCurrency(property.arv) },
            { label: "Spread", value: spread ? formatCurrency(spread) : "—" },
          ].map((item) => (
            <div key={item.label} className="rounded-lg px-3 py-2" style={{ background: "var(--g-bg-elevated)", border: "1px solid var(--g-border-subtle)" }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>{item.label}</div>
              <div className="text-base font-bold" style={{ color: "var(--g-text-primary)" }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Property Details */}
        <div className="rounded-lg p-3" style={{ background: "var(--g-bg-elevated)", border: "1px solid var(--g-border-subtle)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--g-text-tertiary)" }}>Details</div>
          <div className="grid grid-cols-4 gap-2 text-sm">
            {property.beds != null && <div><span style={{ color: "var(--g-text-tertiary)" }}>Beds:</span> <span style={{ color: "var(--g-text-primary)" }}>{property.beds}</span></div>}
            {property.baths && <div><span style={{ color: "var(--g-text-tertiary)" }}>Baths:</span> <span style={{ color: "var(--g-text-primary)" }}>{property.baths}</span></div>}
            {property.sqft && <div><span style={{ color: "var(--g-text-tertiary)" }}>Sqft:</span> <span style={{ color: "var(--g-text-primary)" }}>{property.sqft.toLocaleString()}</span></div>}
            {property.yearBuilt && <div><span style={{ color: "var(--g-text-tertiary)" }}>Built:</span> <span style={{ color: "var(--g-text-primary)" }}>{property.yearBuilt}</span></div>}
          </div>
          {property.sellerName && (
            <div className="mt-2 text-sm">
              <span style={{ color: "var(--g-text-tertiary)" }}>Seller:</span>{" "}
              <span style={{ color: "var(--g-text-primary)" }}>{property.sellerName}</span>
              {property.sellerPhone && <span style={{ color: "var(--g-text-secondary)" }}> ({property.sellerPhone})</span>}
            </div>
          )}
          {property.lockboxCode && (
            <div className="mt-1 text-sm">
              <span style={{ color: "var(--g-text-tertiary)" }}>Lockbox:</span>{" "}
              <span style={{ color: "var(--g-text-primary)" }}>{property.lockboxCode}</span>
            </div>
          )}
          {property.notes && (
            <div className="mt-2 text-sm p-2 rounded" style={{ background: "var(--g-bg-inset)", color: "var(--g-text-secondary)" }}>
              {property.notes}
            </div>
          )}
        </div>

        {/* Activity Tabs */}
        <Tabs defaultValue="sends" className="w-full">
          <TabsList className="w-full grid grid-cols-3" style={{ background: "var(--g-bg-elevated)" }}>
            <TabsTrigger value="sends" className="text-xs">
              <Send className="h-3 w-3 mr-1" /> Sends ({property.sends?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="offers" className="text-xs">
              <DollarSign className="h-3 w-3 mr-1" /> Offers ({property.offers?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="showings" className="text-xs">
              <Eye className="h-3 w-3 mr-1" /> Showings ({property.showings?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Sends Tab */}
          <TabsContent value="sends" className="mt-3 space-y-2">
            <Button size="sm" variant="outline" className="w-full" onClick={() => setSendOpen(true)}>
              <Plus className="h-3 w-3 mr-1" /> Log Send
            </Button>
            {property.sends?.length === 0 && (
              <div className="text-center py-4 text-sm" style={{ color: "var(--g-text-tertiary)" }}>No sends logged yet</div>
            )}
            {property.sends?.map((send: any) => {
              const ch = CHANNEL_CONFIG[send.channel as SendChannel] || CHANNEL_CONFIG.other;
              const ChIcon = ch.icon;
              return (
                <div key={send.id} className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: "var(--g-bg-elevated)", border: "1px solid var(--g-border-subtle)" }}>
                  <div className="flex items-center gap-2">
                    <ChIcon className="h-3.5 w-3.5" style={{ color: ch.color }} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>
                        {ch.label}{send.buyerGroup ? ` → ${send.buyerGroup}` : ""}
                      </div>
                      <div className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                        {send.recipientCount ? `${send.recipientCount} recipients · ` : ""}{timeAgo(send.sentAt)}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteSendMutation.mutate({ sendId: send.id })}>
                    <Trash2 className="h-3 w-3" style={{ color: "var(--g-text-tertiary)" }} />
                  </Button>
                </div>
              );
            })}
          </TabsContent>

          {/* Offers Tab */}
          <TabsContent value="offers" className="mt-3 space-y-2">
            <Button size="sm" variant="outline" className="w-full" onClick={() => setOfferOpen(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add Offer
            </Button>
            {property.offers?.length === 0 && (
              <div className="text-center py-4 text-sm" style={{ color: "var(--g-text-tertiary)" }}>No offers received yet</div>
            )}
            {property.offers?.map((offer: any) => {
              const statusColors: Record<string, string> = {
                pending: "#f59e0b", accepted: "#22c55e", rejected: "#ef4444", countered: "#8b5cf6", expired: "#6b7280",
              };
              return (
                <div key={offer.id} className="rounded-lg px-3 py-2" style={{ background: "var(--g-bg-elevated)", border: "1px solid var(--g-border-subtle)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: "var(--g-text-primary)" }}>{offer.buyerName}</span>
                      {offer.buyerCompany && <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>({offer.buyerCompany})</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Select
                        value={offer.status}
                        onValueChange={(v) => updateOfferMutation.mutate({ offerId: offer.id, status: v as OfferStatus })}
                      >
                        <SelectTrigger className="h-6 text-xs border-none px-2" style={{ background: "transparent", color: statusColors[offer.status] || "#6b7280" }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="accepted">Accepted</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                          <SelectItem value="countered">Countered</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" onClick={() => deleteOfferMutation.mutate({ offerId: offer.id })}>
                        <Trash2 className="h-3 w-3" style={{ color: "var(--g-text-tertiary)" }} />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold" style={{ color: "#22c55e" }}>{formatCurrency(offer.offerAmount)}</span>
                    <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>{timeAgo(offer.offeredAt)}</span>
                  </div>
                  {offer.notes && <div className="text-xs mt-1" style={{ color: "var(--g-text-secondary)" }}>{offer.notes}</div>}
                </div>
              );
            })}
          </TabsContent>

          {/* Showings Tab */}
          <TabsContent value="showings" className="mt-3 space-y-2">
            <Button size="sm" variant="outline" className="w-full" onClick={() => setShowingOpen(true)}>
              <Plus className="h-3 w-3 mr-1" /> Schedule Showing
            </Button>
            {property.showings?.length === 0 && (
              <div className="text-center py-4 text-sm" style={{ color: "var(--g-text-tertiary)" }}>No showings scheduled</div>
            )}
            {property.showings?.map((showing: any) => {
              const statusIcons: Record<string, { icon: React.ElementType; color: string }> = {
                scheduled: { icon: Clock, color: "#3b82f6" },
                completed: { icon: CheckCircle2, color: "#22c55e" },
                cancelled: { icon: XCircle, color: "#ef4444" },
                no_show: { icon: AlertCircle, color: "#f59e0b" },
              };
              const si = statusIcons[showing.status] || statusIcons.scheduled;
              const SIcon = si.icon;
              const interest = showing.interestLevel ? INTEREST_CONFIG[showing.interestLevel as InterestLevel] : null;
              return (
                <div key={showing.id} className="rounded-lg px-3 py-2" style={{ background: "var(--g-bg-elevated)", border: "1px solid var(--g-border-subtle)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <SIcon className="h-3.5 w-3.5" style={{ color: si.color }} />
                      <span className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>{showing.buyerName}</span>
                      {interest && (
                        <Badge className="text-[10px] px-1.5 py-0" style={{ background: `${interest.color}20`, color: interest.color, border: "none" }}>
                          {interest.label}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Select
                        value={showing.status}
                        onValueChange={(v) => updateShowingMutation.mutate({ showingId: showing.id, status: v as ShowingStatus })}
                      >
                        <SelectTrigger className="h-6 text-xs border-none px-2" style={{ background: "transparent" }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="no_show">No Show</SelectItem>
                        </SelectContent>
                      </Select>
                      {showing.status === "completed" && (
                        <Select
                          value={showing.interestLevel || "none"}
                          onValueChange={(v) => updateShowingMutation.mutate({ showingId: showing.id, interestLevel: v as InterestLevel })}
                        >
                          <SelectTrigger className="h-6 text-xs border-none px-2" style={{ background: "transparent" }}>
                            <SelectValue placeholder="Interest" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hot">Hot 🔥</SelectItem>
                            <SelectItem value="warm">Warm</SelectItem>
                            <SelectItem value="cold">Cold</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => deleteShowingMutation.mutate({ showingId: showing.id })}>
                        <Trash2 className="h-3 w-3" style={{ color: "var(--g-text-tertiary)" }} />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                    <Calendar className="h-3 w-3 inline mr-1" />
                    {new Date(showing.showingDate).toLocaleDateString()}{showing.showingTime ? ` at ${showing.showingTime}` : ""}
                  </div>
                  {showing.feedback && <div className="text-xs mt-1 p-1.5 rounded" style={{ background: "var(--g-bg-inset)", color: "var(--g-text-secondary)" }}>{showing.feedback}</div>}
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      {editOpen && (
        <PropertyFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          property={property}
          onSave={(data) => updateMutation.mutate({ propertyId, ...data })}
          isSaving={updateMutation.isPending}
        />
      )}
      {sendOpen && <LogSendDialog open={sendOpen} onOpenChange={setSendOpen} propertyId={propertyId} onSave={(d) => addSendMutation.mutate(d)} isSaving={addSendMutation.isPending} />}
      {offerOpen && <AddOfferDialog open={offerOpen} onOpenChange={setOfferOpen} propertyId={propertyId} onSave={(d) => addOfferMutation.mutate(d)} isSaving={addOfferMutation.isPending} />}
      {showingOpen && <AddShowingDialog open={showingOpen} onOpenChange={setShowingOpen} propertyId={propertyId} onSave={(d) => addShowingMutation.mutate(d)} isSaving={addShowingMutation.isPending} />}
    </div>
  );
}

// ─── PROPERTY CARD ───
function PropertyCard({
  property, onClick, isSelected,
}: {
  property: any;
  onClick: () => void;
  isSelected: boolean;
}) {
  const statusCfg = STATUS_CONFIG[property.status as PropertyStatus] || STATUS_CONFIG.new;
  const activity = property._activity || {};

  return (
    <div
      onClick={onClick}
      className="rounded-xl p-4 cursor-pointer transition-all duration-200 hover:translate-y-[-1px]"
      style={{
        background: isSelected ? "var(--g-accent-soft)" : "var(--g-bg-card)",
        border: isSelected ? "1px solid var(--g-accent)" : "1px solid var(--g-border-subtle)",
        boxShadow: isSelected ? "var(--g-shadow-md)" : "var(--g-shadow-card)",
      }}
    >
      {/* Status + Type */}
      <div className="flex items-center justify-between mb-2">
        <Badge style={{ background: statusCfg.bg, color: statusCfg.color, border: "none", fontSize: "10px" }}>{statusCfg.label}</Badge>
        <span className="text-[10px] font-medium uppercase" style={{ color: "var(--g-text-tertiary)" }}>
          {property.propertyType?.replace("_", " ") || "House"}
        </span>
      </div>

      {/* Address */}
      <h3 className="text-sm font-bold mb-0.5 truncate" style={{ color: "var(--g-text-primary)" }}>{property.address}</h3>
      <p className="text-xs mb-3 truncate" style={{ color: "var(--g-text-secondary)" }}>
        {property.city}, {property.state} {property.zip}
      </p>

      {/* Price Row */}
      <div className="flex items-center gap-3 mb-3">
        {property.askingPrice && (
          <div>
            <div className="text-[10px] uppercase" style={{ color: "var(--g-text-tertiary)" }}>Asking</div>
            <div className="text-sm font-bold" style={{ color: "var(--g-text-primary)" }}>{formatCurrency(property.askingPrice)}</div>
          </div>
        )}
        {property.contractPrice && (
          <div>
            <div className="text-[10px] uppercase" style={{ color: "var(--g-text-tertiary)" }}>Contract</div>
            <div className="text-sm font-bold" style={{ color: "var(--g-text-primary)" }}>{formatCurrency(property.contractPrice)}</div>
          </div>
        )}
      </div>

      {/* Activity Indicators */}
      <div className="flex items-center gap-3 pt-2" style={{ borderTop: "1px solid var(--g-border-subtle)" }}>
        <div className="flex items-center gap-1" title="Sends">
          <Send className="h-3 w-3" style={{ color: activity.sendCount > 0 ? "#3b82f6" : "var(--g-text-tertiary)" }} />
          <span className="text-xs font-medium" style={{ color: activity.sendCount > 0 ? "#3b82f6" : "var(--g-text-tertiary)" }}>
            {activity.sendCount || 0}
          </span>
        </div>
        <div className="flex items-center gap-1" title={`${activity.totalRecipients || 0} total recipients`}>
          <Users className="h-3 w-3" style={{ color: activity.totalRecipients > 0 ? "#8b5cf6" : "var(--g-text-tertiary)" }} />
          <span className="text-xs font-medium" style={{ color: activity.totalRecipients > 0 ? "#8b5cf6" : "var(--g-text-tertiary)" }}>
            {activity.totalRecipients || 0}
          </span>
        </div>
        <div className="flex items-center gap-1" title="Offers">
          <DollarSign className="h-3 w-3" style={{ color: activity.offerCount > 0 ? "#f59e0b" : "var(--g-text-tertiary)" }} />
          <span className="text-xs font-medium" style={{ color: activity.offerCount > 0 ? "#f59e0b" : "var(--g-text-tertiary)" }}>
            {activity.offerCount || 0}
          </span>
        </div>
        <div className="flex items-center gap-1" title="Showings">
          <Eye className="h-3 w-3" style={{ color: activity.showingCount > 0 ? "#22c55e" : "var(--g-text-tertiary)" }} />
          <span className="text-xs font-medium" style={{ color: activity.showingCount > 0 ? "#22c55e" : "var(--g-text-tertiary)" }}>
            {activity.showingCount || 0}
          </span>
        </div>
        {activity.highestOffer > 0 && (
          <div className="ml-auto text-xs font-semibold" style={{ color: "#22c55e" }}>
            Best: {formatCurrency(activity.highestOffer)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN INVENTORY PAGE ───
export default function Inventory() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data, isLoading } = trpc.inventory.getProperties.useQuery(
    { status: statusFilter, search: search || undefined, limit: 100 },
    { refetchInterval: 60000 }
  );

  const createMutation = trpc.inventory.createProperty.useMutation({
    onSuccess: (result) => {
      utils.inventory.getProperties.invalidate();
      toast.success("Property added");
      setAddOpen(false);
      setSelectedPropertyId(result.id);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.inventory.deleteProperty.useMutation({
    onSuccess: () => {
      utils.inventory.getProperties.invalidate();
      toast.success("Property deleted");
      setDeleteConfirmId(null);
      if (selectedPropertyId === deleteConfirmId) setSelectedPropertyId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const properties = data?.items || [];
  const total = data?.total || 0;

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: total };
    properties.forEach((p: any) => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });
    return counts;
  }, [properties, total]);

  return (
    <div className="h-[calc(100vh-var(--g-topnav-h,56px))] flex flex-col overflow-hidden" style={{ background: "var(--g-bg-base)" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--g-text-primary)" }}>
            <Package className="h-5 w-5 inline mr-2" style={{ color: "var(--g-accent)" }} />
            Inventory
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>
            {total} {total === 1 ? "property" : "properties"}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm" style={{ background: "var(--g-accent)", color: "#fff" }}>
          <Plus className="h-4 w-4 mr-1" /> Add Property
        </Button>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--g-text-tertiary)" }} />
          <Input
            className="pl-9"
            placeholder="Search properties..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(["all", "new", "marketing", "negotiating", "under_contract", "sold", "dead"] as const).map((s) => {
            const cfg = s === "all" ? { label: "All", color: "var(--g-text-primary)", bg: "var(--g-bg-elevated)" } : STATUS_CONFIG[s];
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all"
                style={{
                  background: isActive ? (s === "all" ? "var(--g-accent-soft)" : cfg.bg) : "transparent",
                  color: isActive ? (s === "all" ? "var(--g-accent)" : cfg.color) : "var(--g-text-tertiary)",
                  border: isActive ? `1px solid ${s === "all" ? "var(--g-accent)" : cfg.color}40` : "1px solid transparent",
                }}
              >
                {cfg.label} {statusCounts[s] ? `(${statusCounts[s]})` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Property List */}
        <div className={`${selectedPropertyId ? "w-1/2 border-r" : "w-full"} overflow-y-auto p-4 transition-all duration-300`} style={{ borderColor: "var(--g-border-subtle)" }}>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
            </div>
          ) : properties.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Package className="h-12 w-12 mb-3" style={{ color: "var(--g-text-tertiary)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--g-text-secondary)" }}>No properties found</p>
              <p className="text-xs mt-1" style={{ color: "var(--g-text-tertiary)" }}>Add your first property to get started</p>
              <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)} style={{ background: "var(--g-accent)", color: "#fff" }}>
                <Plus className="h-4 w-4 mr-1" /> Add Property
              </Button>
            </div>
          ) : (
            <div className={`grid gap-3 ${selectedPropertyId ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
              {properties.map((p: any) => (
                <div key={p.id} className="relative group">
                  <PropertyCard
                    property={p}
                    onClick={() => setSelectedPropertyId(p.id)}
                    isSelected={selectedPropertyId === p.id}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setSelectedPropertyId(p.id)}>
                        <Eye className="h-4 w-4 mr-2" /> View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteConfirmId(p.id)} className="text-red-500">
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedPropertyId && (
          <div className="w-1/2 overflow-hidden" style={{ background: "var(--g-bg-surface)" }}>
            <PropertyDetail
              key={selectedPropertyId}
              propertyId={selectedPropertyId}
              onClose={() => setSelectedPropertyId(null)}
            />
          </div>
        )}
      </div>

      {/* Add Property Dialog */}
      {addOpen && (
        <PropertyFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onSave={(data) => createMutation.mutate(data)}
          isSaving={createMutation.isPending}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent style={{ background: "var(--g-bg-surface)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--g-text-primary)" }}>Delete Property?</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
            This will permanently delete this property and all its sends, offers, and showings. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate({ propertyId: deleteConfirmId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
