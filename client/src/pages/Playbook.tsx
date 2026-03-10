import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen } from "lucide-react";

export function Playbook() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <BookOpen className="size-6 text-primary" />
        Playbook
      </h1>
      <Tabs defaultValue="software">
        <TabsList>
          <TabsTrigger value="software">Software</TabsTrigger>
          <TabsTrigger value="industry">Industry</TabsTrigger>
          <TabsTrigger value="tenant">Tenant</TabsTrigger>
          <TabsTrigger value="user">User</TabsTrigger>
        </TabsList>
        <TabsContent value="software" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-24 w-full rounded-lg" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="industry" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-24 w-full rounded-lg" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tenant" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-24 w-full rounded-lg" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="user" className="mt-4">
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
