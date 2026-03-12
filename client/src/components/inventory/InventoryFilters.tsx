import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StageDef } from "@shared/types";

interface InventoryFiltersProps {
  search: string;
  setSearch: (v: string) => void;
  activeStage: string;
  setActiveStage: (v: string) => void;
  stageCounts: Record<string, number>;
  stages: StageDef[];
  assetLabel: string;
}

export function InventoryFilters({ search, setSearch, activeStage, setActiveStage, stageCounts, stages, assetLabel }: InventoryFiltersProps) {
  return (
    <>
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--g-text-tertiary)]" />
        <Input
          placeholder={`Search ${assetLabel.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs value={activeStage} onValueChange={setActiveStage}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="all">
            All <Badge variant="secondary" className="ml-1.5">{stageCounts.all}</Badge>
          </TabsTrigger>
          {stages.map((s) => (
            <TabsTrigger key={s.code} value={s.code}>
              {s.name} <Badge variant="secondary" className="ml-1.5">{stageCounts[s.code] ?? 0}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </>
  );
}
