// lib/inventory-access.ts — Role-based pipeline track access
import type { PipelineTrack } from '@/types/property'

export const ROLE_TRACK_ACCESS: Record<string, PipelineTrack[]> = {
  OWNER: ['acquisition', 'disposition', 'longterm'],
  ADMIN: ['acquisition', 'disposition', 'longterm'],
  TEAM_LEAD: ['acquisition', 'disposition', 'longterm'],
  ACQUISITION_MANAGER: ['acquisition', 'longterm'],
  LEAD_MANAGER: ['acquisition', 'longterm'],
  DISPOSITION_MANAGER: ['disposition'],
}

export function canAccessTrack(role: string, track: PipelineTrack): boolean {
  const tracks = ROLE_TRACK_ACCESS[role] ?? []
  return tracks.includes(track)
}

export function getAccessibleTracks(role: string): PipelineTrack[] {
  return ROLE_TRACK_ACCESS[role] ?? ['acquisition']
}
