import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Phone, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface TeamMember {
  id: number;
  name: string | null;
  teamRole: string | null;
  lcPhone?: string | null;
}

interface Role {
  code: string;
  name: string;
}

interface TeamTabProps {
  isAdmin: boolean;
  team: TeamMember[];
  roles: Role[];
  showInvite: boolean;
  setShowInvite: (v: boolean) => void;
  inviteName: string;
  setInviteName: (v: string) => void;
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteRole: string;
  setInviteRole: (v: string) => void;
  onSendInvite: () => Promise<void>;
  isInviting: boolean;
  onRemoveMember: (id: number) => Promise<void>;
  isRemoving: boolean;
  onUpdateRole: (id: number, role: string) => void;
}

export function TeamTab({
  isAdmin,
  team,
  roles,
  showInvite,
  setShowInvite,
  inviteName,
  setInviteName,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  onSendInvite,
  isInviting,
  onRemoveMember,
  isRemoving,
  onUpdateRole,
}: TeamTabProps) {
  return (
    <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Team</CardTitle>
        {isAdmin && <Button size="sm" onClick={() => setShowInvite(!showInvite)}><Plus className="size-4" />Invite</Button>}
      </CardHeader>
      <CardContent className="space-y-4">
        {showInvite && (
          <div className="p-4 rounded-lg space-y-3 bg-[var(--g-bg-inset)] border border-[var(--g-border-subtle)]">
            <div className="space-y-2"><Label>Name</Label><Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Name" className="bg-[var(--g-bg-surface)]" /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email" className="bg-[var(--g-bg-surface)]" /></div>
            <div className="space-y-2"><Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="w-full bg-[var(--g-bg-surface)]"><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={onSendInvite} disabled={isInviting}>Send Invite</Button>
          </div>
        )}
        <div className="space-y-2">
          {team.length === 0 ? (
            <p className="text-sm py-4 text-[var(--g-text-tertiary)]">No team members yet.</p>
          ) : (
            team.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--g-bg-surface)]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--g-text-primary)]">{m.name}</span>
                  <Select value={m.teamRole ?? "member"} onValueChange={(v) => onUpdateRole(m.id, v)}>
                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {isAdmin && <Button variant="ghost" size="icon" aria-label="Remove member" onClick={() => onRemoveMember(m.id)} disabled={isRemoving}><Trash2 className="size-4 text-[var(--g-text-tertiary)]" /></Button>}
              </div>
            ))
          )}
        </div>

        {/* CRM Phone Linking — admin/owner only */}
        {isAdmin && team.length > 0 && (
          <CrmPhoneSection team={team} />
        )}
      </CardContent>
    </Card>
  );
}

/* ── CRM Phone Linking ── */

function CrmPhoneSection({ team }: { team: TeamMember[] }) {
  const updateLcPhone = trpc.team.updateLcPhone.useMutation();
  const utils = trpc.useUtils();
  const [phones, setPhones] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (const m of team) {
      map[m.id] = m.lcPhone ?? "";
    }
    return map;
  });
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const handleSave = async (memberId: number) => {
    const value = phones[memberId] ?? "";
    await updateLcPhone.mutateAsync({ id: memberId, lcPhone: value });
    await utils.settings.getWorkspace.invalidate();
    setSavedIds((prev) => new Set(Array.from(prev).concat(memberId)));
    setTimeout(() => setSavedIds((prev) => {
      const next = new Set(Array.from(prev));
      next.delete(memberId);
      return next;
    }), 2000);
    toast.success("CRM phone updated");
  };

  return (
    <div className="pt-4 border-t border-[var(--g-border-subtle)] space-y-3">
      <div className="flex items-center gap-2">
        <Phone className="size-4 text-[var(--g-accent-text)]" />
        <h3 className="text-sm font-semibold text-[var(--g-text-primary)]">Team CRM Phones</h3>
      </div>
      <p className="text-xs text-[var(--g-text-tertiary)]">
        Map each team member to the phone number contacts use to reach them in your CRM.
      </p>
      <div className="space-y-2">
        {team.map((m) => {
          const justSaved = savedIds.has(m.id);
          return (
            <div key={m.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[var(--g-bg-surface)]">
              <span className="text-sm font-medium text-[var(--g-text-primary)] w-36 truncate shrink-0">
                {m.name ?? "Unnamed"}
              </span>
              <Input
                placeholder="CRM Phone Number"
                value={phones[m.id] ?? ""}
                onChange={(e) => setPhones((prev) => ({ ...prev, [m.id]: e.target.value }))}
                className="h-8 text-sm flex-1 bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0"
                onClick={() => handleSave(m.id)}
                disabled={updateLcPhone.isPending}
              >
                {justSaved ? <Check className="size-3.5 text-[var(--g-grade-a)]" /> : "Save"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
