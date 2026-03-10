import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap } from "lucide-react";

export function Training() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <GraduationCap className="size-6 text-primary" />
        Training
      </h1>
      <Tabs defaultValue="materials">
        <TabsList>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="roleplay">Roleplay</TabsTrigger>
          <TabsTrigger value="team">Team Training</TabsTrigger>
        </TabsList>
        <TabsContent value="materials" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-24 w-full rounded-lg" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="roleplay" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-24 w-full rounded-lg" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="team" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-24 w-full rounded-lg" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
