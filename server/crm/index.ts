import type { CrmAdapter } from "./adapter";
import { GhlAdapter } from "./ghl/ghlAdapter";

export function createCrmAdapter(type: string, config: Record<string, string>): CrmAdapter {
  switch (type) {
    case "ghl":
      return new GhlAdapter({
        apiKey: config.apiKey ?? "",
        locationId: config.locationId ?? "",
        accessToken: config.accessToken,
      });
    default:
      throw new Error(`Unsupported CRM type: ${type}`);
  }
}

export type { CrmAdapter } from "./adapter";
