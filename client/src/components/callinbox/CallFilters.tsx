import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const GRADE_OPTIONS = ["All", "A", "B", "C", "D", "F"] as const;

interface CallFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  dateRange: string;
  onDateRangeChange: (v: string) => void;
  gradeFilter: string;
  onGradeFilterChange: (v: string) => void;
  callTypeFilter: string;
  onCallTypeFilterChange: (v: string) => void;
  callTypes: Array<{ code: string; name: string }>;
  contactLabel: string;
}

export function CallFilters({
  search, onSearchChange,
  dateRange, onDateRangeChange,
  gradeFilter, onGradeFilterChange,
  callTypeFilter, onCallTypeFilterChange,
  callTypes, contactLabel,
}: CallFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        placeholder={`Search ${contactLabel.toLowerCase()} or caller...`}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-8 w-48 text-sm"
      />
      <div className="flex items-center gap-1">
        {GRADE_OPTIONS.map((g) => (
          <button
            key={g}
            onClick={() => onGradeFilterChange(g)}
            className={cn(
              "h-7 px-2.5 rounded-full text-xs font-medium transition-colors",
              gradeFilter === g
                ? "bg-[var(--g-accent)] text-white"
                : "bg-[var(--g-bg-surface)] text-[var(--g-text-secondary)] hover:bg-[var(--g-bg-inset)]",
            )}
          >
            {g}
          </button>
        ))}
      </div>
      {callTypes.length > 0 && (
        <Select value={callTypeFilter} onValueChange={onCallTypeFilterChange}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Types</SelectItem>
            {callTypes.map((ct) => (
              <SelectItem key={ct.code} value={ct.code}>
                {ct.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={dateRange} onValueChange={onDateRangeChange}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Today</SelectItem>
          <SelectItem value="7">Last 7 days</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="all">All time</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
