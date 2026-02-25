import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Target, 
  Users, 
  CheckCircle,
  AlertTriangle,
  BookOpen,
  Scale
} from "lucide-react";

export default function Methodology() {
  const [methodTab, setMethodTab] = useState("acquisition_manager");
  const { data: rubrics, isLoading: rubricsLoading } = trpc.rubrics.getAll.useQuery();
  const { data: qualificationContext, isLoading: qualContextLoading } = trpc.rubrics.getContext.useQuery({ callType: "qualification" });
  const { data: offerContext, isLoading: offerContextLoading } = trpc.rubrics.getContext.useQuery({ callType: "offer" });

  const isLoading = rubricsLoading || qualContextLoading || offerContextLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tighter">Grading Methodology</h1>
        <p className="text-muted-foreground">
          View the criteria and training materials used to evaluate calls
        </p>
      </div>

      <div className="space-y-6">
        <div className="obs-role-tabs">
          <button className={`obs-role-tab ${methodTab === "acquisition_manager" ? "active" : ""}`} onClick={() => setMethodTab("acquisition_manager")}>
            <Target className="h-4 w-4" />
            Acquisition Manager
          </button>
          <button className={`obs-role-tab ${methodTab === "lead_manager" ? "active" : ""}`} onClick={() => setMethodTab("lead_manager")}>
            <Users className="h-4 w-4" />
            Lead Manager
          </button>
        </div>

        {methodTab === "lead_manager" && (<div className="space-y-6">
          <RubricDisplay 
            rubric={rubrics?.leadManager} 
            context={qualificationContext}
            title="Lead Manager Rubric"
            description="Used for qualification calls by Lead Managers"
          />
        </div>)}

        {methodTab === "acquisition_manager" && (<div className="space-y-6">
          <RubricDisplay 
            rubric={rubrics?.acquisitionManager} 
            context={offerContext}
            title="Acquisition Manager Rubric"
            description="Used for offer calls by Acquisition Managers"
          />
        </div>)}
      </div>
    </div>
  );
}

function RubricDisplay({ 
  rubric, 
  context,
  title, 
  description 
}: { 
  rubric: any; 
  context: any;
  title: string; 
  description: string;
}) {
  if (!rubric) return null;

  const totalPoints = rubric.criteria?.reduce((sum: number, c: any) => sum + c.maxPoints, 0) || 100;

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="obs-panel">
        <div style={{marginBottom: 16}}>
          <h3 className="obs-section-title flex items-center gap-2">
            <Scale className="h-5 w-5" />
            {title}
          </h3>
          <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>{description}</p>
        </div>
        <div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-2xl font-bold">{rubric.criteria?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Grading Criteria</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-2xl font-bold">{totalPoints}</p>
              <p className="text-sm text-muted-foreground">Total Points</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-2xl font-bold">{context?.trainingMaterials?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Training Materials</p>
            </div>
          </div>
        </div>
      </div>

      {/* Criteria */}
      <div className="obs-panel">
        <div style={{marginBottom: 16}}>
          <h3 className="obs-section-title text-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Grading Criteria
          </h3>
          <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>
            Each call is evaluated on these criteria
          </p>
        </div>
        <div>
          <div className="space-y-4">
            {rubric.criteria?.map((criterion: any, index: number) => (
              <div key={index} className="p-4 border rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium">{criterion.name}</h4>
                  <Badge variant="secondary">{criterion.maxPoints} pts</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{criterion.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Red Flags */}
      {rubric.redFlags && rubric.redFlags.length > 0 && (
        <div className="obs-panel border-red-200 dark:border-red-900">
          <div style={{marginBottom: 16}}>
            <h3 className="obs-section-title text-lg flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Red Flags
            </h3>
            <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>
              Issues that will be flagged during grading
            </p>
          </div>
          <div>
            <ul className="space-y-2">
              {rubric.redFlags.map((flag: string, index: number) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-red-500 mt-0.5">•</span>
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Active Training Materials */}
      {context?.trainingMaterials && context.trainingMaterials.length > 0 && (
        <div className="obs-panel">
          <div style={{marginBottom: 16}}>
            <h3 className="obs-section-title text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
              Active Training Materials
            </h3>
            <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>
              Training content used to evaluate calls
            </p>
          </div>
          <div>
            <div className="space-y-3">
              {context.trainingMaterials.map((material: any) => (
                <div key={material.id} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-sm">{material.title}</h4>
                    <Badge variant="outline" className="text-xs capitalize">
                      {material.category?.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {material.description && (
                    <p className="text-xs text-muted-foreground">{material.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Grading Rules */}
      {context?.gradingRules && context.gradingRules.length > 0 && (
        <div className="obs-panel">
          <div style={{marginBottom: 16}}>
            <h3 className="obs-section-title text-lg flex items-center gap-2">
              <Scale className="h-5 w-5 text-purple-500" />
              Custom Grading Rules
            </h3>
            <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>
              Additional rules applied during grading
            </p>
          </div>
          <div>
            <div className="space-y-3">
              {context.gradingRules.map((rule: any) => (
                <div key={rule.id} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-sm">{rule.title}</h4>
                    <Badge variant="secondary" className="text-xs">
                      Priority: {rule.priority || 0}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{rule.ruleText}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
