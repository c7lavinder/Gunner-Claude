/**
 * Deal Blast Tab — AI-generates SMS, Email, and PDF flyer per buyer tier.
 * Features:
 * - Auto-assign buyer tiers based on activity/CRM data
 * - Generate content per tier with AI
 * - Edit content inline (Gunner learns from edits)
 * - One-click send via GHL (SMS, Email, or both)
 * - Copy to clipboard for manual send
 */

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Sparkles, Send, Mail, MessageSquare, FileText, Copy,
  ChevronDown, ChevronUp, RefreshCw, Loader2, Check, Download,
  Crown, Star, Handshake, Users, Ban, Edit, Save, X,
  Zap, AlertTriangle, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

// ─── Tier Config ───

type BuyerTier = "priority" | "qualified" | "jv_partner" | "unqualified";

const TIER_CONFIG: Record<BuyerTier, {
  label: string;
  description: string;
  icon: typeof Crown;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  priority: {
    label: "Priority",
    description: "First look, exclusive/urgent messaging",
    icon: Crown,
    color: "#eab308",
    bgColor: "rgba(234, 179, 8, 0.08)",
    borderColor: "rgba(234, 179, 8, 0.2)",
  },
  qualified: {
    label: "Qualified",
    description: "Professional, data-driven tone",
    icon: Star,
    color: "#3b82f6",
    bgColor: "rgba(59, 130, 246, 0.08)",
    borderColor: "rgba(59, 130, 246, 0.2)",
  },
  jv_partner: {
    label: "JV Partner",
    description: "Partnership angle, shared upside",
    icon: Handshake,
    color: "#8b5cf6",
    bgColor: "rgba(139, 92, 246, 0.08)",
    borderColor: "rgba(139, 92, 246, 0.2)",
  },
  unqualified: {
    label: "Unqualified",
    description: "Standard blast, basic info",
    icon: Users,
    color: "#64748b",
    bgColor: "rgba(100, 116, 139, 0.08)",
    borderColor: "rgba(100, 116, 139, 0.2)",
  },
};

const ALL_TIERS: BuyerTier[] = ["priority", "qualified", "jv_partner", "unqualified"];

// ─── Types ───

interface Distribution {
  id: number;
  buyerTier: string;
  smsContent: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  editedSmsContent: string | null;
  editedEmailSubject: string | null;
  editedEmailBody: string | null;
  pdfUrl: string | null;
  status: string;
  createdAt: string | Date;
}

// ─── Copy to Clipboard Helper ───

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} copied to clipboard`);
  }).catch(() => {
    toast.error("Failed to copy");
  });
}

// ─── Send Confirmation Dialog ───

function SendConfirmDialog({
  tier,
  buyerCount,
  channel,
  onConfirm,
  onCancel,
  isPending,
}: {
  tier: BuyerTier;
  buyerCount: number;
  channel: "sms" | "email" | "both";
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const cfg = TIER_CONFIG[tier];
  const channelLabel = channel === "both" ? "SMS + Email" : channel === "sms" ? "SMS" : "Email";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="rounded-xl p-5 max-w-sm w-full mx-4 space-y-4" style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" style={{ color: "#eab308" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--g-text-primary)" }}>Confirm Send</h3>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--g-text-secondary)" }}>
          You're about to send <strong>{channelLabel}</strong> to{" "}
          <strong style={{ color: cfg.color }}>{buyerCount} {cfg.label}</strong> buyer{buyerCount !== 1 ? "s" : ""} via GHL.
        </p>
        <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
          This action cannot be undone. Messages will be sent immediately through your GHL account.
        </p>
        <div className="flex items-center gap-2 justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
            style={{ background: cfg.color, color: "#fff" }}
          >
            {isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Sending...</>
            ) : (
              <><Send className="h-3.5 w-3.5 mr-1.5" /> Send Now</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tier Content Card ───

function TierContentCard({
  distribution,
  propertyId,
  buyerCount,
}: {
  distribution: Distribution;
  propertyId: number;
  buyerCount: number;
}) {
  const tier = distribution.buyerTier as BuyerTier;
  const cfg = TIER_CONFIG[tier];
  const Icon = cfg?.icon || Users;
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState<"sms" | "email" | null>(null);
  const [editSms, setEditSms] = useState("");
  const [editEmailSubject, setEditEmailSubject] = useState("");
  const [editEmailBody, setEditEmailBody] = useState("");
  const [sendConfirm, setSendConfirm] = useState<"sms" | "email" | "both" | null>(null);

  const utils = trpc.useUtils();
  const updateMutation = trpc.inventory.updateDistribution.useMutation({
    onSuccess: () => {
      utils.inventory.getDistributions.invalidate({ propertyId });
      toast.success("Content saved — Gunner is learning from your edits");
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const regenerateMutation = trpc.inventory.regenerateTierContent.useMutation({
    onSuccess: () => {
      utils.inventory.getDistributions.invalidate({ propertyId });
      toast.success("Content regenerated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendMutation = trpc.inventory.sendDealBlast.useMutation({
    onSuccess: (data) => {
      utils.inventory.getDistributions.invalidate({ propertyId });
      utils.inventory.getBuyerCountsByTier.invalidate({ propertyId });
      setSendConfirm(null);
      if (data.sent > 0) {
        toast.success(`Sent to ${data.sent} buyer${data.sent !== 1 ? "s" : ""}${data.failed > 0 ? ` (${data.failed} failed)` : ""}`);
      } else {
        toast.error(`Send failed for all ${data.failed} buyer(s)`);
      }
    },
    onError: (e: any) => {
      setSendConfirm(null);
      toast.error(e.message);
    },
  });

  // Use edited version if available, otherwise original
  const sms = distribution.editedSmsContent || distribution.smsContent || "";
  const emailSubject = distribution.editedEmailSubject || distribution.emailSubject || "";
  const emailBody = distribution.editedEmailBody || distribution.emailBody || "";

  const startEditSms = () => { setEditSms(sms); setEditing("sms"); };
  const startEditEmail = () => { setEditEmailSubject(emailSubject); setEditEmailBody(emailBody); setEditing("email"); };
  const saveSmsEdit = () => {
    updateMutation.mutate({ distributionId: distribution.id, editedSmsContent: editSms, status: "reviewed" });
  };
  const saveEmailEdit = () => {
    updateMutation.mutate({ distributionId: distribution.id, editedEmailSubject: editEmailSubject, editedEmailBody: editEmailBody, status: "reviewed" });
  };

  const handleSend = (channel: "sms" | "email" | "both") => {
    sendMutation.mutate({ propertyId, distributionId: distribution.id, channel });
  };

  if (!cfg) return null;

  return (
    <>
      {sendConfirm && (
        <SendConfirmDialog
          tier={tier}
          buyerCount={buyerCount}
          channel={sendConfirm}
          onConfirm={() => handleSend(sendConfirm)}
          onCancel={() => setSendConfirm(null)}
          isPending={sendMutation.isPending}
        />
      )}
      <div
        className="rounded-xl overflow-hidden transition-all"
        style={{ background: "var(--g-bg-card)", border: `1px solid ${cfg.borderColor}` }}
      >
        {/* Tier Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-3 flex items-center justify-between"
          style={{ background: cfg.bgColor }}
        >
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" style={{ color: cfg.color }} />
            <span className="font-semibold text-sm" style={{ color: "var(--g-text-primary)" }}>
              {cfg.label}
            </span>
            {buyerCount > 0 && (
              <Badge className="text-[10px] h-4 px-1.5" style={{ background: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}` }}>
                {buyerCount} buyer{buyerCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {distribution.status === "sent" && (
              <Badge className="text-[10px]" style={{ background: "rgba(34, 197, 94, 0.15)", color: "#22c55e", border: "none" }}>
                Sent
              </Badge>
            )}
            {distribution.status === "reviewed" && (
              <Badge className="text-[10px]" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", border: "none" }}>
                Reviewed
              </Badge>
            )}
            {expanded ? <ChevronUp className="h-4 w-4" style={{ color: "var(--g-text-tertiary)" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "var(--g-text-tertiary)" }} />}
          </div>
        </button>

        {expanded && (
          <div className="p-4 space-y-4">
            {/* SMS Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--g-text-secondary)" }}>SMS</span>
                  <span className="text-[10px]" style={{ color: "var(--g-text-tertiary)" }}>({sms.length} chars)</span>
                </div>
                <div className="flex items-center gap-1">
                  {editing !== "sms" && (
                    <>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={startEditSms}>
                        <Edit className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => copyToClipboard(sms, "SMS")}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {editing === "sms" ? (
                <div className="space-y-2">
                  <Textarea
                    value={editSms}
                    onChange={(e) => setEditSms(e.target.value)}
                    className="text-sm min-h-[80px]"
                    style={{ background: "var(--g-bg-elevated)", color: "var(--g-text-primary)", border: `1px solid ${cfg.borderColor}` }}
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-[10px]" style={{ color: editSms.length > 320 ? "#ef4444" : "var(--g-text-tertiary)" }}>
                      {editSms.length}/320
                    </span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(null)}>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={saveSmsEdit} disabled={updateMutation.isPending}
                      style={{ background: cfg.color, color: "#fff" }}>
                      {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-lg px-3 py-2.5 text-sm leading-relaxed"
                  style={{ background: "var(--g-bg-elevated)", color: "var(--g-text-primary)", border: "1px solid var(--g-border-subtle)" }}
                >
                  {sms || "No SMS generated"}
                </div>
              )}
            </div>

            {/* Email Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" style={{ color: "#3b82f6" }} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--g-text-secondary)" }}>Email</span>
                </div>
                <div className="flex items-center gap-1">
                  {editing !== "email" && (
                    <>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={startEditEmail}>
                        <Edit className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => copyToClipboard(`Subject: ${emailSubject}\n\n${emailBody}`, "Email")}>
                        <Copy className="h-3 w-3 mr-1" /> Copy All
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {editing === "email" ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-medium mb-1 block" style={{ color: "var(--g-text-tertiary)" }}>Subject</label>
                    <Input
                      value={editEmailSubject}
                      onChange={(e) => setEditEmailSubject(e.target.value)}
                      className="text-sm"
                      style={{ background: "var(--g-bg-elevated)", color: "var(--g-text-primary)", border: `1px solid ${cfg.borderColor}` }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium mb-1 block" style={{ color: "var(--g-text-tertiary)" }}>Body</label>
                    <Textarea
                      value={editEmailBody}
                      onChange={(e) => setEditEmailBody(e.target.value)}
                      className="text-sm min-h-[160px]"
                      style={{ background: "var(--g-bg-elevated)", color: "var(--g-text-primary)", border: `1px solid ${cfg.borderColor}` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(null)}>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={saveEmailEdit} disabled={updateMutation.isPending}
                      style={{ background: cfg.color, color: "#fff" }}>
                      {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium" style={{ color: "var(--g-text-tertiary)" }}>Subject:</span>
                    <span className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>{emailSubject || "No subject"}</span>
                    <Button variant="ghost" size="sm" className="h-5 px-1.5 ml-auto" onClick={() => copyToClipboard(emailSubject, "Subject")}>
                      <Copy className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                  <div
                    className="rounded-lg px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto"
                    style={{ background: "var(--g-bg-elevated)", color: "var(--g-text-primary)", border: "1px solid var(--g-border-subtle)" }}
                  >
                    {emailBody || "No email body generated"}
                  </div>
                </div>
              )}
            </div>

            {/* Actions Row */}
            <div className="flex items-center justify-between pt-2 flex-wrap gap-2" style={{ borderTop: "1px solid var(--g-border-subtle)" }}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => regenerateMutation.mutate({ propertyId, tier })}
                disabled={regenerateMutation.isPending}
              >
                {regenerateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Regenerate
              </Button>
              <div className="flex items-center gap-1.5">
                {/* Send via GHL buttons */}
                {distribution.status !== "sent" && buyerCount > 0 && (
                  <>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      style={{ background: "rgba(34, 197, 94, 0.12)", color: "#22c55e", border: "1px solid rgba(34, 197, 94, 0.25)" }}
                      onClick={() => setSendConfirm("sms")}
                      disabled={sendMutation.isPending || !sms}
                    >
                      <MessageSquare className="h-3 w-3 mr-1" /> Send SMS
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      style={{ background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6", border: "1px solid rgba(59, 130, 246, 0.25)" }}
                      onClick={() => setSendConfirm("email")}
                      disabled={sendMutation.isPending || !emailBody}
                    >
                      <Mail className="h-3 w-3 mr-1" /> Send Email
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      style={{ background: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}` }}
                      onClick={() => setSendConfirm("both")}
                      disabled={sendMutation.isPending || (!sms && !emailBody)}
                    >
                      <Send className="h-3 w-3 mr-1" /> Send Both
                    </Button>
                  </>
                )}
                {distribution.status === "sent" && (
                  <Badge className="text-[10px] h-6 px-2" style={{ background: "rgba(34, 197, 94, 0.15)", color: "#22c55e", border: "none" }}>
                    <Check className="h-3 w-3 mr-1" /> Sent via GHL
                  </Badge>
                )}
                {buyerCount === 0 && distribution.status !== "sent" && (
                  <span className="text-[10px]" style={{ color: "var(--g-text-tertiary)" }}>
                    No {cfg.label} buyers matched — match buyers first
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Component ───

export default function DealBlastTab({
  propertyId,
  property,
}: {
  propertyId: number;
  property: any;
}) {
  const [selectedTiers, setSelectedTiers] = useState<Set<BuyerTier>>(() => new Set<BuyerTier>(["priority", "qualified"]));
  const [generatePdf, setGeneratePdf] = useState(true);

  const utils = trpc.useUtils();
  const { data: distributions, isLoading: loadingDist } = trpc.inventory.getDistributions.useQuery({ propertyId });
  const { data: buyerCounts } = trpc.inventory.getBuyerCountsByTier.useQuery({ propertyId });

  const generateMutation = trpc.inventory.generateDealContent.useMutation({
    onSuccess: (data) => {
      utils.inventory.getDistributions.invalidate({ propertyId });
      toast.success(`Generated content for ${data.distributions.length} tier(s)${data.pdfUrl ? " + PDF flyer" : ""}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const autoTierMutation = trpc.inventory.autoAssignTiers.useMutation({
    onSuccess: (data) => {
      utils.inventory.getBuyerCountsByTier.invalidate({ propertyId });
      if (data.changed > 0) {
        toast.success(`Auto-assigned tiers: ${data.changed} of ${data.total} buyers updated`);
      } else {
        toast.info(`All ${data.total} buyers already have correct tiers`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleTier = useCallback((tier: BuyerTier) => {
    setSelectedTiers(prev => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }, []);

  const handleGenerate = () => {
    if (selectedTiers.size === 0) {
      toast.error("Select at least one buyer tier");
      return;
    }
    generateMutation.mutate({
      propertyId,
      tiers: Array.from(selectedTiers),
      generatePdf,
    });
  };

  const latestPdfUrl = distributions?.find(d => d.pdfUrl)?.pdfUrl;
  const hasExisting = distributions && distributions.length > 0;
  const totalBuyers = buyerCounts
    ? Object.values(buyerCounts).reduce((sum, c) => sum + c.total, 0)
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ color: "var(--g-text-primary)" }}>
            <Sparkles className="h-4 w-4" style={{ color: "var(--g-accent)" }} />
            Deal Blast Generator
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>
            AI-generate SMS, email, and PDF flyer — then send directly via GHL
          </p>
        </div>
        <div className="flex items-center gap-2">
          {latestPdfUrl && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => window.open(latestPdfUrl, "_blank")}
            >
              <FileText className="h-3 w-3 mr-1" /> PDF Flyer
            </Button>
          )}
        </div>
      </div>

      {/* Auto-Tier Assignment */}
      <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: "rgba(139, 92, 246, 0.06)", border: "1px solid rgba(139, 92, 246, 0.15)" }}>
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4" style={{ color: "#8b5cf6" }} />
          <div>
            <span className="text-xs font-semibold" style={{ color: "var(--g-text-primary)" }}>
              Auto-Assign Tiers
            </span>
            <span className="text-[10px] ml-2" style={{ color: "var(--g-text-tertiary)" }}>
              {totalBuyers > 0 ? `${totalBuyers} matched buyer${totalBuyers !== 1 ? "s" : ""}` : "No buyers matched yet"}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          className="h-7 text-xs"
          style={{ background: "rgba(139, 92, 246, 0.15)", color: "#8b5cf6", border: "1px solid rgba(139, 92, 246, 0.3)" }}
          onClick={() => autoTierMutation.mutate({ propertyId })}
          disabled={autoTierMutation.isPending || totalBuyers === 0}
        >
          {autoTierMutation.isPending ? (
            <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Assigning...</>
          ) : (
            <><Zap className="h-3 w-3 mr-1" /> Auto-Assign</>
          )}
        </Button>
      </div>

      {/* Tier Selection with Buyer Counts */}
      <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--g-bg-elevated)", border: "1px solid var(--g-border-subtle)" }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold" style={{ color: "var(--g-text-secondary)" }}>Select Buyer Tiers</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={generatePdf}
              onChange={(e) => setGeneratePdf(e.target.checked)}
              className="rounded"
            />
            <span className="text-[10px]" style={{ color: "var(--g-text-tertiary)" }}>Generate PDF Flyer</span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ALL_TIERS.map(tier => {
            const cfg = TIER_CONFIG[tier];
            const Icon = cfg.icon;
            const isSelected = selectedTiers.has(tier);
            const count = buyerCounts?.[tier];
            return (
              <button
                key={tier}
                onClick={() => toggleTier(tier)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all"
                style={{
                  background: isSelected ? cfg.bgColor : "var(--g-bg-surface)",
                  border: `1px solid ${isSelected ? cfg.borderColor : "var(--g-border-subtle)"}`,
                  opacity: isSelected ? 1 : 0.6,
                }}
              >
                <div className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: isSelected ? cfg.color : "var(--g-bg-elevated)" }}>
                  {isSelected ? <Check className="h-3 w-3 text-white" /> : <Icon className="h-3 w-3" style={{ color: "var(--g-text-tertiary)" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium" style={{ color: "var(--g-text-primary)" }}>{cfg.label}</span>
                    {count && count.total > 0 && (
                      <Badge className="text-[9px] h-3.5 px-1" style={{ background: cfg.bgColor, color: cfg.color, border: "none" }}>
                        {count.withContact}/{count.total}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--g-text-tertiary)" }}>{cfg.description}</div>
                </div>
              </button>
            );
          })}
        </div>
        <Button
          className="w-full mt-2"
          size="sm"
          onClick={handleGenerate}
          disabled={generateMutation.isPending || selectedTiers.size === 0}
          style={{ background: "var(--g-accent)", color: "#fff" }}
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Generating content{generatePdf ? " + PDF" : ""}...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {hasExisting ? "Regenerate" : "Generate"} for {selectedTiers.size} Tier{selectedTiers.size !== 1 ? "s" : ""}
            </>
          )}
        </Button>
      </div>

      {/* Generated Content */}
      {loadingDist ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="rounded-xl h-32 animate-pulse" style={{ background: "var(--g-bg-elevated)" }} />
          ))}
        </div>
      ) : hasExisting ? (
        <div className="space-y-3">
          {distributions!.map(dist => {
            const tierCount = buyerCounts?.[dist.buyerTier as BuyerTier];
            return (
              <TierContentCard
                key={dist.id}
                distribution={dist as Distribution}
                propertyId={propertyId}
                buyerCount={tierCount?.withContact || 0}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 rounded-xl" style={{ background: "var(--g-bg-elevated)", border: "1px dashed var(--g-border-subtle)" }}>
          <Sparkles className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--g-text-tertiary)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--g-text-secondary)" }}>No deal content generated yet</p>
          <p className="text-xs mt-1" style={{ color: "var(--g-text-tertiary)" }}>
            Select tiers above and click Generate to create SMS, email, and PDF content
          </p>
        </div>
      )}

      {/* Learning Note */}
      {hasExisting && (
        <div className="rounded-lg px-3 py-2 flex items-start gap-2" style={{ background: "rgba(59, 130, 246, 0.06)", border: "1px solid rgba(59, 130, 246, 0.15)" }}>
          <Sparkles className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--g-text-secondary)" }}>
            <strong>Gunner learns from your edits.</strong> When you edit the generated SMS or email, Gunner saves the changes and uses them to improve future generations for this buyer tier. The more you edit, the better it gets at matching your voice.
          </p>
        </div>
      )}
    </div>
  );
}
