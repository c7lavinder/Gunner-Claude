import { useState } from "react";
import { Calendar, User, Phone, Tag, BarChart3, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const DATE_OPTIONS = [
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "all", label: "All time" },
] as const;

const SCORE_OPTIONS = ["A", "B", "C", "D", "F"] as const;

export interface CallFilterState {
  dateRange: string;
  teamMemberIds: number[];
  callType: string;
  outcome: string;
  score: string;
}

interface CallFiltersProps {
  filters: CallFilterState;
  onFilterChange: (filters: CallFilterState) => void;
}

function FilterButton({
  icon: Icon,
  label,
  isActive,
  children,
}: {
  icon: typeof Calendar;
  label: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 text-xs relative", isActive && "border-[var(--g-accent)] text-[var(--g-accent)]")}
        >
          <Icon className="size-3.5" />
          {label}
          {isActive && (
            <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-blue-500" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function OptionItem({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center w-full gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-[var(--g-bg-surface)] transition-colors",
        selected && "bg-[var(--g-bg-surface)] font-medium",
      )}
    >
      {selected && <Check className="size-3 text-[var(--g-accent)]" />}
      {!selected && <span className="size-3" />}
      {children}
    </button>
  );
}

export function CallFilters({ filters, onFilterChange }: CallFiltersProps) {
  const { callTypes, outcomeTypes, roles } = useTenantConfig();
  const { isAdmin, isManager } = useAuth();
  const canFilterTeam = isAdmin || isManager;

  const { data: teamMembers } = trpc.team.list.useQuery(undefined, {
    enabled: canFilterTeam,
  });

  const update = (patch: Partial<CallFilterState>) => {
    onFilterChange({ ...filters, ...patch });
  };

  const dateLabel = DATE_OPTIONS.find((o) => o.value === filters.dateRange)?.label ?? "Date";
  const dateActive = filters.dateRange !== "1";

  const callTypeLabel =
    filters.callType === "All"
      ? "Call Type"
      : callTypes.find((ct) => ct.code === filters.callType)?.name ?? filters.callType;
  const callTypeActive = filters.callType !== "All";

  const outcomeActive = filters.outcome !== "All";
  const outcomeLabel = outcomeActive ? filters.outcome : "Outcome";

  const scoreActive = filters.score !== "All";
  const scoreLabel = scoreActive ? `Grade ${filters.score}` : "Score";

  const teamActive = filters.teamMemberIds.length > 0;
  const teamLabel = teamActive ? `${filters.teamMemberIds.length} member${filters.teamMemberIds.length > 1 ? "s" : ""}` : "Team";

  // Group members by role
  const membersByRole = new Map<string, Array<{ id: number; name: string | null; teamRole: string | null }>>();
  if (teamMembers) {
    for (const m of teamMembers) {
      const role = m.teamRole ?? "member";
      if (!membersByRole.has(role)) membersByRole.set(role, []);
      membersByRole.get(role)!.push(m);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Filter 1 — Date */}
      <FilterButton icon={Calendar} label={dateLabel} isActive={dateActive}>
        {DATE_OPTIONS.map((opt) => (
          <OptionItem
            key={opt.value}
            selected={filters.dateRange === opt.value}
            onClick={() => update({ dateRange: opt.value })}
          >
            {opt.label}
          </OptionItem>
        ))}
      </FilterButton>

      {/* Filter 2 — Team Member (role-gated) */}
      {canFilterTeam && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8 gap-1.5 text-xs relative", teamActive && "border-[var(--g-accent)] text-[var(--g-accent)]")}
            >
              <User className="size-3.5" />
              {teamLabel}
              {teamActive && (
                <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-blue-500" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 max-h-64 overflow-y-auto" align="start">
            {filters.teamMemberIds.length > 0 && (
              <button
                onClick={() => update({ teamMemberIds: [] })}
                className="text-[10px] text-[var(--g-accent)] mb-1 px-1 hover:underline"
              >
                Clear all
              </button>
            )}
            {roles.map((role) => {
              const members = membersByRole.get(role.code) ?? [];
              if (members.length === 0) return null;
              return (
                <div key={role.code} className="mb-2">
                  <p className="text-[10px] font-semibold text-[var(--g-text-tertiary)] uppercase tracking-wider px-1 mb-1">
                    {role.name}
                  </p>
                  {members.map((m) => {
                    const checked = filters.teamMemberIds.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 px-1 py-1 rounded hover:bg-[var(--g-bg-surface)] cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const ids = v
                              ? [...filters.teamMemberIds, m.id]
                              : filters.teamMemberIds.filter((id) => id !== m.id);
                            update({ teamMemberIds: ids });
                          }}
                          className="size-3.5"
                        />
                        <span className="text-xs truncate">{m.name ?? "Unnamed"}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })}
            {/* Show ungrouped members */}
            {(() => {
              const roleCodes = new Set(roles.map((r) => r.code));
              const ungrouped = (teamMembers ?? []).filter((m) => !roleCodes.has(m.teamRole ?? ""));
              if (ungrouped.length === 0) return null;
              return (
                <div className="mb-2">
                  <p className="text-[10px] font-semibold text-[var(--g-text-tertiary)] uppercase tracking-wider px-1 mb-1">
                    Other
                  </p>
                  {ungrouped.map((m) => {
                    const checked = filters.teamMemberIds.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 px-1 py-1 rounded hover:bg-[var(--g-bg-surface)] cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const ids = v
                              ? [...filters.teamMemberIds, m.id]
                              : filters.teamMemberIds.filter((id) => id !== m.id);
                            update({ teamMemberIds: ids });
                          }}
                          className="size-3.5"
                        />
                        <span className="text-xs truncate">{m.name ?? "Unnamed"}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })()}
          </PopoverContent>
        </Popover>
      )}

      {/* Filter 3 — Call Type */}
      <FilterButton icon={Phone} label={callTypeLabel} isActive={callTypeActive}>
        <OptionItem
          selected={filters.callType === "All"}
          onClick={() => update({ callType: "All" })}
        >
          All Types
        </OptionItem>
        {callTypes.map((ct) => (
          <OptionItem
            key={ct.code}
            selected={filters.callType === ct.code}
            onClick={() => update({ callType: ct.code })}
          >
            {ct.name}
          </OptionItem>
        ))}
      </FilterButton>

      {/* Filter 4 — Outcome */}
      <FilterButton icon={Tag} label={outcomeLabel} isActive={outcomeActive}>
        <OptionItem
          selected={filters.outcome === "All"}
          onClick={() => update({ outcome: "All" })}
        >
          All Outcomes
        </OptionItem>
        {outcomeTypes.map((ot) => (
          <OptionItem
            key={ot}
            selected={filters.outcome === ot}
            onClick={() => update({ outcome: ot })}
          >
            {ot}
          </OptionItem>
        ))}
      </FilterButton>

      {/* Filter 5 — Score */}
      <FilterButton icon={BarChart3} label={scoreLabel} isActive={scoreActive}>
        <OptionItem
          selected={filters.score === "All"}
          onClick={() => update({ score: "All" })}
        >
          All Grades
        </OptionItem>
        {SCORE_OPTIONS.map((g) => (
          <OptionItem
            key={g}
            selected={filters.score === g}
            onClick={() => update({ score: g })}
          >
            Grade {g}
          </OptionItem>
        ))}
      </FilterButton>
    </div>
  );
}
