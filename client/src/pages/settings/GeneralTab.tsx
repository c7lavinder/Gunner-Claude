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

interface GeneralTabProps {
  companyName: string;
  setCompanyName: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  industries: { code: string; name: string }[] | undefined;
  isAdmin: boolean;
  onSave: () => Promise<void>;
  isSaving: boolean;
}

export function GeneralTab({
  companyName,
  setCompanyName,
  industry,
  setIndustry,
  timezone,
  setTimezone,
  industries,
  isAdmin,
  onSave,
  isSaving,
}: GeneralTabProps) {
  return (
    <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
      <CardHeader><CardTitle>General</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Company name</Label>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-[var(--g-bg-surface)]" />
        </div>
        <div className="space-y-2">
          <Label>Industry</Label>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger className="w-full bg-[var(--g-bg-surface)]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {industries?.map((i) => (
                <SelectItem key={i.code} value={i.code}>{i.name}</SelectItem>
              ))}
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-full bg-[var(--g-bg-surface)]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="America/New_York">Eastern</SelectItem>
              <SelectItem value="America/Chicago">Central</SelectItem>
              <SelectItem value="America/Denver">Mountain</SelectItem>
              <SelectItem value="America/Los_Angeles">Pacific</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isAdmin && <Button onClick={onSave} disabled={isSaving}>Save</Button>}
      </CardContent>
    </Card>
  );
}
