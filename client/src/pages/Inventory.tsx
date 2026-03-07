import { useState, useMemo, useEffect, useRef } from "react";
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
} from "lucide-react";
import { Streamdown } from "streamdown";
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
              <Input placeholder="ZIP" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
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
              <Select value={form.projectType || "none"} onValueChange={(v) => setForm({ ...form, projectType: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Project Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project Type</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                  <SelectItem value="novation">Novation</SelectItem>
                  <SelectItem value="creative_finance">Creative Finance</SelectItem>
                  <SelectItem value="fix_and_flip">Fix & Flip</SelectItem>
                  <SelectItem value="buy_and_hold">Buy & Hold</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Market" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} />
              <Input placeholder="Opportunity Source" value={form.opportunitySource} onChange={(e) => setForm({ ...form, opportunitySource: e.target.value })} />
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
            {property.sellerPhone && <span style={{ color: "var(--g-text-secondary)" }}> ({property.sellerPhone})</span>}
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

  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;

  const buyerList = (buyers as any[]) || [];

  return (
    <div className="space-y-3">
      {/* Action Bar */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setAddBuyerOpen(true)}>
          <UserPlus className="h-3 w-3 mr-1" /> Add Buyer
        </Button>
        <Button size="sm" variant="outline" onClick={() => matchMutation.mutate({ propertyId })} disabled={matchMutation.isPending}>
          <Target className="h-3 w-3 mr-1" /> {matchMutation.isPending ? "Matching..." : "Match from GHL"}
        </Button>
      </div>

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
                {buyer.lastOfferAmount && <span className="font-semibold" style={{ color: "#22c55e" }}>Last Offer: {formatCurrency(buyer.lastOfferAmount)}</span>}
              </div>
              {/* Quick actions */}
              <div className="flex items-center gap-1 mt-2 pt-2" style={{ borderTop: "1px solid var(--g-border-subtle)" }}>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => recordSendMutation.mutate({ buyerActivityId: buyer.id, channel: "sms" })}>
                  <MessageSquare className="h-3 w-3 mr-1" /> SMS
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => recordSendMutation.mutate({ buyerActivityId: buyer.id, channel: "email" })}>
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
function DispoAITab({ propertyId, property }: { propertyId: number; property: any }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;
    const userMsg = { role: "user" as const, content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/dispo-assistant/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text.trim(),
          propertyId,
          history: messages.slice(-10),
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
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: last.content + parsed.content };
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
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { ...last, content: "Failed to connect. Please try again." };
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const suggestedPrompts = [
    `What's the best pricing strategy for ${property?.address || "this property"}?`,
    "Which buyer segments should I target first?",
    "Help me craft a compelling SMS blast for this deal",
    "What should my follow-up cadence look like?",
    "How do I handle lowball offers on this property?",
    "What's my negotiation strategy with multiple offers?",
  ];

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 400 }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-3" style={{ maxHeight: "calc(100vh - 400px)" }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="p-3 rounded-full" style={{ background: "var(--g-accent-soft)" }}>
              <Bot className="h-8 w-8" style={{ color: "var(--g-accent)" }} />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--g-text-primary)" }}>AI Dispo Assistant</h3>
              <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>Property-aware AI for pricing, buyer targeting, negotiation, and deal strategy</p>
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
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${msg.role === "user" ? "" : ""}`}
                style={msg.role === "user"
                  ? { background: "var(--g-accent)", color: "#fff" }
                  : { background: "var(--g-surface)", color: "var(--g-text-primary)", border: "1px solid var(--g-border-subtle)" }
                }
              >
                {msg.role === "assistant" && msg.content ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:text-xs [&_li]:text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs">
                    <Streamdown>{msg.content}</Streamdown>
                  </div>
                ) : msg.role === "assistant" && !msg.content && isStreaming ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--g-accent)" }} />
                    <span style={{ color: "var(--g-text-tertiary)" }}>Thinking...</span>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="pt-3" style={{ borderTop: "1px solid var(--g-border-subtle)" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2 items-end"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Ask about pricing, buyers, negotiation..."
            rows={1}
            className="flex-1 text-xs px-3 py-2 rounded-lg resize-none outline-none"
            style={{ background: "var(--g-surface)", border: "1px solid var(--g-border-subtle)", color: "var(--g-text-primary)", maxHeight: 80 }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all disabled:opacity-40"
            style={{ background: "var(--g-accent)", color: "#fff" }}
          >
            {isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── PROPERTY DETAIL PANEL ───
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

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === "overview" && <OverviewTab property={property} />}
        {activeTab === "buyers" && <BuyersTab propertyId={propertyId} />}
        {activeTab === "outreach" && <OutreachTab property={property} propertyId={propertyId} />}
        {activeTab === "activity" && <ActivityTab propertyId={propertyId} />}
        {activeTab === "ai" && <DispoAITab propertyId={propertyId} property={property} />}
      </div>

      {/* Dialogs */}
      {editOpen && (
        <PropertyFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          property={property}
          onSave={(data: any) => updateMutation.mutate({ propertyId, ...data })}
          isSaving={updateMutation.isPending}
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
      <h3 className="text-sm font-bold mb-0.5 truncate" style={{ color: "var(--g-text-primary)" }}>{property.address}</h3>
      <p className="text-xs mb-3 truncate" style={{ color: "var(--g-text-secondary)" }}>
        {property.city}, {property.state} {property.zip}
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
  // Role-based default filter: dispo sees marketing, LM/AM see lead, admin sees all
  const defaultStatus = useMemo(() => {
    const role = user?.teamRole;
    if (role === "dispo_manager") return "marketing";
    if (role === "lead_manager" || role === "acquisition_manager") return "lead";
    return "all";
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

  // Role-based stage filtering
  const teamRole = user?.teamRole || "admin";
  const visibleStages = useMemo(() => {
    const allStages = ["all", "lead", "apt_set", "offer_made", "under_contract", "marketing", "buyer_negotiating", "closing", "closed", "follow_up", "dead"] as const;
    if (teamRole === "dispo_manager") {
      return ["all", "marketing", "buyer_negotiating", "closing", "closed", "dead"] as const;
    }
    if (teamRole === "lead_manager" || teamRole === "acquisition_manager") {
      return ["all", "lead", "apt_set", "offer_made", "under_contract", "marketing", "closing", "closed"] as const;
    }
    return allStages;
  }, [teamRole]);

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

  // Apply type and market filters
  const filteredProperties = useMemo(() => {
    let result = rawProperties;
    if (typeFilter !== "all") {
      result = result.filter((p: any) => p.projectType === typeFilter);
    }
    if (marketFilter !== "all") {
      result = result.filter((p: any) => p.market === marketFilter);
    }
    return result;
  }, [rawProperties, typeFilter, marketFilter]);

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
        case "sends": aVal = a._activity?.sendCount || 0; bVal = b._activity?.sendCount || 0; break;
        case "offers": aVal = a._activity?.offerCount || 0; bVal = b._activity?.offerCount || 0; break;
        case "type": aVal = (a.projectType || "").toLowerCase(); bVal = (b.projectType || "").toLowerCase(); break;
        case "market": aVal = (a.market || "").toLowerCase(); bVal = (b.market || "").toLowerCase(); break;
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
    const counts: Record<string, number> = { all: total };
    rawProperties.forEach((p: any) => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });
    return counts;
  }, [rawProperties, total]);

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
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {visibleStages.map((s) => {
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
          ) : viewMode === "table" ? (
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--g-border-subtle)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--g-bg-inset)" }}>
                      {[
                        { key: "address", label: "Address", align: "text-left" },
                        { key: "status", label: "Status", align: "text-left" },
                        { key: "asking", label: "Asking", align: "text-right" },
                        { key: "contract", label: "Contract", align: "text-right" },
                        { key: "sends", label: "Sends", align: "text-center" },
                        { key: "offers", label: "Offers", align: "text-center" },
                        { key: "type", label: "Type", align: "text-left" },
                        { key: "market", label: "Market", align: "text-left" },
                        { key: "dom", label: "DOM", align: "text-center" },
                      ].map(col => (
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
                          onClick={() => setSelectedPropertyId(p.id)}
                          className="cursor-pointer transition-colors"
                          style={{
                            background: selectedPropertyId === p.id ? "var(--g-accent-soft)" : "var(--g-bg-card)",
                            borderBottom: "1px solid var(--g-border-subtle)",
                          }}
                          onMouseEnter={(e) => { if (selectedPropertyId !== p.id) e.currentTarget.style.background = "var(--g-bg-card-hover)"; }}
                          onMouseLeave={(e) => { if (selectedPropertyId !== p.id) e.currentTarget.style.background = "var(--g-bg-card)"; }}
                        >
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
                          <td className="px-3 py-2.5 text-center" style={{ color: act.sendCount > 0 ? "#3b82f6" : "var(--g-text-tertiary)" }}>
                            {act.sendCount || 0}
                          </td>
                          <td className="px-3 py-2.5 text-center" style={{ color: act.offerCount > 0 ? "#f59e0b" : "var(--g-text-tertiary)" }}>
                            {act.offerCount || 0}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[10px] truncate max-w-[80px] block" style={{ color: p.projectType ? "var(--g-text-primary)" : "var(--g-text-tertiary)" }}>
                              {p.projectType ? p.projectType.charAt(0).toUpperCase() + p.projectType.slice(1) : "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[10px] truncate max-w-[100px] block" style={{ color: p.market ? "var(--g-text-primary)" : "var(--g-text-tertiary)" }}>
                              {p.market || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span style={{ color: heatColor(dom) }}>{dom}d</span>
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
          onSave={(data: any) => createMutation.mutate(data)}
          isSaving={createMutation.isPending}
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
