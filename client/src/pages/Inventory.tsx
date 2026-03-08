import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Plus, Search, Home, MapPin, DollarSign, Send, Eye, Handshake,
  MoreVertical, Trash2, Edit, ChevronDown, ChevronUp, Building, LayoutGrid, List as ListIcon,
  Calendar, Phone, Mail, Facebook, Users, MessageSquare, Clock,
  CheckCircle2, XCircle, AlertCircle, Flame, Thermometer, Snowflake,
  Package, Filter, ArrowUpDown, X, Star, Activity, FileText,
  Megaphone, UserPlus, Copy, ExternalLink, Hash, TrendingUp,
  CircleDot, Zap, Target, BarChart3, ArrowRight, RefreshCw, Upload, Download, FileUp,
  ChevronRight, Bookmark, Tag, Globe, Layers, StickyNote, Bot, Sparkles, Loader2,
  Lightbulb, MessageCircle, CheckSquare, Square,
} from "lucide-react";
import { Streamdown } from "streamdown";
import DealBlastTab from "@/components/DealBlastTab";
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
import { SearchableSelect } from "@/components/ui/searchable-select";

// ─── TYPES ───
type PropertyStatus = "lead" | "apt_set" | "offer_made" | "under_contract" | "marketing" | "buyer_negotiating" | "closing" | "closed" | "follow_up" | "dead" | "new" | "negotiating" | "sold" | "qualified";
type SendChannel = "sms" | "email" | "facebook" | "investor_base" | "other";
type OfferStatus = "pending" | "accepted" | "rejected" | "countered" | "expired";
type ShowingStatus = "scheduled" | "completed" | "cancelled" | "no_show";
type InterestLevel = "hot" | "warm" | "cold" | "none";
type BuyerStatus = "matched" | "sent" | "interested" | "offered" | "passed" | "accepted" | "skipped";

// ─── CONSTANTS ───
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon?: string }> = {
  lead: { label: "Lead", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  apt_set: { label: "Apt Set", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  qualified: { label: "Apt Set", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  offer_made: { label: "Offer Made", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  under_contract: { label: "Under Contract", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  marketing: { label: "Marketing", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  buyer_negotiating: { label: "Buyer Negotiating", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  closing: { label: "Closing", color: "#14b8a6", bg: "rgba(20,184,166,0.12)" },
  closed: { label: "Closed", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  follow_up: { label: "Follow Up", color: "#a855f7", bg: "rgba(168,85,247,0.12)" },
  dead: { label: "Dead", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  new: { label: "Lead", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  negotiating: { label: "Buyer Negotiating", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  sold: { label: "Closed", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
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

const BUYER_STATUS_CONFIG: Record<BuyerStatus, { label: string; color: string; bg: string }> = {
  matched: { label: "Matched", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  sent: { label: "Sent", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  interested: { label: "Interested", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  offered: { label: "Offered", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  passed: { label: "Passed", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
  accepted: { label: "Accepted", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  skipped: { label: "Skipped", color: "#9ca3af", bg: "rgba(156,163,175,0.12)" },
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

function daysOnMarket(date: string | Date | null): number {
  if (!date) return 0;
  const d = new Date(date);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}

function heatColor(dom: number): string {
  if (dom <= 3) return "#22c55e";
  if (dom <= 7) return "#f59e0b";
  if (dom <= 14) return "#f97316";
  return "#ef4444";
}

// ─── ADD / EDIT PROPERTY DIALOG ───
function PropertyFormDialog({
  open, onOpenChange, property, onSave, isSaving, kpiMarkets, kpiSources,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  property?: any;
  onSave: (data: any) => void;
  isSaving: boolean;
  kpiMarkets?: any[];
  kpiSources?: any[];
}) {
  const [form, setForm] = useState({
    address: property?.address || "",
    city: property?.city || "",
    state: property?.state || "",
    zip: property?.zip || "",
    propertyType: property?.propertyType || "house",
    askingPrice: formatCurrencyInput(property?.askingPrice),
    acceptedOffer: formatCurrencyInput(property?.acceptedOffer),
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
    projectType: property?.projectType || "",
    market: property?.market || "",
    opportunitySource: property?.opportunitySource || "",
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
      acceptedOffer: parseCurrencyInput(form.acceptedOffer),
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
      projectType: form.projectType || undefined,
      market: form.market || undefined,
      opportunitySource: form.opportunitySource || undefined,
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
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Property Address</label>
            <Input placeholder="Street Address *" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="City *" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <Input placeholder="State *" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              <Input placeholder="ZIP" value={form.zip} onChange={(e) => {
                const newZip = e.target.value;
                const update: any = { zip: newZip };
                // Fix #9: Auto-populate market from zip code
                if (newZip.length >= 5 && kpiMarkets) {
                  const matchedMarket = kpiMarkets.find((m: any) => 
                    m.zipCodes && Array.isArray(m.zipCodes) && m.zipCodes.includes(newZip)
                  );
                  if (matchedMarket && !form.market) {
                    update.market = matchedMarket.name;
                  }
                }
                setForm({ ...form, ...update });
              }} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Property Details</label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={form.propertyType} onValueChange={(v) => setForm({ ...form, propertyType: v })}>
                <SelectTrigger><SelectValue placeholder="Property Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="house">House</SelectItem>
                  <SelectItem value="lot">Lot</SelectItem>
                  <SelectItem value="land">Land</SelectItem>
                  <SelectItem value="multi_family">Multi Family</SelectItem>
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
                <Input className="pl-7" placeholder="Accepted Offer" value={form.acceptedOffer} onChange={(e) => setForm({ ...form, acceptedOffer: e.target.value })} />
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
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Seller Info</label>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Seller Name" value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} />
              <Input placeholder="Seller Phone" value={form.sellerPhone} onChange={(e) => setForm({ ...form, sellerPhone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Deal Info</label>
            <div className="grid grid-cols-3 gap-2">
              <SearchableSelect
                placeholder="Project Type (multi-select)"
                value={form.projectType || ""}
                onValueChange={(v) => setForm({ ...form, projectType: v })}
                options={[
                  { value: "flipper", label: "Flipper" },
                  { value: "landlord", label: "Landlord" },
                  { value: "builder", label: "Builder" },
                  { value: "multi_family", label: "Multi Family" },
                  { value: "turn_key", label: "Turn Key" },
                ]}
              />
              <SearchableSelect
                placeholder="Market"
                value={form.market || ""}
                onValueChange={(v) => setForm({ ...form, market: v })}
                options={(kpiMarkets || []).map((m: any) => ({ value: m.name, label: m.name }))}
                emptyText="No markets configured"
              />
              <SearchableSelect
                placeholder="Source"
                value={form.opportunitySource || ""}
                onValueChange={(v) => setForm({ ...form, opportunitySource: v })}
                options={(kpiSources || []).map((s: any) => ({ value: s.name, label: s.name }))}
                emptyText="No sources configured"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>Access & Media</label>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Lockbox Code" value={form.lockboxCode} onChange={(e) => setForm({ ...form, lockboxCode: e.target.value })} />
              <Input placeholder="Media Link (Google Drive, etc.)" value={form.mediaLink} onChange={(e) => setForm({ ...form, mediaLink: e.target.value })} />
            </div>
          </div>
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

// ─── GHL CONTACT AUTOCOMPLETE ───
function GhlContactAutocomplete({
  value, onChange, onSelect, placeholder = "Buyer Name *",
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (contact: { name: string; phone?: string; email?: string; company?: string }) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<Array<{ id: string; name: string; phone?: string; email?: string; company?: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchMutation = trpc.coachActions.searchContacts.useMutation();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (text: string) => {
    onChange(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length >= 2) {
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await searchMutation.mutateAsync({ query: text });
          setSuggestions((results as any[]).slice(0, 5));
          setShowSuggestions(true);
        } catch { setSuggestions([]); }
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
          style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
        >
          {suggestions.map((c) => (
            <button
              key={c.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              style={{ color: "var(--g-text-primary)" }}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({ name: c.name, phone: c.phone, email: c.email, company: c.company });
                setShowSuggestions(false);
              }}
            >
              <div className="font-medium">{c.name}</div>
              {(c.phone || c.email) && (
                <div className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                  {c.phone}{c.phone && c.email ? " · " : ""}{c.email}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
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
          <GhlContactAutocomplete
            value={form.buyerName}
            onChange={(v) => setForm({ ...form, buyerName: v })}
            onSelect={(c) => setForm({ ...form, buyerName: c.name, buyerPhone: c.phone || form.buyerPhone, buyerEmail: c.email || form.buyerEmail, buyerCompany: c.company || form.buyerCompany })}
          />
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
          <GhlContactAutocomplete
            value={form.buyerName}
            onChange={(v) => setForm({ ...form, buyerName: v })}
            onSelect={(c) => setForm({ ...form, buyerName: c.name, buyerPhone: c.phone || form.buyerPhone, buyerCompany: c.company || form.buyerCompany })}
          />
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

// ─── ADD BUYER DIALOG ───
function AddBuyerDialog({
  open, onOpenChange, propertyId, onSave, isSaving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  propertyId: number;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    buyerName: "", buyerPhone: "", buyerEmail: "", buyerCompany: "",
    buyerStrategy: "", isVip: false, notes: "",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ background: "var(--g-bg-surface)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--g-text-primary)" }}>Add Buyer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <GhlContactAutocomplete
            value={form.buyerName}
            onChange={(v) => setForm({ ...form, buyerName: v })}
            onSelect={(c) => setForm({ ...form, buyerName: c.name, buyerPhone: c.phone || form.buyerPhone, buyerEmail: c.email || form.buyerEmail, buyerCompany: c.company || form.buyerCompany })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Phone" value={form.buyerPhone} onChange={(e) => setForm({ ...form, buyerPhone: e.target.value })} />
            <Input placeholder="Email" value={form.buyerEmail} onChange={(e) => setForm({ ...form, buyerEmail: e.target.value })} />
          </div>
          <Input placeholder="Company" value={form.buyerCompany} onChange={(e) => setForm({ ...form, buyerCompany: e.target.value })} />
          <Select value={form.buyerStrategy || "flip"} onValueChange={(v) => setForm({ ...form, buyerStrategy: v })}>
            <SelectTrigger><SelectValue placeholder="Strategy" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="flip">Flip</SelectItem>
              <SelectItem value="rental">Rental</SelectItem>
              <SelectItem value="brrrr">BRRRR</SelectItem>
              <SelectItem value="wholesale">Wholesale</SelectItem>
              <SelectItem value="owner_occupant">Owner Occupant</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--g-text-secondary)" }}>
            <input type="checkbox" checked={form.isVip} onChange={(e) => setForm({ ...form, isVip: e.target.checked })} className="rounded" />
            VIP Buyer (priority notifications)
          </label>
          <Textarea placeholder="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!form.buyerName) { toast.error("Buyer name is required"); return; }
              onSave({
                propertyId,
                buyerName: form.buyerName,
                buyerPhone: form.buyerPhone || undefined,
                buyerEmail: form.buyerEmail || undefined,
                buyerCompany: form.buyerCompany || undefined,
                buyerStrategy: form.buyerStrategy || undefined,
                isVip: form.isVip,
                notes: form.notes || undefined,
              });
            }}
            disabled={isSaving}
            style={{ background: "var(--g-accent)", color: "#fff" }}
          >
            {isSaving ? "Adding..." : "Add Buyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── OVERVIEW TAB ───
function OverviewTab({ property }: { property: any }) {
  const statusCfg = STATUS_CONFIG[property.status as PropertyStatus] || STATUS_CONFIG.new;
  const spread = property.acceptedOffer && property.contractPrice ? property.acceptedOffer - property.contractPrice : (property.askingPrice && property.contractPrice ? property.askingPrice - property.contractPrice : null);
  const spreadLabel = property.acceptedOffer ? "Spread" : "Est. Spread";
  const dom = daysOnMarket(property.createdAt);

  return (
    <div className="space-y-4">
      {/* Financial Summary */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Contract", value: formatCurrency(property.contractPrice), color: "var(--g-text-primary)" },
          { label: "Asking", value: formatCurrency(property.askingPrice), color: "var(--g-accent)" },
          { label: "Accepted Offer", value: formatCurrency(property.acceptedOffer), color: "#a855f7" },
          { label: "ARV", value: formatCurrency(property.arv), color: "#3b82f6" },
          { label: spreadLabel, value: spread ? formatCurrency(spread) : "—", color: spread && spread > 0 ? "#22c55e" : "var(--g-text-tertiary)" },
          { label: "Est. Repairs", value: formatCurrency(property.estRepairs), color: "#f97316" },
          { label: "Days on Market", value: `${dom}`, color: heatColor(dom) },
        ].map((item) => (
          <div key={item.label} className="rounded-lg px-3 py-2" style={{ background: "var(--g-bg-elevated)", border: "1px solid var(--g-border-subtle)" }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>{item.label}</div>
            <div className="text-base font-bold" style={{ color: item.color }}>{item.value}</div>
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
            {property.sellerPhone && (() => {
              const phone = property.sellerPhone;
              const masked = phone.length > 4 ? "•••-•••-" + phone.slice(-4) : phone;
              return (
                <span 
                  style={{ color: "var(--g-text-secondary)", cursor: "pointer" }} 
                  title="Click to reveal"
                  onClick={(e) => {
                    e.stopPropagation();
                    const el = e.currentTarget;
                    el.textContent = el.textContent?.includes("•") ? ` (${phone})` : ` (${masked})`;
                  }}
                >
                  {` (${masked})`}
                </span>
              );
            })()}
          </div>
        )}
        {property.lockboxCode && (
          <div className="mt-1 text-sm">
            <span style={{ color: "var(--g-text-tertiary)" }}>Lockbox:</span>{" "}
            <span style={{ color: "var(--g-text-primary)" }}>{property.lockboxCode}</span>
          </div>
        )}
        {/* Source & Deal Info */}
        <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
          {property.opportunitySource && (
            <div><span style={{ color: "var(--g-text-tertiary)" }}>Source:</span> <span style={{ color: "var(--g-text-primary)" }}>{property.opportunitySource}</span></div>
          )}
          {property.leadSource && (
            <div><span style={{ color: "var(--g-text-tertiary)" }}>Lead Source:</span> <span style={{ color: "var(--g-text-primary)" }}>{property.leadSource}</span></div>
          )}
          {property.projectType && (
            <div><span style={{ color: "var(--g-text-tertiary)" }}>Project Type:</span> <span style={{ color: "var(--g-text-primary)" }}>{property.projectType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span></div>
          )}
          {property.market && (
            <div><span style={{ color: "var(--g-text-tertiary)" }}>Market:</span> <span style={{ color: "var(--g-text-primary)" }}>{property.market}</span></div>
          )}
        </div>
        {property.ghlContactId && (
          <div className="mt-2 text-sm">
            <span style={{ color: "var(--g-text-tertiary)" }}>GHL Contact:</span>{" "}
            <a href={`https://app.gohighlevel.com/contacts/detail/${property.ghlContactId}`} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--g-accent)" }}>
              View in GHL
            </a>
          </div>
        )}
        {property.description && (
          <div className="mt-2 text-sm p-2 rounded" style={{ background: "var(--g-bg-inset)", color: "var(--g-text-secondary)" }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--g-text-tertiary)" }}>Description</div>
            {property.description}
          </div>
        )}
        {property.notes && (
          <div className="mt-2 text-sm p-2 rounded" style={{ background: "var(--g-bg-inset)", color: "var(--g-text-secondary)" }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--g-text-tertiary)" }}>Internal Notes</div>
            {property.notes}
          </div>
        )}
      </div>

      {/* Milestone Progress */}
      <div className="rounded-lg p-3" style={{ background: "var(--g-bg-elevated)", border: "1px solid var(--g-border-subtle)" }}>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--g-text-tertiary)" }}>Deal Progress</div>
        <div className="flex items-center gap-1">
          {[
            { label: "Contacted", ts: property.contactedAt, color: "#8b5cf6" },
            { label: "Apt Set", ts: property.aptSetAt || (property.aptEverSet ? property.updatedAt : null), color: "#22c55e" },
            { label: "Offer Made", ts: property.offerMadeAt || (property.offerEverMade ? property.updatedAt : null), color: "#f59e0b" },
            { label: "Under Contract", ts: property.underContractAt || (property.everUnderContract ? property.updatedAt : null), color: "#3b82f6" },
            { label: "Closed", ts: property.closedAt || (property.everClosed ? property.updatedAt : null), color: "#10b981" },
          ].map((m, idx, arr) => {
            const reached = !!m.ts;
            return (
              <div key={m.label} className="flex items-center gap-1">
                {idx > 0 && <div className="w-4 h-px" style={{ background: reached ? m.color : "var(--g-border-subtle)" }} />}
                <div className="h-3 w-3 rounded-full shrink-0" style={{ background: reached ? m.color : "var(--g-border-subtle)" }} />
                <span className="text-[10px] whitespace-nowrap" style={{ color: reached ? m.color : "var(--g-text-tertiary)" }}>{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* AI Suggestions */}
      <AISuggestionsWidget propertyId={property.id} />
    </div>
  );
}

// ─── AI SUGGESTIONS WIDGET ───
function AISuggestionsWidget({ propertyId }: { propertyId: number }) {
  const { data, isLoading, refetch, isFetching } = trpc.inventory.getPropertySuggestions.useQuery(
    { propertyId },
    { staleTime: 300000, refetchOnWindowFocus: false }
  );

  const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
    high: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", border: "rgba(239,68,68,0.25)" },
    medium: { bg: "rgba(234,179,8,0.1)", text: "#eab308", border: "rgba(234,179,8,0.25)" },
    low: { bg: "rgba(59,130,246,0.1)", text: "#3b82f6", border: "rgba(59,130,246,0.25)" },
  };

  const actionIcons: Record<string, typeof Lightbulb> = {
    update_property_price: DollarSign,
    update_property_status: Activity,
    add_property_offer: Handshake,
    schedule_property_showing: Calendar,
    record_property_send: Send,
    add_property_note: StickyNote,
    bulk_send_buyers: Users,
  };

  return (
    <div className="rounded-lg p-3" style={{ background: "var(--g-bg-elevated)", border: "1px solid var(--g-border-subtle)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4" style={{ color: "var(--g-accent)" }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--g-text-secondary)" }}>AI Suggestions</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} style={{ color: "var(--g-text-tertiary)" }} />
        </Button>
      </div>
      {isLoading || isFetching ? (
        <div className="flex items-center gap-2 py-3">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--g-accent)" }} />
          <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>Analyzing property...</span>
        </div>
      ) : data?.suggestions && data.suggestions.length > 0 ? (
        <div className="space-y-2">
          {data.suggestions.map((s: any, i: number) => {
            const colors = priorityColors[s.priority] || priorityColors.low;
            const Icon = actionIcons[s.actionType] || Lightbulb;
            return (
              <div key={i} className="rounded-md p-2.5 flex gap-2.5" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
                <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: colors.text }} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold" style={{ color: "var(--g-text-primary)" }}>{s.title}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--g-text-secondary)" }}>{s.description}</div>
                </div>
                <Badge variant="outline" className="shrink-0 self-start text-[9px] px-1.5 py-0" style={{ color: colors.text, borderColor: colors.border }}>
                  {s.priority}
                </Badge>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs py-2" style={{ color: "var(--g-text-tertiary)" }}>No suggestions available</div>
      )}
    </div>
  );
}

// ─── BUYERS TAB ───
function BuyersTab({ propertyId }: { propertyId: number }) {
  const utils = trpc.useUtils();
  const [addBuyerOpen, setAddBuyerOpen] = useState(false);
  const { data: buyers, isLoading } = trpc.inventory.getBuyerActivities.useQuery({ propertyId });
  const matchMutation = trpc.inventory.matchBuyers.useMutation({
    onSuccess: (result) => {
      utils.inventory.getBuyerActivities.invalidate({ propertyId });
      toast.success(`Found ${result.matched} matching buyers`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const addBuyerMutation = trpc.inventory.addBuyerActivity.useMutation({
    onSuccess: () => {
      utils.inventory.getBuyerActivities.invalidate({ propertyId });
      toast.success("Buyer added");
      setAddBuyerOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const updateBuyerMutation = trpc.inventory.updateBuyerActivity.useMutation({
    onSuccess: () => {
      utils.inventory.getBuyerActivities.invalidate({ propertyId });
      toast.success("Buyer updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const recordSendMutation = trpc.inventory.recordBuyerSend.useMutation({
    onSuccess: () => {
      utils.inventory.getBuyerActivities.invalidate({ propertyId });
      toast.success("Send recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const recordOfferMutation = trpc.inventory.recordBuyerOffer.useMutation({
    onSuccess: () => {
      utils.inventory.getBuyerActivities.invalidate({ propertyId });
      toast.success("Offer recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteBuyerMutation = trpc.inventory.deleteBuyerActivity.useMutation({
    onSuccess: () => {
      utils.inventory.getBuyerActivities.invalidate({ propertyId });
      toast.success("Buyer removed");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const recordResponseMutation = trpc.inventory.recordBuyerResponse.useMutation({
    onSuccess: () => {
      utils.inventory.getBuyerActivities.invalidate({ propertyId });
      utils.inventory.getBuyerResponseStats.invalidate({ propertyId });
      toast.success("Response recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const { data: responseStats } = trpc.inventory.getBuyerResponseStats.useQuery({ propertyId });

  const rematchMutation = trpc.inventory.rematchBuyers.useMutation({
    onSuccess: (result) => {
      utils.inventory.getBuyerActivities.invalidate({ propertyId });
      toast.success(`Re-matched ${result.matched} buyers (cleared previous matches)`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const [buyerSearch, setBuyerSearch] = useState("");
  const [buyerStatusFilter, setBuyerStatusFilter] = useState<string>("all");
  const [sendConfirm, setSendConfirm] = useState<{ buyerId: number; channel: string; buyerName: string; buyerPhone: string; buyerEmail: string } | null>(null);

  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;

  const allBuyers = (buyers as any[]) || [];
  // Apply search and status filter
  const buyerList = allBuyers.filter((b: any) => {
    const matchesSearch = !buyerSearch || 
      (b.buyerName || "").toLowerCase().includes(buyerSearch.toLowerCase()) ||
      (b.buyerPhone || "").includes(buyerSearch) ||
      (b.buyerEmail || "").toLowerCase().includes(buyerSearch.toLowerCase()) ||
      (b.buyerCompany || "").toLowerCase().includes(buyerSearch.toLowerCase());
    const matchesStatus = buyerStatusFilter === "all" || b.status === buyerStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-3">
      {/* Action Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => setAddBuyerOpen(true)}>
          <UserPlus className="h-3 w-3 mr-1" /> Add Buyer
        </Button>
        <Button size="sm" variant="outline" onClick={() => matchMutation.mutate({ propertyId })} disabled={matchMutation.isPending}>
          <Target className="h-3 w-3 mr-1" /> {matchMutation.isPending ? "Matching..." : "Match from GHL"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => rematchMutation.mutate({ propertyId })} disabled={rematchMutation.isPending}>
          <RefreshCw className="h-3 w-3 mr-1" /> {rematchMutation.isPending ? "Rematching..." : "Rematch Buyers"}
        </Button>
      </div>
      {/* Search & Filter */}
      {allBuyers.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3" style={{ color: "var(--g-text-tertiary)" }} />
            <Input className="pl-8 h-7 text-xs" placeholder="Search buyers..." value={buyerSearch} onChange={(e) => setBuyerSearch(e.target.value)} />
          </div>
          <Select value={buyerStatusFilter} onValueChange={setBuyerStatusFilter}>
            <SelectTrigger className="w-[110px] h-7 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {(["matched", "sent", "interested", "offered", "passed", "accepted", "skipped"] as BuyerStatus[]).map(s => (
                <SelectItem key={s} value={s}>{BUYER_STATUS_CONFIG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--g-text-tertiary)" }}>{buyerList.length}/{allBuyers.length}</span>
        </div>
      )}

      {/* Response Stats Bar */}
      {responseStats && responseStats.totalSent > 0 && (
        <div className="rounded-lg p-3" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(59,130,246,0.08))", border: "1px solid rgba(99,102,241,0.15)" }}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4" style={{ color: "#6366f1" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--g-text-primary)" }}>Response Tracking</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: "#3b82f6" }}>{responseStats.totalSent}</div>
              <div className="text-[10px]" style={{ color: "var(--g-text-tertiary)" }}>Sent</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: "#22c55e" }}>{responseStats.totalResponded}</div>
              <div className="text-[10px]" style={{ color: "var(--g-text-tertiary)" }}>Responded</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: "#f59e0b" }}>{responseStats.totalInterested}</div>
              <div className="text-[10px]" style={{ color: "var(--g-text-tertiary)" }}>Interested</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: responseStats.responseRate >= 30 ? "#22c55e" : responseStats.responseRate >= 15 ? "#f59e0b" : "#ef4444" }}>{responseStats.responseRate}%</div>
              <div className="text-[10px]" style={{ color: "var(--g-text-tertiary)" }}>Response Rate</div>
            </div>
          </div>
        </div>
      )}

      {buyerList.length === 0 ? (
        <div className="text-center py-8">
          <Users className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--g-text-tertiary)" }} />
          <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>No buyers yet</p>
          <p className="text-xs mt-1" style={{ color: "var(--g-text-tertiary)" }}>Add buyers manually or match from GHL contacts</p>
        </div>
      ) : (
        buyerList.map((buyer: any) => {
          const statusCfg = BUYER_STATUS_CONFIG[buyer.status as BuyerStatus] || BUYER_STATUS_CONFIG.matched;
          return (
            <div key={buyer.id} className="rounded-lg p-3" style={{ background: "var(--g-bg-elevated)", border: "1px solid var(--g-border-subtle)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: "var(--g-text-primary)" }}>{buyer.buyerName}</span>
                  {buyer.isVip && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />}
                  {buyer.buyerCompany && <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>({buyer.buyerCompany})</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Badge style={{ background: statusCfg.bg, color: statusCfg.color, border: "none", fontSize: "10px" }}>{statusCfg.label}</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><MoreVertical className="h-3 w-3" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {(["matched", "sent", "interested", "offered", "passed", "accepted", "skipped"] as BuyerStatus[]).map((s) => (
                        <DropdownMenuItem key={s} onClick={() => updateBuyerMutation.mutate({ buyerActivityId: buyer.id, status: s })}>
                          Set: {BUYER_STATUS_CONFIG[s].label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem onClick={() => deleteBuyerMutation.mutate({ buyerActivityId: buyer.id })} className="text-red-500">
                        <Trash2 className="h-3 w-3 mr-2" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {/* Contact info */}
              <div className="flex items-center gap-3 text-xs mb-2" style={{ color: "var(--g-text-tertiary)" }}>
                {buyer.buyerPhone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{buyer.buyerPhone}</span>}
                {buyer.buyerEmail && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{buyer.buyerEmail}</span>}
                {buyer.buyerStrategy && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{buyer.buyerStrategy}</Badge>}
              </div>
              {/* Activity stats */}
              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                <span>Sends: {buyer.sendCount || 0}</span>
                <span>Offers: {buyer.offerCount || 0}</span>
                {buyer.responseCount > 0 && <span className="flex items-center gap-1" style={{ color: "#22c55e" }}><MessageCircle className="h-3 w-3" /> {buyer.responseCount} response{buyer.responseCount > 1 ? "s" : ""}</span>}
                {buyer.lastOfferAmount && <span className="font-semibold" style={{ color: "#22c55e" }}>Last Offer: {formatCurrency(buyer.lastOfferAmount)}</span>}
              </div>
              {/* Last response note */}
              {buyer.lastResponseNote && (
                <div className="text-xs mt-1 p-1.5 rounded flex items-start gap-1" style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e" }}>
                  <MessageCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{buyer.lastResponseNote.substring(0, 120)}{buyer.lastResponseNote.length > 120 ? "..." : ""}</span>
                </div>
              )}
              {/* Quick actions */}
              <div className="flex items-center gap-1 mt-2 pt-2" style={{ borderTop: "1px solid var(--g-border-subtle)" }}>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => {
                  setSendConfirm({ buyerId: buyer.id, channel: "sms", buyerName: buyer.buyerName || "Unknown", buyerPhone: buyer.buyerPhone || "", buyerEmail: buyer.buyerEmail || "" });
                }}>
                  <MessageSquare className="h-3 w-3 mr-1" /> SMS
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => {
                  setSendConfirm({ buyerId: buyer.id, channel: "email", buyerName: buyer.buyerName || "Unknown", buyerPhone: buyer.buyerPhone || "", buyerEmail: buyer.buyerEmail || "" });
                }}>
                  <Mail className="h-3 w-3 mr-1" /> Email
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => {
                  const amount = prompt("Enter offer amount (e.g. 150000):");
                  if (amount) {
                    const cents = Math.round(parseFloat(amount) * 100);
                    if (!isNaN(cents)) recordOfferMutation.mutate({ buyerActivityId: buyer.id, offerAmount: cents });
                  }
                }}>
                  <DollarSign className="h-3 w-3 mr-1" /> Log Offer
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" style={{ color: "#22c55e" }} onClick={() => {
                  const note = prompt("What did the buyer say?");
                  if (note?.trim()) {
                    recordResponseMutation.mutate({ buyerActivityId: buyer.id, responseNote: note.trim() });
                  }
                }}>
                  <MessageCircle className="h-3 w-3 mr-1" /> Log Response
                </Button>
              </div>
              {buyer.notes && <div className="text-xs mt-2 p-1.5 rounded" style={{ background: "var(--g-bg-inset)", color: "var(--g-text-secondary)" }}>{buyer.notes}</div>}
            </div>
          );
        })
      )}

      {addBuyerOpen && (
        <AddBuyerDialog
          open={addBuyerOpen}
          onOpenChange={setAddBuyerOpen}
          propertyId={propertyId}
          onSave={(d: any) => addBuyerMutation.mutate(d)}
          isSaving={addBuyerMutation.isPending}
        />
      )}

      {/* Send Confirmation Dialog (Fix #16) */}
      <Dialog open={sendConfirm !== null} onOpenChange={() => setSendConfirm(null)}>
        <DialogContent style={{ background: "var(--g-bg-surface)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--g-text-primary)" }}>
              {sendConfirm?.channel === "sms" ? "Send SMS" : "Send Email"} to {sendConfirm?.buyerName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs space-y-1" style={{ color: "var(--g-text-secondary)" }}>
              <p><strong>To:</strong> {sendConfirm?.buyerName}</p>
              <p><strong>{sendConfirm?.channel === "sms" ? "Phone" : "Email"}:</strong> {sendConfirm?.channel === "sms" ? (sendConfirm?.buyerPhone || "No phone") : (sendConfirm?.buyerEmail || "No email")}</p>
            </div>
            <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
              This will log a {sendConfirm?.channel === "sms" ? "SMS" : "email"} send to this buyer's activity record.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendConfirm(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (sendConfirm) {
                  recordSendMutation.mutate({ buyerActivityId: sendConfirm.buyerId, channel: sendConfirm.channel as any });
                  setSendConfirm(null);
                }
              }}
              style={{ background: "var(--g-accent)", color: "#fff" }}
            >
              Confirm Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── ACTIVITY TAB ───
function ActivityTab({ propertyId }: { propertyId: number }) {
  const utils = trpc.useUtils();
  const { data: activities, isLoading } = trpc.inventory.getActivityLog.useQuery({ propertyId, limit: 50 });
  const [noteText, setNoteText] = useState("");
  const addNoteMutation = trpc.inventory.addActivityNote.useMutation({
    onSuccess: () => {
      utils.inventory.getActivityLog.invalidate({ propertyId });
      setNoteText("");
      toast.success("Note added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;

  const activityList = (activities as any[]) || [];

  const eventIcons: Record<string, { icon: React.ElementType; color: string }> = {
    property_created: { icon: Plus, color: "#22c55e" },
    status_changed: { icon: RefreshCw, color: "#6366f1" },
    send_logged: { icon: Send, color: "#3b82f6" },
    offer_received: { icon: DollarSign, color: "#f59e0b" },
    offer_status_changed: { icon: Handshake, color: "#f97316" },
    showing_scheduled: { icon: Calendar, color: "#8b5cf6" },
    showing_updated: { icon: Eye, color: "#14b8a6" },
    buyer_added: { icon: UserPlus, color: "#3b82f6" },
    buyer_status_changed: { icon: Users, color: "#6366f1" },
    buyer_send: { icon: Send, color: "#3b82f6" },
    buyer_offer: { icon: DollarSign, color: "#f59e0b" },
    note_added: { icon: StickyNote, color: "#6b7280" },
  };

  return (
    <div className="space-y-3">
      {/* Add Note */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Add a note..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && noteText.trim()) {
              addNoteMutation.mutate({ propertyId, note: noteText.trim() });
            }
          }}
        />
        <Button
          size="sm"
          onClick={() => noteText.trim() && addNoteMutation.mutate({ propertyId, note: noteText.trim() })}
          disabled={!noteText.trim() || addNoteMutation.isPending}
          style={{ background: "var(--g-accent)", color: "#fff" }}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {activityList.length === 0 ? (
        <div className="text-center py-8">
          <Activity className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--g-text-tertiary)" }} />
          <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>No activity yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {activityList.map((act: any) => {
            const ei = eventIcons[act.eventType] || { icon: CircleDot, color: "#6b7280" };
            const EIcon = ei.icon;
            return (
              <div key={act.id} className="flex items-start gap-2 py-2 px-2 rounded-lg hover:bg-[var(--g-bg-elevated)] transition-colors">
                <div className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${ei.color}15` }}>
                  <EIcon className="h-3 w-3" style={{ color: ei.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm" style={{ color: "var(--g-text-primary)" }}>{act.title}</div>
                  {act.description && <div className="text-xs mt-0.5" style={{ color: "var(--g-text-secondary)" }}>{act.description}</div>}
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>
                    {act.performedByName && `${act.performedByName} · `}{timeAgo(act.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── OUTREACH TAB (Sends, Offers, Showings) ───
function OutreachTab({ property, propertyId }: { property: any; propertyId: number }) {
  const utils = trpc.useUtils();
  const [sendOpen, setSendOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [showingOpen, setShowingOpen] = useState(false);
  const [subTab, setSubTab] = useState("sends");

  const addSendMutation = trpc.inventory.addSend.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); utils.inventory.getDispoKpiSummary.invalidate(); utils.inventory.getActivityLog.invalidate({ propertyId }); toast.success("Send logged"); setSendOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteSendMutation = trpc.inventory.deleteSend.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); toast.success("Send deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
  const addOfferMutation = trpc.inventory.addOffer.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); utils.inventory.getDispoKpiSummary.invalidate(); utils.inventory.getActivityLog.invalidate({ propertyId }); toast.success("Offer added"); setOfferOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateOfferMutation = trpc.inventory.updateOfferStatus.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); utils.inventory.getDispoKpiSummary.invalidate(); utils.inventory.getActivityLog.invalidate({ propertyId }); toast.success("Offer updated"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteOfferMutation = trpc.inventory.deleteOffer.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); toast.success("Offer deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
  const addShowingMutation = trpc.inventory.addShowing.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); utils.inventory.getDispoKpiSummary.invalidate(); utils.inventory.getActivityLog.invalidate({ propertyId }); toast.success("Showing scheduled"); setShowingOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateShowingMutation = trpc.inventory.updateShowing.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); toast.success("Showing updated"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteShowingMutation = trpc.inventory.deleteShowing.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); toast.success("Showing deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "var(--g-bg-elevated)" }}>
        {[
          { key: "sends", label: "Sends", count: property.sends?.length || 0, icon: Send },
          { key: "offers", label: "Offers", count: property.offers?.length || 0, icon: DollarSign },
          { key: "showings", label: "Showings", count: property.showings?.length || 0, icon: Eye },
        ].map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              background: subTab === key ? "var(--g-bg-surface)" : "transparent",
              color: subTab === key ? "var(--g-text-primary)" : "var(--g-text-tertiary)",
              boxShadow: subTab === key ? "var(--g-shadow-sm)" : "none",
            }}
          >
            <Icon className="h-3 w-3" /> {label} ({count})
          </button>
        ))}
      </div>

      {/* Sends */}
      {subTab === "sends" && (
        <div className="space-y-2">
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
                      {ch.label}{send.buyerGroup ? ` \u2192 ${send.buyerGroup}` : ""}
                    </div>
                    <div className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                      {send.recipientCount ? `${send.recipientCount} recipients \u00b7 ` : ""}{timeAgo(send.sentAt)}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteSendMutation.mutate({ sendId: send.id })}>
                  <Trash2 className="h-3 w-3" style={{ color: "var(--g-text-tertiary)" }} />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Offers */}
      {subTab === "offers" && (
        <div className="space-y-2">
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
        </div>
      )}

      {/* Showings */}
      {subTab === "showings" && (
        <div className="space-y-2">
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
                          <SelectItem value="hot">Hot</SelectItem>
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
        </div>
      )}

      {/* Dialogs */}
      {sendOpen && <LogSendDialog open={sendOpen} onOpenChange={setSendOpen} propertyId={propertyId} onSave={(d: any) => addSendMutation.mutate(d)} isSaving={addSendMutation.isPending} />}
      {offerOpen && <AddOfferDialog open={offerOpen} onOpenChange={setOfferOpen} propertyId={propertyId} onSave={(d: any) => addOfferMutation.mutate(d)} isSaving={addOfferMutation.isPending} />}
      {showingOpen && <AddShowingDialog open={showingOpen} onOpenChange={setShowingOpen} propertyId={propertyId} onSave={(d: any) => addShowingMutation.mutate(d)} isSaving={addShowingMutation.isPending} />}
    </div>
  );
}

// ─── AI DISPO ASSISTANT TAB ───
// ─── DISPO ACTION TYPES & LABELS ───
const DISPO_ACTION_LABELS: Record<string, string> = {
  // Property actions
  update_property_price: "Update Price",
  update_property_status: "Change Status",
  add_property_offer: "Record Offer",
  schedule_property_showing: "Schedule Showing",
  record_property_send: "Record Send",
  add_property_note: "Add Note",
  bulk_send_buyers: "Bulk Send to Buyers",
  record_buyer_response: "Record Buyer Response",
  // CRM actions (available from Dispo AI too)
  send_sms: "Send SMS",
  create_task: "Create Task",
  add_note: "Add CRM Note",
  add_note_contact: "Add CRM Note",
  add_tag: "Add Tag",
  remove_tag: "Remove Tag",
  change_pipeline_stage: "Change Stage",
  create_appointment: "Create Appointment",
  update_appointment: "Update Appointment",
  cancel_appointment: "Cancel Appointment",
  add_to_workflow: "Add to Workflow",
  remove_from_workflow: "Remove from Workflow",
  update_task: "Update Task",
  update_field: "Update Field",
};
const DISPO_ACTION_ICONS: Record<string, typeof DollarSign> = {
  // Property actions
  update_property_price: DollarSign,
  update_property_status: Activity,
  add_property_offer: Handshake,
  schedule_property_showing: Calendar,
  record_property_send: Send,
  add_property_note: StickyNote,
  bulk_send_buyers: Users,
  record_buyer_response: MessageCircle,
  // CRM actions
  send_sms: MessageSquare,
  create_task: CheckCircle2,
  add_note: FileText,
  add_note_contact: FileText,
  add_tag: Tag,
  remove_tag: Tag,
  change_pipeline_stage: RefreshCw,
  create_appointment: Calendar,
  update_appointment: Calendar,
  cancel_appointment: XCircle,
  add_to_workflow: Zap,
  remove_from_workflow: XCircle,
  update_task: RefreshCw,
  update_field: Edit,
};

type DispoMessage = {
  role: "user" | "assistant";
  content: string;
  actionCards?: Array<{
    id: string;
    actionType: string;
    summary: string;
    params: Record<string, any>;
    status: "pending" | "confirmed" | "executing" | "executed" | "failed" | "cancelled";
    pendingActionId?: number;
    error?: string;
  }>;
};

function DispoAITab({ propertyId, property }: { propertyId: number; property: any }) {
  const [messages, setMessages] = useState<DispoMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isParsingIntent, setIsParsingIntent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const actionIdCounter = useRef(0);

  const createPendingMutation = trpc.coachActions.createPending.useMutation();
  const confirmMutation = trpc.coachActions.confirmAndExecute.useMutation();
  const cancelMutation = trpc.coachActions.cancel.useMutation();
  const utils = trpc.useUtils();

  const scrollToBottom = () => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Parse intent after ACTION_REDIRECT is detected
  const parseIntent = useCallback(async (userMessage: string) => {
    setIsParsingIntent(true);
    try {
      const response = await fetch("/api/dispo-assistant/parse-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          propertyId,
          history: messages.filter(m => !m.actionCards).slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!response.ok) throw new Error("Parse intent failed");
      const data = await response.json();

      if (data.actions && data.actions.length > 0) {
        // Create pending actions in the database and build action cards
        const actionCards: DispoMessage["actionCards"] = [];
        for (const action of data.actions) {
          try {
            const result = await createPendingMutation.mutateAsync({
              actionType: action.actionType,
              requestText: action.summary,
              payload: action.params,
            });
            actionCards.push({
              id: `dispo-action-${++actionIdCounter.current}`,
              actionType: action.actionType,
              summary: action.summary,
              params: action.params,
              status: "pending",
              pendingActionId: result.actionId,
            });
          } catch (err: any) {
            console.error("[DispoAI] Failed to create pending action:", err);
            actionCards.push({
              id: `dispo-action-${++actionIdCounter.current}`,
              actionType: action.actionType,
              summary: action.summary,
              params: action.params,
              status: "failed",
              error: err.message || "Failed to create action",
            });
          }
        }

        // Add action cards as an assistant message
        setMessages(prev => {
          const updated = [...prev];
          // Replace the last assistant message (which has ACTION_REDIRECT) with action cards
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
            updated[lastIdx] = {
              role: "assistant",
              content: `I'll help you with that. Here ${actionCards.length === 1 ? "is the action" : "are the actions"} I've prepared:`,
              actionCards,
            };
          } else {
            updated.push({
              role: "assistant",
              content: `Here ${actionCards.length === 1 ? "is the action" : "are the actions"} I've prepared:`,
              actionCards,
            });
          }
          return updated;
        });
      } else {
        // No actions detected, show a fallback
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
            updated[lastIdx] = { ...updated[lastIdx], content: "I understood you want to take an action, but I couldn't determine the specific details. Could you be more specific? For example: 'Update the asking price to $150,000' or 'Schedule a showing for John tomorrow at 2pm'." };
          }
          return updated;
        });
      }
    } catch (err) {
      console.error("[DispoAI] Parse intent error:", err);
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
          updated[lastIdx] = { ...updated[lastIdx], content: "Sorry, I had trouble processing that action. Please try again." };
        }
        return updated;
      });
    } finally {
      setIsParsingIntent(false);
    }
  }, [propertyId, messages, createPendingMutation]);

  // Confirm an action
  const handleConfirmAction = useCallback(async (msgIdx: number, cardIdx: number) => {
    const msg = messages[msgIdx];
    const card = msg?.actionCards?.[cardIdx];
    if (!card || !card.pendingActionId) return;

    // Update card status to executing
    setMessages(prev => {
      const updated = [...prev];
      const cards = [...(updated[msgIdx].actionCards || [])];
      cards[cardIdx] = { ...cards[cardIdx], status: "executing" };
      updated[msgIdx] = { ...updated[msgIdx], actionCards: cards };
      return updated;
    });

    try {
      const result = await confirmMutation.mutateAsync({ actionId: card.pendingActionId });
      setMessages(prev => {
        const updated = [...prev];
        const cards = [...(updated[msgIdx].actionCards || [])];
        cards[cardIdx] = {
          ...cards[cardIdx],
          status: result.success ? "executed" : "failed",
          error: result.success ? undefined : (result.error || "Action failed"),
        };
        updated[msgIdx] = { ...updated[msgIdx], actionCards: cards };
        return updated;
      });
      if (result.success) {
        toast.success(`${DISPO_ACTION_LABELS[card.actionType] || card.actionType} completed!`);
        // Refresh property data
        utils.inventory.getPropertyById.invalidate({ propertyId });
        utils.inventory.getProperties.invalidate();
        utils.inventory.getDispoKpiSummary.invalidate();
        utils.inventory.getActivityLog.invalidate({ propertyId });
      } else {
        toast.error(result.error || "Action failed");
      }
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        const cards = [...(updated[msgIdx].actionCards || [])];
        cards[cardIdx] = { ...cards[cardIdx], status: "failed", error: err.message || "Execution failed" };
        updated[msgIdx] = { ...updated[msgIdx], actionCards: cards };
        return updated;
      });
      toast.error(err.message || "Failed to execute action");
    }
  }, [messages, confirmMutation, utils, propertyId]);

  // Cancel an action
  const handleCancelAction = useCallback(async (msgIdx: number, cardIdx: number) => {
    const msg = messages[msgIdx];
    const card = msg?.actionCards?.[cardIdx];
    if (!card || !card.pendingActionId) return;

    try {
      await cancelMutation.mutateAsync({ actionId: card.pendingActionId });
      setMessages(prev => {
        const updated = [...prev];
        const cards = [...(updated[msgIdx].actionCards || [])];
        cards[cardIdx] = { ...cards[cardIdx], status: "cancelled" };
        updated[msgIdx] = { ...updated[msgIdx], actionCards: cards };
        return updated;
      });
      toast.info("Action cancelled");
    } catch (err: any) {
      toast.error("Failed to cancel action");
    }
  }, [messages, cancelMutation]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming || isParsingIntent) return;
    const userMsg: DispoMessage = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg, { role: "assistant", content: "" }]);
    setInput("");
    setIsStreaming(true);

    let fullContent = "";
    let actionRedirectDetected = false;
    const originalUserText = text.trim();

    try {
      const response = await fetch("/api/dispo-assistant/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: originalUserText,
          propertyId,
          history: messages.filter(m => !m.actionCards).slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!response.ok) throw new Error("Stream request failed");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.type === "chunk" && parsed.content) {
              fullContent += parsed.content;
              // Check for ACTION_REDIRECT
              if (fullContent.includes("[ACTION_REDIRECT]")) {
                actionRedirectDetected = true;
                // Update the message to show "Processing action..."
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = { ...last, content: "" };
                  }
                  return updated;
                });
                // Don't process more chunks
                reader.cancel();
                break;
              }
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: fullContent };
                }
                return updated;
              });
            } else if (parsed.type === "error") {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: "Sorry, something went wrong. Please try again." };
                }
                return updated;
              });
            }
          } catch { /* skip */ }
        }
        if (actionRedirectDetected) break;
      }
    } catch (err) {
      if (!actionRedirectDetected) {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: "Failed to connect. Please try again." };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
    }

    // If ACTION_REDIRECT was detected, parse the intent
    if (actionRedirectDetected) {
      await parseIntent(originalUserText);
    }
  };

  const suggestedPrompts = [
    `What's the best pricing strategy for ${property?.address || "this property"}?`,
    "Which buyer segments should I target first?",
    "Help me craft a compelling SMS blast for this deal",
    "What should my follow-up cadence look like?",
    `Update the asking price to $${property?.askingPrice ? ((property.askingPrice / 100) - 5000).toLocaleString() : "150,000"}`,
    "Add a note that I spoke with the seller today",
  ];

  // Render an action card
  const renderActionCard = (card: NonNullable<DispoMessage["actionCards"]>[0], msgIdx: number, cardIdx: number) => {
    const IconComp = DISPO_ACTION_ICONS[card.actionType] || Zap;
    const label = DISPO_ACTION_LABELS[card.actionType] || card.actionType;
    const isPending = card.status === "pending";
    const isExecuting = card.status === "executing";
    const isExecuted = card.status === "executed";
    const isFailed = card.status === "failed";
    const isCancelled = card.status === "cancelled";

    return (
      <div
        key={card.id}
        className="rounded-lg p-3 mt-2"
        style={{
          background: isExecuted ? "rgba(34,197,94,0.08)" : isFailed ? "rgba(239,68,68,0.08)" : isCancelled ? "rgba(156,163,175,0.08)" : "var(--g-surface)",
          border: `1px solid ${isExecuted ? "rgba(34,197,94,0.3)" : isFailed ? "rgba(239,68,68,0.3)" : isCancelled ? "rgba(156,163,175,0.3)" : "var(--g-border-subtle)"}`,
        }}
      >
        <div className="flex items-start gap-2">
          <div
            className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: isExecuted ? "rgba(34,197,94,0.15)" : "var(--g-accent-soft)" }}
          >
            {isExecuting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--g-accent)" }} />
            ) : isExecuted ? (
              <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "rgb(34,197,94)" }} />
            ) : isFailed ? (
              <XCircle className="h-3.5 w-3.5" style={{ color: "rgb(239,68,68)" }} />
            ) : isCancelled ? (
              <X className="h-3.5 w-3.5" style={{ color: "rgb(156,163,175)" }} />
            ) : (
              <IconComp className="h-3.5 w-3.5" style={{ color: "var(--g-accent)" }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--g-text-primary)" }}>{label}</span>
              {isExecuted && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "rgb(34,197,94)" }}>Done</span>}
              {isFailed && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.15)", color: "rgb(239,68,68)" }}>Failed</span>}
              {isCancelled && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(156,163,175,0.15)", color: "rgb(156,163,175)" }}>Cancelled</span>}
              {isExecuting && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--g-accent-soft)", color: "var(--g-accent)" }}>Executing...</span>}
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--g-text-secondary)" }}>{card.summary}</p>
            {card.error && <p className="text-xs mt-1" style={{ color: "rgb(239,68,68)" }}>{card.error}</p>}
          </div>
        </div>

        {/* Confirm / Cancel buttons */}
        {isPending && (
          <div className="flex gap-2 mt-2 ml-9">
            <button
              onClick={() => handleConfirmAction(msgIdx, cardIdx)}
              className="text-xs px-3 py-1.5 rounded-md font-medium transition-all hover:opacity-90"
              style={{ background: "var(--g-accent)", color: "#fff" }}
            >
              <CheckCircle2 className="h-3 w-3 inline mr-1" />
              Confirm
            </button>
            <button
              onClick={() => handleCancelAction(msgIdx, cardIdx)}
              className="text-xs px-3 py-1.5 rounded-md font-medium transition-all hover:opacity-90"
              style={{ background: "var(--g-surface)", color: "var(--g-text-secondary)", border: "1px solid var(--g-border-subtle)" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 400, overflow: "hidden" }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-3" style={{ overscrollBehavior: "contain" }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="p-3 rounded-full" style={{ background: "var(--g-accent-soft)" }}>
              <Bot className="h-8 w-8" style={{ color: "var(--g-accent)" }} />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--g-text-primary)" }}>AI Dispo Assistant</h3>
              <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>Ask questions, get advice, or tell me to take action on this property</p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {suggestedPrompts.slice(0, 4).map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  className="text-left text-xs px-3 py-2 rounded-lg transition-all hover:scale-[1.01]"
                  style={{ background: "var(--g-surface)", border: "1px solid var(--g-border-subtle)", color: "var(--g-text-secondary)" }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center mt-0.5" style={{ background: "var(--g-accent-soft)" }}>
                  <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--g-accent)" }} />
                </div>
              )}
              <div className={`max-w-[85%] ${msg.role === "user" ? "" : "w-full max-w-[85%]"}`}>
                <div
                  className="rounded-lg px-3 py-2 text-xs"
                  style={msg.role === "user"
                    ? { background: "var(--g-accent)", color: "#fff" }
                    : { background: "var(--g-surface)", color: "var(--g-text-primary)", border: "1px solid var(--g-border-subtle)" }
                  }
                >
                  {msg.role === "assistant" && msg.content ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:text-xs [&_li]:text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs">
                      <Streamdown>{msg.content}</Streamdown>
                    </div>
                  ) : msg.role === "assistant" && !msg.content && (isStreaming || isParsingIntent) ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--g-accent)" }} />
                      <span style={{ color: "var(--g-text-tertiary)" }}>{isParsingIntent ? "Preparing action..." : "Thinking..."}</span>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
                {/* Action Cards */}
                {msg.actionCards && msg.actionCards.map((card, ci) => renderActionCard(card, i, ci))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input - pinned at bottom */}
      <div className="pt-3 shrink-0" style={{ borderTop: "1px solid var(--g-border-subtle)" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2 items-end"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Ask for advice or tell me to take action..."
            rows={1}
            className="flex-1 text-xs px-3 py-2 rounded-lg resize-none outline-none"
            style={{ background: "var(--g-surface)", border: "1px solid var(--g-border-subtle)", color: "var(--g-text-primary)", maxHeight: 80 }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming || isParsingIntent}
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all disabled:opacity-40"
            style={{ background: "var(--g-accent)", color: "#fff" }}
          >
            {(isStreaming || isParsingIntent) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── RESEARCH TAB ───
function ResearchTab({ propertyId, property }: { propertyId: number; property: any }) {
  const research = property?.propertyResearch;
  const researchUpdatedAt = property?.researchUpdatedAt;
  const utils = trpc.useUtils();
  const researchMutation = trpc.inventory.researchProperty.useMutation({
    onSuccess: () => {
      toast.success("Property research completed!");
      utils.inventory.getPropertyDetail.invalidate({ propertyId });
    },
    onError: (err: any) => toast.error(err.message || "Research failed"),
  });

  const fmt = (v: number | undefined | null) => v ? `$${v.toLocaleString()}` : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--g-text-primary)" }}>Property Research</h3>
          {researchUpdatedAt && (
            <p className="text-xs mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>
              Last updated: {new Date(researchUpdatedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => researchMutation.mutate({ propertyId })}
          disabled={researchMutation.isPending}
          className="gap-1"
        >
          {researchMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {research ? "Re-Research" : "Run Research"}
        </Button>
      </div>

      {!research && !researchMutation.isPending && (
        <div className="text-center py-8 rounded-lg" style={{ background: "var(--g-surface-elevated)", border: "1px solid var(--g-border-subtle)" }}>
          <Globe className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--g-text-tertiary)" }} />
          <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>No research data yet</p>
          <p className="text-xs mt-1" style={{ color: "var(--g-text-tertiary)" }}>Click "Run Research" to gather Zillow estimates, tax records, comps, and more</p>
        </div>
      )}

      {researchMutation.isPending && (
        <div className="text-center py-8 rounded-lg" style={{ background: "var(--g-surface-elevated)", border: "1px solid var(--g-border-subtle)" }}>
          <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" style={{ color: "var(--g-accent)" }} />
          <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Researching property...</p>
          <p className="text-xs mt-1" style={{ color: "var(--g-text-tertiary)" }}>This may take 15-30 seconds</p>
        </div>
      )}

      {research && (
        <div className="space-y-3">
          {/* Valuation */}
          <div className="rounded-lg p-3" style={{ background: "var(--g-surface-elevated)", border: "1px solid var(--g-border-subtle)" }}>
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--g-accent)" }}>
              <DollarSign className="h-3 w-3" /> Valuation & Tax
            </h4>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span style={{ color: "var(--g-text-tertiary)" }}>Zestimate</span><br/><span className="font-medium" style={{ color: "var(--g-text-primary)" }}>{fmt(research.zestimate)}</span></div>
              <div><span style={{ color: "var(--g-text-tertiary)" }}>Tax Assessment</span><br/><span className="font-medium" style={{ color: "var(--g-text-primary)" }}>{fmt(research.taxAssessment)}</span></div>
              <div><span style={{ color: "var(--g-text-tertiary)" }}>Annual Tax</span><br/><span className="font-medium" style={{ color: "var(--g-text-primary)" }}>{fmt(research.taxAmount)}</span></div>
            </div>
          </div>

          {/* Public Records */}
          {(research.ownerName || research.deedDate || research.legalDescription) && (
            <div className="rounded-lg p-3" style={{ background: "var(--g-surface-elevated)", border: "1px solid var(--g-border-subtle)" }}>
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--g-accent)" }}>
                <FileText className="h-3 w-3" /> Public Records
              </h4>
              <div className="space-y-1 text-xs">
                {research.ownerName && <div><span style={{ color: "var(--g-text-tertiary)" }}>Owner:</span> <span style={{ color: "var(--g-text-primary)" }}>{research.ownerName}</span></div>}
                {research.deedDate && <div><span style={{ color: "var(--g-text-tertiary)" }}>Deed Date:</span> <span style={{ color: "var(--g-text-primary)" }}>{research.deedDate}</span></div>}
                {research.legalDescription && <div><span style={{ color: "var(--g-text-tertiary)" }}>Legal:</span> <span style={{ color: "var(--g-text-primary)" }}>{research.legalDescription}</span></div>}
              </div>
            </div>
          )}

          {/* Comps */}
          {research.recentComps && research.recentComps.length > 0 && (
            <div className="rounded-lg p-3" style={{ background: "var(--g-surface-elevated)", border: "1px solid var(--g-border-subtle)" }}>
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--g-accent)" }}>
                <BarChart3 className="h-3 w-3" /> Recent Comps ({research.recentComps.length})
              </h4>
              <div className="space-y-1.5">
                {research.recentComps.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1" style={{ borderBottom: i < research.recentComps!.length - 1 ? "1px solid var(--g-border-subtle)" : "none" }}>
                    <div>
                      <span style={{ color: "var(--g-text-primary)" }}>{c.address}</span>
                      <span className="ml-2" style={{ color: "var(--g-text-tertiary)" }}>{c.beds || "?"}bd/{c.baths || "?"}ba {c.sqft ? `${c.sqft}sqft` : ""}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium" style={{ color: "var(--g-text-primary)" }}>${c.soldPrice?.toLocaleString()}</span>
                      <span className="ml-1" style={{ color: "var(--g-text-tertiary)" }}>{c.soldDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Price History */}
          {research.priceHistory && research.priceHistory.length > 0 && (
            <div className="rounded-lg p-3" style={{ background: "var(--g-surface-elevated)", border: "1px solid var(--g-border-subtle)" }}>
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--g-accent)" }}>
                <TrendingUp className="h-3 w-3" /> Price History
              </h4>
              <div className="space-y-1">
                {research.priceHistory.map((h: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span style={{ color: "var(--g-text-tertiary)" }}>{h.date} — {h.event}</span>
                    <span className="font-medium" style={{ color: "var(--g-text-primary)" }}>${h.price?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Neighborhood */}
          {research.neighborhoodInfo && (
            <div className="rounded-lg p-3" style={{ background: "var(--g-surface-elevated)", border: "1px solid var(--g-border-subtle)" }}>
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--g-accent)" }}>
                <MapPin className="h-3 w-3" /> Neighborhood
              </h4>
              <p className="text-xs" style={{ color: "var(--g-text-secondary)" }}>{research.neighborhoodInfo}</p>
            </div>
          )}

          {/* Links */}
          <div className="flex items-center gap-2">
            {research.zillowUrl && (
              <a href={research.zillowUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ background: "var(--g-surface-elevated)", color: "var(--g-accent)", border: "1px solid var(--g-border-subtle)" }}>
                <ExternalLink className="h-3 w-3" /> Zillow
              </a>
            )}
            {research.streetViewUrl && (
              <a href={research.streetViewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ background: "var(--g-surface-elevated)", color: "var(--g-accent)", border: "1px solid var(--g-border-subtle)" }}>
                <ExternalLink className="h-3 w-3" /> Street View
              </a>
            )}
          </div>

          {/* Additional Notes */}
          {research.additionalNotes && (
            <div className="rounded-lg p-3" style={{ background: "var(--g-surface-elevated)", border: "1px solid var(--g-border-subtle)" }}>
              <h4 className="text-xs font-semibold mb-1" style={{ color: "var(--g-accent)" }}>Additional Notes</h4>
              <p className="text-xs" style={{ color: "var(--g-text-secondary)" }}>{research.additionalNotes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PROPERTY DETAIL PANEL ───
function QuickActionsBar({ property, propertyId, setActiveTab }: { property: any; propertyId: number; setActiveTab: (tab: string) => void }) {
  const utils = trpc.useUtils();
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const bulkSendMutation = trpc.inventory.bulkSendToBuyers.useMutation({
    onSuccess: (result: any) => {
      utils.inventory.getPropertyById.invalidate({ propertyId });
      utils.inventory.getActivityLog.invalidate({ propertyId });
      toast.success(`Sent to ${result.sent} of ${result.total} buyers`);
      setBulkSendOpen(false);
      setBulkMsg("");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const matchMutation = trpc.inventory.matchBuyers.useMutation({
    onSuccess: (result: any) => {
      utils.inventory.getPropertyById.invalidate({ propertyId });
      utils.inventory.getBuyerActivities.invalidate();
      toast.success(`Matched ${result.matched} buyers`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const status = property.status as string;
  const dom = daysOnMarket(property.createdAt);
  const hasBuyers = (property.sends?.length || 0) > 0 || (property.offers?.length || 0) > 0;
  const hasOffers = (property.offers?.length || 0) > 0;
  const noPrice = !property.askingPrice;

  // Build contextual actions based on property status and data
  const actions: Array<{ label: string; icon: any; color: string; bg: string; onClick: () => void; pulse?: boolean }> = [];

  // Always-useful: Match Buyers (if no buyers yet)
  if (!hasBuyers && ["marketing", "buyer_negotiating"].includes(status)) {
    actions.push({ label: "Match Buyers", icon: UserPlus, color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", onClick: () => matchMutation.mutate({ propertyId }), pulse: true });
  }

  // Marketing stage: Send to Buyers
  if (["marketing", "buyer_negotiating"].includes(status)) {
    actions.push({ label: "Send to Buyers", icon: Megaphone, color: "#3b82f6", bg: "rgba(59,130,246,0.1)", onClick: () => {
      setBulkMsg(`New deal alert! ${property.address}, ${property.city} ${property.state}. ${property.bedrooms || "?"}bd/${property.bathrooms || "?"}ba, ${property.sqft ? property.sqft.toLocaleString() + " sqft" : ""} ${property.askingPrice ? "Asking " + formatCurrency(property.askingPrice) : ""}. Reply for details!`);
      setBulkSendOpen(true);
    }});
  }

  // Record Offer (when negotiating or marketing)
  if (["marketing", "buyer_negotiating", "under_contract"].includes(status)) {
    actions.push({ label: "Record Offer", icon: DollarSign, color: "#22c55e", bg: "rgba(34,197,94,0.1)", onClick: () => setActiveTab("outreach") });
  }

  // Schedule Showing
  if (["marketing", "buyer_negotiating"].includes(status)) {
    actions.push({ label: "Schedule Showing", icon: Eye, color: "#f59e0b", bg: "rgba(245,158,11,0.1)", onClick: () => setActiveTab("outreach") });
  }

  // Stale property warning: suggest price update
  if (dom > 14 && ["marketing", "buyer_negotiating"].includes(status) && !hasOffers) {
    actions.push({ label: "Review Price", icon: TrendingUp, color: "#ef4444", bg: "rgba(239,68,68,0.1)", onClick: () => setActiveTab("ai"), pulse: true });
  }

  // No price set
  if (noPrice && ["marketing", "buyer_negotiating", "lead", "under_contract"].includes(status)) {
    actions.push({ label: "Set Price", icon: DollarSign, color: "#ef4444", bg: "rgba(239,68,68,0.1)", onClick: () => setActiveTab("ai"), pulse: true });
  }

  // Ask AI for help (always available)
  actions.push({ label: "Ask AI", icon: Bot, color: "var(--g-accent)", bg: "var(--g-accent-soft)", onClick: () => setActiveTab("ai") });

  if (actions.length === 0) return null;

  return (
    <>
      <div className="px-5 py-2 flex items-center gap-2 overflow-x-auto" style={{ borderBottom: "1px solid var(--g-border-subtle)", background: "var(--g-bg-elevated)" }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--g-text-tertiary)" }}>Quick:</span>
        {actions.slice(0, 5).map((action, i) => {
          const Icon = action.icon;
          return (
            <button
              key={i}
              onClick={action.onClick}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all hover:scale-105 whitespace-nowrap"
              style={{ background: action.bg, color: action.color, border: `1px solid ${action.color}20` }}
            >
              {action.pulse && <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: action.color }} />}
              <Icon className="h-3 w-3" />
              {action.label}
            </button>
          );
        })}
      </div>

      {/* Bulk Send Dialog */}
      <Dialog open={bulkSendOpen} onOpenChange={setBulkSendOpen}>
        <DialogContent style={{ background: "var(--g-bg-surface)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--g-text-primary)" }}>Send to All Buyers</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
              This will send an SMS to all buyers with CRM contacts linked to this property.
            </p>
            <Textarea
              value={bulkMsg}
              onChange={(e) => setBulkMsg(e.target.value)}
              rows={4}
              placeholder="Type your message to buyers..."
              style={{ background: "var(--g-bg-elevated)", color: "var(--g-text-primary)", borderColor: "var(--g-border-subtle)" }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSendOpen(false)}>Cancel</Button>
            <Button
              onClick={() => bulkSendMutation.mutate({ propertyId, message: bulkMsg })}
              disabled={!bulkMsg.trim() || bulkSendMutation.isPending}
              style={{ background: "#3b82f6", color: "white" }}
            >
              {bulkSendMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Sending...</> : <><Megaphone className="h-4 w-4 mr-1" /> Send to All</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PropertyDetail({
  propertyId, onClose,
}: {
  propertyId: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const teamRole = user?.teamRole || "admin";
  const allowedStages = useMemo(() => {
    const allStages = ["lead", "apt_set", "offer_made", "under_contract", "marketing", "buyer_negotiating", "closing", "closed", "follow_up", "dead"];
    if (teamRole === "dispo_manager") return ["marketing", "buyer_negotiating", "closing", "closed", "dead"];
    if (teamRole === "lead_manager" || teamRole === "acquisition_manager") return ["lead", "apt_set", "offer_made", "under_contract", "marketing", "closing", "closed"];
    return allStages;
  }, [teamRole]);
  const utils = trpc.useUtils();
  const { data: property, isLoading } = trpc.inventory.getPropertyById.useQuery({ propertyId });
  const { data: kpiMarkets } = trpc.kpi.listMarkets.useQuery();
  const { data: kpiSources } = trpc.kpi.listSources.useQuery();
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const updateMutation = trpc.inventory.updateProperty.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); toast.success("Property updated"); setEditOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateStatusMutation = trpc.inventory.updateProperty.useMutation({
    onSuccess: () => { utils.inventory.getPropertyById.invalidate({ propertyId }); utils.inventory.getProperties.invalidate(); utils.inventory.getActivityLog.invalidate({ propertyId }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
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
  const dom = daysOnMarket(property.createdAt);

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
                {allowedStages.map((k) => (
                  <SelectItem key={k} value={k}>{STATUS_CONFIG[k]?.label || k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* DOM heat indicator */}
            <div className="flex items-center gap-1 ml-auto">
              <div className="h-2 w-2 rounded-full" style={{ background: heatColor(dom) }} />
              <span className="text-[10px] font-medium" style={{ color: heatColor(dom) }}>{dom}d</span>
            </div>
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

      {/* Tab Navigation */}
      <div className="px-5 py-2 flex items-center gap-1 overflow-x-auto" style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
        {[
          { key: "overview", label: "Overview", icon: Home },
          { key: "buyers", label: "Buyers", icon: Users },
          { key: "outreach", label: "Outreach", icon: Send },
          { key: "activity", label: "Activity", icon: Activity },
          { key: "ai", label: "AI Assistant", icon: Bot },
          { key: "deal_blast", label: "Deal Blast", icon: Megaphone },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap"
            style={{
              background: activeTab === key ? "var(--g-accent-soft)" : "transparent",
              color: activeTab === key ? "var(--g-accent)" : "var(--g-text-tertiary)",
              border: activeTab === key ? "1px solid var(--g-accent)30" : "1px solid transparent",
            }}
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
      </div>

      {/* Quick Actions Bar */}
      <QuickActionsBar property={property} propertyId={propertyId} setActiveTab={setActiveTab} />

      {/* Scrollable Content - AI tab renders outside scroll wrapper for pinned input */}
      {activeTab === "ai" ? (
        <div className="flex-1 overflow-hidden px-5 py-4">
          <DispoAITab propertyId={propertyId} property={property} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <OverviewTab property={property} />
              <div style={{ borderTop: "1px solid var(--g-border-subtle)", paddingTop: 16 }}>
                <ResearchTab propertyId={propertyId} property={property} />
              </div>
            </div>
          )}
          {activeTab === "buyers" && <BuyersTab propertyId={propertyId} />}
          {activeTab === "outreach" && <OutreachTab property={property} propertyId={propertyId} />}
          {activeTab === "activity" && <ActivityTab propertyId={propertyId} />}
          {activeTab === "deal_blast" && <DealBlastTab propertyId={propertyId} property={property} />}
        </div>
      )}

      {/* Dialogs */}
      {editOpen && (
        <PropertyFormDialog
           open={editOpen}
           onOpenChange={setEditOpen}
           property={property}
           onSave={(data: any) => updateMutation.mutate({ propertyId, ...data })}
           isSaving={updateMutation.isPending}
           kpiMarkets={kpiMarkets}
           kpiSources={kpiSources}
        />
      )}
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
  const dom = daysOnMarket(property.createdAt);

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
      {/* Status + Type + DOM Heat */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge style={{ background: statusCfg.bg, color: statusCfg.color, border: "none", fontSize: "10px" }}>{statusCfg.label}</Badge>
          <span className="text-[10px] font-medium uppercase" style={{ color: "var(--g-text-tertiary)" }}>
            {property.propertyType?.replace("_", " ") || "House"}
          </span>
        </div>
        {/* DOM heat dot */}
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full" style={{ background: heatColor(dom) }} />
          <span className="text-[10px] font-medium" style={{ color: heatColor(dom) }}>{dom}d</span>
        </div>
      </div>

      {/* Address */}
      <h3 className="text-sm font-bold mb-0.5 truncate" style={{ color: "var(--g-text-primary)" }}>
        {property.address || <span style={{ color: '#f59e0b', fontStyle: 'italic' }}>Address Pending</span>}
      </h3>
      <p className="text-xs mb-3 truncate" style={{ color: "var(--g-text-secondary)" }}>
        {property.city || property.state ? `${property.city || '?'}, ${property.state || '?'} ${property.zip || ''}` : <span style={{ color: '#f59e0b' }}>Location missing</span>}
      </p>

      {/* Price Row */}
      <div className="flex items-center gap-3 mb-3">
        {property.askingPrice && (
          <div>
            <div className="text-[10px] uppercase" style={{ color: "var(--g-text-tertiary)" }}>Asking</div>
            <div className="text-sm font-bold" style={{ color: "var(--g-accent)" }}>{formatCurrency(property.askingPrice)}</div>
          </div>
        )}
        {property.contractPrice && (
          <div>
            <div className="text-[10px] uppercase" style={{ color: "var(--g-text-tertiary)" }}>Contract</div>
            <div className="text-sm font-bold" style={{ color: "var(--g-text-primary)" }}>{formatCurrency(property.contractPrice)}</div>
          </div>
        )}
        {(property.acceptedOffer || property.askingPrice) && property.contractPrice && (
          <div className="ml-auto">
            <div className="text-[10px] uppercase" style={{ color: "var(--g-text-tertiary)" }}>{property.acceptedOffer ? "Spread" : "Est. Spread"}</div>
            <div className="text-sm font-bold" style={{ color: "#22c55e" }}>{formatCurrency((property.acceptedOffer || property.askingPrice) - property.contractPrice)}</div>
          </div>
        )}
      </div>

      {/* Activity Indicators */}
      <div className="flex items-center gap-3 pt-2" style={{ borderTop: "1px solid var(--g-border-subtle)" }}>
        <div className="flex items-center gap-1" title="Sends">
          <Send className="h-3 w-3" style={{ color: activity.sendCount > 0 ? "#3b82f6" : "var(--g-text-tertiary)" }} />
          <span className="text-xs font-medium" style={{ color: activity.sendCount > 0 ? "#3b82f6" : "var(--g-text-tertiary)" }}>
            {activity.sendCount > 0 ? activity.sendCount : "—"}
          </span>
        </div>
        <div className="flex items-center gap-1" title={`${activity.totalRecipients || 0} total recipients`}>
          <Users className="h-3 w-3" style={{ color: activity.totalRecipients > 0 ? "#8b5cf6" : "var(--g-text-tertiary)" }} />
          <span className="text-xs font-medium" style={{ color: activity.totalRecipients > 0 ? "#8b5cf6" : "var(--g-text-tertiary)" }}>
            {activity.totalRecipients > 0 ? activity.totalRecipients : "—"}
          </span>
        </div>
        <div className="flex items-center gap-1" title="Offers">
          <DollarSign className="h-3 w-3" style={{ color: activity.offerCount > 0 ? "#f59e0b" : "var(--g-text-tertiary)" }} />
          <span className="text-xs font-medium" style={{ color: activity.offerCount > 0 ? "#f59e0b" : "var(--g-text-tertiary)" }}>
            {activity.offerCount > 0 ? activity.offerCount : "—"}
          </span>
        </div>
        <div className="flex items-center gap-1" title="Showings">
          <Eye className="h-3 w-3" style={{ color: activity.showingCount > 0 ? "#22c55e" : "var(--g-text-tertiary)" }} />
          <span className="text-xs font-medium" style={{ color: activity.showingCount > 0 ? "#22c55e" : "var(--g-text-tertiary)" }}>
            {activity.showingCount > 0 ? activity.showingCount : "—"}
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
  // Role-based default filter: dispo sees marketing, LM/AM see lead, admin sees all
  const defaultStatus = useMemo(() => {
    const role = user?.teamRole;
    if (role === "dispo_manager") return "marketing";
    if (role === "lead_manager" || role === "acquisition_manager") return "lead";
    return "lead";
  }, [user?.teamRole]);
  const [statusFilter, setStatusFilter] = useState(defaultStatus);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<"upload" | "mapping" | "importing" | "done">("upload");
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [columnMapping, setColumnMapping] = useState<Array<{ csvColumn: string; mappedTo: string }>>([]);
  const [importResult, setImportResult] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  // Role-based stage filtering (Fix #1: hide Dead from dispo; Fix #2: remove All tab)
  const teamRole = user?.teamRole || "admin";
  const visibleStages = useMemo(() => {
    if (teamRole === "dispo_manager") {
      return ["marketing", "buyer_negotiating", "closing", "closed"] as const;
    }
    if (teamRole === "lead_manager" || teamRole === "acquisition_manager") {
      return ["lead", "apt_set", "offer_made", "under_contract", "marketing", "closing", "closed"] as const;
    }
    return ["lead", "apt_set", "offer_made", "under_contract", "marketing", "buyer_negotiating", "closing", "closed", "follow_up", "dead"] as const;
  }, [teamRole]);

  // Always fetch ALL properties (no server-side status filter) so stage counts are accurate
  // Client-side filtering handles the status tab selection (Item #14 fix)
  const { data, isLoading } = trpc.inventory.getProperties.useQuery(
    { search: search || undefined, limit: 500 },
    { refetchInterval: 60000 }
  );

  // KPI markets/sources for searchable dropdowns
  const { data: kpiMarkets } = trpc.kpi.listMarkets.useQuery();
  const { data: kpiSources } = trpc.kpi.listSources.useQuery();

  const createMutation = trpc.inventory.createProperty.useMutation({
    onSuccess: (result) => {
      utils.inventory.getProperties.invalidate();
      toast.success("Property added");
      setAddOpen(false);
      setSelectedPropertyId(result.id);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const parseCsvMutation = trpc.inventory.parseCsvPreview.useMutation({
    onSuccess: (data) => {
      setCsvPreview(data);
      setColumnMapping(data.autoMapping);
      setImportStep("mapping");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const importCsvMutation = trpc.inventory.importFromCsv.useMutation({
    onSuccess: (result) => {
      setImportResult(result);
      setImportStep("done");
      utils.inventory.getProperties.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      parseCsvMutation.mutate({ csvText: text });
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const headers = ["Address","City","State","Zip","Property Type","Beds","Baths","Sqft","Year Built","Lot Size","Contract Price","Asking Price","ARV","Est Repairs","Assignment Fee","Seller Name","Seller Phone","Status","Market","Lockbox Code","Occupancy","Notes","Media Link","Lead Source"];
    const sample = ["123 Main St","Nashville","TN","37201","House","3","2","1500","1985","0.25 acres","$150,000","$185,000","$250,000","$35,000","$35,000","John Smith","(615) 555-1234","Marketing","Nashville","1234","Vacant","Motivated seller","https://drive.google.com/...","Direct Mail"];
    const csv = headers.join(",") + "\n" + sample.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "gunner-property-import-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const resetImport = () => {
    setImportOpen(false);
    setImportStep("upload");
    setCsvText("");
    setCsvPreview(null);
    setColumnMapping([]);
    setImportResult(null);
  };

  const FIELD_OPTIONS = [
    { value: "skip", label: "— Skip —" },
    { value: "address", label: "Address" },
    { value: "city", label: "City" },
    { value: "state", label: "State" },
    { value: "zip", label: "Zip" },
    { value: "propertyType", label: "Property Type" },
    { value: "beds", label: "Beds" },
    { value: "baths", label: "Baths" },
    { value: "sqft", label: "Sqft" },
    { value: "yearBuilt", label: "Year Built" },
    { value: "lotSize", label: "Lot Size" },
    { value: "contractPrice", label: "Contract Price" },
    { value: "askingPrice", label: "Asking Price" },
    { value: "arv", label: "ARV" },
    { value: "estRepairs", label: "Est Repairs" },
    { value: "assignmentFee", label: "Assignment Fee" },
    { value: "sellerName", label: "Seller Name" },
    { value: "sellerPhone", label: "Seller Phone" },
    { value: "status", label: "Status" },
    { value: "market", label: "Market" },
    { value: "lockboxCode", label: "Lockbox Code" },
    { value: "occupancyStatus", label: "Occupancy" },
    { value: "notes", label: "Notes" },
    { value: "description", label: "Description" },
    { value: "mediaLink", label: "Media Link" },
    { value: "leadSource", label: "Lead Source" },
    { value: "projectType", label: "Project Type" },
    { value: "opportunitySource", label: "Source" },
    { value: "acceptedOffer", label: "Accepted Offer" },
  ];

  const deleteMutation = trpc.inventory.deleteProperty.useMutation({
    onSuccess: () => {
      utils.inventory.getProperties.invalidate();
      toast.success("Property deleted");
      setDeleteConfirmId(null);
      if (selectedPropertyId === deleteConfirmId) setSelectedPropertyId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const bulkStatusMutation = trpc.inventory.bulkUpdateStatus.useMutation({
    onSuccess: (result: any) => {
      utils.inventory.getProperties.invalidate();
      toast.success(`Updated ${result.succeeded} of ${result.total} properties`);
      setSelectedIds(new Set());
      setBulkMode(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const bulkFieldMutation = trpc.inventory.bulkUpdateField.useMutation({
    onSuccess: (result: any) => {
      utils.inventory.getProperties.invalidate();
      toast.success(`Updated ${result.succeeded} of ${result.total} properties`);
      setSelectedIds(new Set());
      setBulkMode(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const bulkDeleteMutation = trpc.inventory.bulkDelete.useMutation({
    onSuccess: (result) => {
      utils.inventory.getProperties.invalidate();
      toast.success(`Deleted ${result.succeeded} of ${result.total} properties`);
      setSelectedIds(new Set());
      setBulkMode(false);
      setSelectedPropertyId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === properties.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(properties.map((p: any) => p.id)));
    }
  };

  const rawProperties = data?.items || [];
  const total = data?.total || 0;

  // Extract unique types and markets for filter dropdowns
  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    rawProperties.forEach((p: any) => { if (p.projectType) types.add(p.projectType); });
    return Array.from(types).sort();
  }, [rawProperties]);

  const uniqueMarkets = useMemo(() => {
    const markets = new Set<string>();
    rawProperties.forEach((p: any) => { if (p.market) markets.add(p.market); });
    return Array.from(markets).sort();
  }, [rawProperties]);

  // Apply status, type, and market filters (client-side for accurate stage counts)
  const filteredProperties = useMemo(() => {
    let result = rawProperties;
    // When searching, skip status filter to search across all statuses
    if (statusFilter && !search.trim()) {
      result = result.filter((p: any) => p.status === statusFilter);
    }
    if (typeFilter !== "all") {
      result = result.filter((p: any) => p.projectType === typeFilter);
    }
    if (marketFilter !== "all") {
      result = result.filter((p: any) => p.market === marketFilter);
    }
    return result;
  }, [rawProperties, statusFilter, typeFilter, marketFilter, search]);

  // Apply sorting
  const properties = useMemo(() => {
    if (!sortField) return filteredProperties;
    const sorted = [...filteredProperties].sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case "address": aVal = (a.address || "").toLowerCase(); bVal = (b.address || "").toLowerCase(); break;
        case "status": aVal = a.status || ""; bVal = b.status || ""; break;
        case "asking": aVal = a.askingPrice || 0; bVal = b.askingPrice || 0; break;
        case "contract": aVal = a.contractPrice || 0; bVal = b.contractPrice || 0; break;
        case "spread": {
          const aSpread = (a.acceptedOffer || a.askingPrice) && a.contractPrice ? (a.acceptedOffer || a.askingPrice) - a.contractPrice : 0;
          const bSpread = (b.acceptedOffer || b.askingPrice) && b.contractPrice ? (b.acceptedOffer || b.askingPrice) - b.contractPrice : 0;
          aVal = aSpread; bVal = bSpread; break;
        }
        case "sends": aVal = a._activity?.sendCount || 0; bVal = b._activity?.sendCount || 0; break;
        case "buyers": aVal = a._activity?.totalRecipients || 0; bVal = b._activity?.totalRecipients || 0; break;
        case "offers": aVal = a._activity?.offerCount || 0; bVal = b._activity?.offerCount || 0; break;
        case "showings": aVal = a._activity?.showingCount || 0; bVal = b._activity?.showingCount || 0; break;
        case "dom": aVal = daysOnMarket(a.createdAt); bVal = daysOnMarket(b.createdAt); break;
        default: return 0;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredProperties, sortField, sortDir]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rawProperties.forEach((p: any) => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });
    return counts;
  }, [rawProperties]);

  return (
    <div className="h-[calc(100vh-var(--g-topnav-h,56px))] flex flex-col overflow-hidden" style={{ background: "var(--g-bg-base)" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--g-text-primary)" }}>
            <Package className="h-5 w-5 inline mr-2" style={{ color: "var(--g-accent)" }} />
            Dispo Command Center
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>
            {total} {total === 1 ? "property" : "properties"} in inventory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
            size="sm"
            variant={bulkMode ? "default" : "outline"}
            className="text-xs"
            style={bulkMode ? { background: "var(--g-accent)", color: "#fff" } : {}}
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1" /> {bulkMode ? "Exit Bulk" : "Bulk Edit"}
          </Button>
          <Button onClick={handleDownloadTemplate} size="sm" variant="outline" className="text-xs">
            <Download className="h-3.5 w-3.5 mr-1" /> Template
          </Button>
          <Button onClick={() => setImportOpen(true)} size="sm" variant="outline" className="text-xs">
            <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
          </Button>
          <Button onClick={() => setAddOpen(true)} size="sm" style={{ background: "var(--g-accent)", color: "#fff" }}>
            <Plus className="h-4 w-4 mr-1" /> Add Property
          </Button>
        </div>
      </div>

      {/* Search & Filters Row */}
      <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
        <div className="relative w-64 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--g-text-tertiary)" }} />
          <Input
            className="pl-9"
            placeholder="Search all properties..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* View mode toggle */}
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "var(--g-bg-inset)" }}>
          <button onClick={() => setViewMode("table")} className={`p-1.5 rounded ${viewMode === "table" ? "bg-white shadow-sm" : ""}`} title="Table view">
            <ListIcon className="h-4 w-4" style={{ color: viewMode === "table" ? "var(--g-accent)" : "var(--g-text-tertiary)" }} />
          </button>
          <button onClick={() => setViewMode("card")} className={`p-1.5 rounded ${viewMode === "card" ? "bg-white shadow-sm" : ""}`} title="Card view">
            <LayoutGrid className="h-4 w-4" style={{ color: viewMode === "card" ? "var(--g-accent)" : "var(--g-text-tertiary)" }} />
          </button>
        </div>
        {/* Type filter */}
        {uniqueTypes.length > 0 && (
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs" style={{ background: "var(--g-bg-card)", borderColor: typeFilter !== "all" ? "var(--g-accent)" : "var(--g-border-subtle)", color: "var(--g-text-primary)" }}>
              <Filter className="h-3 w-3 mr-1" style={{ color: typeFilter !== "all" ? "var(--g-accent)" : "var(--g-text-tertiary)" }} />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {uniqueTypes.map(t => (
                <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* Market filter */}
        {uniqueMarkets.length > 0 && (
          <Select value={marketFilter} onValueChange={setMarketFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs" style={{ background: "var(--g-bg-card)", borderColor: marketFilter !== "all" ? "var(--g-accent)" : "var(--g-border-subtle)", color: "var(--g-text-primary)" }}>
              <Globe className="h-3 w-3 mr-1" style={{ color: marketFilter !== "all" ? "var(--g-accent)" : "var(--g-text-tertiary)" }} />
              <SelectValue placeholder="Market" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
              {uniqueMarkets.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* Clear filters */}
        {(typeFilter !== "all" || marketFilter !== "all") && (
          <button
            onClick={() => { setTypeFilter("all"); setMarketFilter("all"); }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{ color: "var(--g-accent)", background: "var(--g-accent-soft)" }}
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Status Pipeline Tabs */}
      <div className="px-5 py-2" style={{ background: "var(--g-bg-elevated)", borderBottom: "1px solid var(--g-border-subtle)" }}>
        <div className="flex items-center gap-1">
          {visibleStages.map((s, idx) => {
            const cfg = STATUS_CONFIG[s];
            const isActive = statusFilter === s;
            const count = (data?.items || []).filter((p: any) => p.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="group relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200"
                style={{
                  background: isActive ? cfg.bg : "transparent",
                  color: isActive ? cfg.color : "var(--g-text-tertiary)",
                  boxShadow: isActive ? `0 0 0 1px ${cfg.color}30, 0 1px 3px ${cfg.color}15` : "none",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 transition-transform duration-200"
                  style={{
                    background: isActive ? cfg.color : "var(--g-text-tertiary)",
                    opacity: isActive ? 1 : 0.4,
                    transform: isActive ? "scale(1.2)" : "scale(1)",
                  }}
                />
                {cfg.label}
                {count > 0 && (
                  <span
                    className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
                    style={{
                      background: isActive ? `${cfg.color}20` : "var(--g-bg-inset)",
                      color: isActive ? cfg.color : "var(--g-text-tertiary)",
                    }}
                  >
                    {count}
                  </span>
                )}
                {/* Active indicator line */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                    style={{ background: cfg.color }}
                  />
                )}
                {/* Connector arrow between stages */}
                {idx < visibleStages.length - 1 && (
                  <span
                    className="absolute -right-1 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none"
                    style={{ color: "var(--g-text-tertiary)", opacity: 0.3 }}
                  >
                    ›
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Property List */}
        <div className={`${selectedPropertyId ? "hidden md:block md:w-1/2 border-r" : "w-full"} overflow-y-auto p-4 transition-all duration-300`} style={{ borderColor: "var(--g-border-subtle)" }}>
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
          ) : viewMode === "table" ? (
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--g-border-subtle)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--g-bg-inset)" }}>
                      {bulkMode && (
                        <th className="px-3 py-2 w-8">
                          <button onClick={toggleSelectAll} className="flex items-center justify-center">
                            {selectedIds.size === properties.length && properties.length > 0
                              ? <CheckSquare className="h-4 w-4" style={{ color: "var(--g-accent)" }} />
                              : <Square className="h-4 w-4" style={{ color: "var(--g-text-tertiary)" }} />}
                          </button>
                        </th>
                      )}
                      {(() => {
                        const isDispoStage = ["marketing", "buyer_negotiating", "closing", "closed"].includes(statusFilter);
                        const baseCols = [
                          { key: "address", label: "Address", align: "text-left" },
                          { key: "status", label: "Status", align: "text-left" },
                          { key: "asking", label: "Asking", align: "text-right" },
                          { key: "contract", label: "Contract", align: "text-right" },
                          { key: "spread", label: "Spread", align: "text-right" },
                        ];
                        const dispoCols = [
                          { key: "sends", label: "Sends", align: "text-center" },
                          { key: "buyers", label: "Buyers", align: "text-center" },
                          { key: "offers", label: "Offers", align: "text-center" },
                          { key: "showings", label: "Showings", align: "text-center" },
                        ];
                        const acqCols = [
                          { key: "lastOffer", label: "Last Offer", align: "text-right" },
                          { key: "lastContacted", label: "Last Contacted", align: "text-center" },
                          { key: "lastConversation", label: "Last Conversation", align: "text-center" },
                        ];
                        const endCols = [
                          { key: "dom", label: "DOM", align: "text-center" },
                          { key: "actions", label: "", align: "text-center" },
                        ];
                        return [...baseCols, ...(isDispoStage ? dispoCols : acqCols), ...endCols];
                      })().map(col => (
                        <th
                          key={col.key}
                          className={`${col.align} px-3 py-2 font-semibold cursor-pointer select-none group`}
                          style={{ color: sortField === col.key ? "var(--g-accent)" : "var(--g-text-tertiary)" }}
                          onClick={() => handleSort(col.key)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {sortField === col.key ? (
                              sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((p: any) => {
                      const statusCfg = STATUS_CONFIG[p.status as PropertyStatus] || STATUS_CONFIG.lead;
                      const act = p._activity || {};
                      const dom = daysOnMarket(p.createdAt);
                      return (
                        <tr
                          key={p.id}
                          onClick={() => bulkMode ? toggleSelect(p.id) : setSelectedPropertyId(p.id)}
                          className="cursor-pointer transition-colors"
                          style={{
                            background: selectedIds.has(p.id) ? "var(--g-accent-soft)" : selectedPropertyId === p.id ? "var(--g-accent-soft)" : "var(--g-bg-card)",
                            borderBottom: "1px solid var(--g-border-subtle)",
                          }}
                          onMouseEnter={(e) => { if (!selectedIds.has(p.id) && selectedPropertyId !== p.id) e.currentTarget.style.background = "var(--g-bg-card-hover)"; }}
                          onMouseLeave={(e) => { if (!selectedIds.has(p.id) && selectedPropertyId !== p.id) e.currentTarget.style.background = "var(--g-bg-card)"; }}
                        >
                          {bulkMode && (
                            <td className="px-3 py-2.5 w-8">
                              {selectedIds.has(p.id)
                                ? <CheckSquare className="h-4 w-4" style={{ color: "var(--g-accent)" }} />
                                : <Square className="h-4 w-4" style={{ color: "var(--g-text-tertiary)" }} />}
                            </td>
                          )}
                          <td className="px-3 py-2.5">
                            <div className="font-semibold truncate max-w-[200px]" style={{ color: "var(--g-text-primary)" }}>{p.address}</div>
                            <div className="text-[10px] truncate" style={{ color: "var(--g-text-tertiary)" }}>{p.city}, {p.state} {p.zip}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge style={{ background: statusCfg.bg, color: statusCfg.color, border: "none", fontSize: "10px" }}>{statusCfg.label}</Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--g-accent)" }}>
                            {p.askingPrice ? formatCurrency(p.askingPrice) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--g-text-primary)" }}>
                            {p.contractPrice ? formatCurrency(p.contractPrice) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold" style={{ color: (p.acceptedOffer || p.askingPrice) && p.contractPrice ? "#22c55e" : "var(--g-text-tertiary)" }}>
                            {(p.acceptedOffer || p.askingPrice) && p.contractPrice ? formatCurrency((p.acceptedOffer || p.askingPrice) - p.contractPrice) : "—"}
                          </td>
                          {["marketing", "buyer_negotiating", "closing", "closed"].includes(statusFilter) ? (
                            <>
                              <td className="px-3 py-2.5 text-center" style={{ color: act.sendCount > 0 ? "#3b82f6" : "var(--g-text-tertiary)" }}>
                                {act.sendCount > 0 ? act.sendCount : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-center" style={{ color: (act.totalRecipients || 0) > 0 ? "#8b5cf6" : "var(--g-text-tertiary)" }}>
                                {(act.totalRecipients || 0) > 0 ? act.totalRecipients : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-center" style={{ color: act.offerCount > 0 ? "#f59e0b" : "var(--g-text-tertiary)" }}>
                                {act.offerCount > 0 ? act.offerCount : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-center" style={{ color: act.showingCount > 0 ? "#22c55e" : "var(--g-text-tertiary)" }}>
                                {act.showingCount > 0 ? act.showingCount : "—"}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2.5 text-right font-semibold" style={{ color: (p as any)._activity?.highestOffer ? "#22c55e" : "var(--g-text-tertiary)" }}>
                                {(p as any)._activity?.highestOffer ? formatCurrency((p as any)._activity.highestOffer) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-center text-[10px]" style={{ color: p.lastContactedAt ? "var(--g-text-secondary)" : "var(--g-text-tertiary)" }}>
                                {p.lastContactedAt ? new Date(p.lastContactedAt).toLocaleDateString() : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-center text-[10px]" style={{ color: p.lastConversationAt ? "#22c55e" : "var(--g-text-tertiary)" }}>
                                {p.lastConversationAt ? new Date(p.lastConversationAt).toLocaleDateString() : "—"}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2.5 text-center">
                            <span style={{ color: heatColor(dom) }}>{dom}d</span>
                          </td>
                          <td className="px-3 py-2.5 text-center w-10">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(p.id); }}
                              className="p-1.5 rounded-md transition-colors hover:bg-red-500/10"
                              style={{ color: "var(--g-text-tertiary)" }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--g-text-tertiary)"; }}
                              title="Delete property"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={`grid gap-3 ${selectedPropertyId ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
                {properties.map((p: any) => (
                  <PropertyCard
                    key={p.id}
                    property={p}
                    onClick={() => setSelectedPropertyId(p.id)}
                    isSelected={selectedPropertyId === p.id}
                  />
                ))}
              </div>
            )
          }
        </div>

        {/* Detail Panel */}
        {selectedPropertyId && (
          <>
            {/* Dark overlay on mobile */}
            <div 
              className="fixed inset-0 z-30 md:hidden" 
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
              onClick={() => setSelectedPropertyId(null)}
            />
            <div className="w-full md:w-1/2 overflow-hidden fixed md:static inset-0 z-40 md:z-auto" style={{ background: "var(--g-bg-surface)" }}>
              <PropertyDetail
                key={selectedPropertyId}
                propertyId={selectedPropertyId}
                onClose={() => setSelectedPropertyId(null)}
              />
            </div>
          </>
        )}
      </div>

      {/* Add Property Dialog */}
      {addOpen && (
        <PropertyFormDialog
           open={addOpen}
           onOpenChange={setAddOpen}
           onSave={(data: any) => createMutation.mutate(data)}
           isSaving={createMutation.isPending}
           kpiMarkets={kpiMarkets}
           kpiSources={kpiSources}
         />
      )}

      {/* CSV Import Dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => { if (!open) resetImport(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" style={{ background: "var(--g-bg-surface)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--g-text-primary)" }}>
              <FileUp className="h-5 w-5 inline mr-2" style={{ color: "var(--g-accent)" }} />
              {importStep === "upload" ? "Import Properties from CSV" :
               importStep === "mapping" ? "Map Columns" :
               importStep === "importing" ? "Importing..." : "Import Complete"}
            </DialogTitle>
          </DialogHeader>

          {importStep === "upload" && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-opacity-60 transition-all"
                style={{ borderColor: "var(--g-border-subtle)" }}
                onClick={() => document.getElementById("csv-file-input")?.click()}
              >
                <Upload className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--g-text-tertiary)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>Click to upload CSV file</p>
                <p className="text-xs mt-1" style={{ color: "var(--g-text-tertiary)" }}>or drag and drop</p>
                <input id="csv-file-input" type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </div>
              {parseCsvMutation.isPending && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--g-accent)" }} />
                  <span className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Parsing CSV...</span>
                </div>
              )}
              <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                Need a template? Click the "Template" button in the header to download one with all supported columns.
              </p>
            </div>
          )}

          {importStep === "mapping" && csvPreview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
                  <strong>{csvPreview.totalRows}</strong> rows found. Map your CSV columns to property fields:
                </p>
                <Badge variant="outline" className="text-xs">
                  {columnMapping.filter((m: any) => m.mappedTo !== "skip").length} mapped
                </Badge>
              </div>

              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--g-border-subtle)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--g-bg-elevated)" }}>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--g-text-secondary)" }}>CSV Column</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--g-text-secondary)" }}>Sample Data</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--g-text-secondary)" }}>Map To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columnMapping.map((m: any, idx: number) => (
                      <tr key={idx} style={{ borderTop: "1px solid var(--g-border-subtle)" }}>
                        <td className="px-3 py-2 font-mono" style={{ color: "var(--g-text-primary)" }}>{m.csvColumn}</td>
                        <td className="px-3 py-2" style={{ color: "var(--g-text-tertiary)" }}>
                          {csvPreview.sampleRows[0]?.[m.csvColumn] || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={m.mappedTo}
                            onChange={(e) => {
                              const updated = [...columnMapping];
                              updated[idx] = { ...updated[idx], mappedTo: e.target.value };
                              setColumnMapping(updated);
                            }}
                            className="w-full px-2 py-1 rounded text-xs"
                            style={{
                              background: "var(--g-bg-base)",
                              color: m.mappedTo === "skip" ? "var(--g-text-tertiary)" : "var(--g-text-primary)",
                              border: "1px solid var(--g-border-subtle)",
                            }}
                          >
                            {FIELD_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!columnMapping.some((m: any) => m.mappedTo === "address") && (
                <p className="text-xs font-medium" style={{ color: "#ef4444" }}>
                  ⚠ Address column must be mapped to import properties
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={resetImport}>Cancel</Button>
                <Button
                  onClick={() => {
                    setImportStep("importing");
                    importCsvMutation.mutate({ csvText, mapping: columnMapping });
                  }}
                  disabled={!columnMapping.some((m: any) => m.mappedTo === "address") || importCsvMutation.isPending}
                  style={{ background: "var(--g-accent)", color: "#fff" }}
                >
                  Import {csvPreview.totalRows} Properties
                </Button>
              </DialogFooter>
            </div>
          )}

          {importStep === "importing" && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mb-3" style={{ color: "var(--g-accent)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>Importing properties...</p>
              <p className="text-xs mt-1" style={{ color: "var(--g-text-tertiary)" }}>This may take a moment for large files</p>
            </div>
          )}

          {importStep === "done" && importResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg p-4 text-center" style={{ background: "var(--g-bg-elevated)" }}>
                  <p className="text-2xl font-bold" style={{ color: "#22c55e" }}>{importResult.imported}</p>
                  <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>Imported</p>
                </div>
                <div className="rounded-lg p-4 text-center" style={{ background: "var(--g-bg-elevated)" }}>
                  <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{importResult.duplicates}</p>
                  <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>Duplicates</p>
                </div>
                <div className="rounded-lg p-4 text-center" style={{ background: "var(--g-bg-elevated)" }}>
                  <p className="text-2xl font-bold" style={{ color: "var(--g-text-tertiary)" }}>{importResult.skipped}</p>
                  <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>Skipped</p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="rounded-lg p-3" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
                  <p className="text-xs font-medium mb-1" style={{ color: "#dc2626" }}>Errors ({importResult.errors.length}):</p>
                  <div className="max-h-24 overflow-y-auto">
                    {importResult.errors.map((err: string, i: number) => (
                      <p key={i} className="text-xs" style={{ color: "#dc2626" }}>{err}</p>
                    ))}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button onClick={resetImport} style={{ background: "var(--g-accent)", color: "#fff" }}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Action Bar */}
      {bulkMode && selectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl"
          style={{ background: "var(--g-bg-elevated)", border: "1px solid var(--g-border-subtle)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--g-text-primary)" }}>
            {selectedIds.size} selected
          </span>
          <div className="h-5 w-px" style={{ background: "var(--g-border-subtle)" }} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs">
                <ArrowRight className="h-3.5 w-3.5 mr-1" /> Move to Stage
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" style={{ background: "var(--g-bg-elevated)" }}>
              {(["lead", "apt_set", "offer_made", "under_contract", "marketing", "buyer_negotiating", "closing", "closed", "follow_up", "dead"] as const).map(s => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => bulkStatusMutation.mutate({ propertyIds: Array.from(selectedIds), status: s })}
                  style={{ color: STATUS_CONFIG[s]?.color || "var(--g-text-primary)" }}
                >
                  {STATUS_CONFIG[s]?.label || s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Bulk Set Market */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs">
                <MapPin className="h-3.5 w-3.5 mr-1" /> Set Market
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" style={{ background: "var(--g-bg-elevated)" }}>
              {(kpiMarkets || []).map((m: any) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => bulkFieldMutation.mutate({ propertyIds: Array.from(selectedIds), field: "market", value: m.name })}
                >
                  {m.name}
                </DropdownMenuItem>
              ))}
              {(!kpiMarkets || kpiMarkets.length === 0) && (
                <DropdownMenuItem disabled>No markets configured</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Bulk Set Source */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs">
                <Tag className="h-3.5 w-3.5 mr-1" /> Set Source
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" style={{ background: "var(--g-bg-elevated)" }}>
              {(kpiSources || []).map((s: any) => (
                <DropdownMenuItem
                  key={s.id}
                  onClick={() => bulkFieldMutation.mutate({ propertyIds: Array.from(selectedIds), field: "opportunitySource", value: s.name })}
                >
                  {s.name}
                </DropdownMenuItem>
              ))}
              {(!kpiSources || kpiSources.length === 0) && (
                <DropdownMenuItem disabled>No sources configured</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Bulk Set Project Type */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs">
                <Building className="h-3.5 w-3.5 mr-1" /> Set Project Type
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" style={{ background: "var(--g-bg-elevated)" }}>
              {["flipper", "landlord", "builder", "multi_family", "turn_key"].map(pt => (
                <DropdownMenuItem
                  key={pt}
                  onClick={() => bulkFieldMutation.mutate({ propertyIds: Array.from(selectedIds), field: "projectType", value: pt })}
                >
                  {pt.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="destructive"
            className="text-xs"
            onClick={() => {
              if (confirm(`Delete ${selectedIds.size} properties? This cannot be undone.`)) {
                bulkDeleteMutation.mutate({ propertyIds: Array.from(selectedIds) });
              }
            }}
            disabled={bulkDeleteMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => { setSelectedIds(new Set()); }}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
          {(bulkStatusMutation.isPending || bulkDeleteMutation.isPending) && (
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--g-accent)" }} />
          )}
        </div>
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
