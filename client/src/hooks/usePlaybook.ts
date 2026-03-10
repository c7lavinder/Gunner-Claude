import { trpc } from "@/lib/trpc";

const FIVE_MINUTES = 5 * 60 * 1000;

export function useIndustryPlaybook(code: string) {
  return trpc.playbook.getIndustry.useQuery(
    { code },
    { staleTime: FIVE_MINUTES, enabled: !!code }
  );
}

export function useUserPlaybook() {
  return trpc.playbook.getUser.useQuery(undefined, {
    staleTime: FIVE_MINUTES,
  });
}
