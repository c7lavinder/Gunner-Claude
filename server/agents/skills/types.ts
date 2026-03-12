export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  availableTo: string[];
  toolName: string;
  toolVersion?: string;
  version?: string;
  license?: string;
  verified?: boolean;
  [key: string]: unknown;
}
