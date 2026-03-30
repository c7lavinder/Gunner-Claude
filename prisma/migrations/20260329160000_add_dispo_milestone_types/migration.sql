-- Add disposition milestone types to the milestone_type enum
ALTER TYPE "milestone_type" ADD VALUE IF NOT EXISTS 'DISPO_NEW';
ALTER TYPE "milestone_type" ADD VALUE IF NOT EXISTS 'DISPO_PUSHED';
ALTER TYPE "milestone_type" ADD VALUE IF NOT EXISTS 'DISPO_OFFER_RECEIVED';
ALTER TYPE "milestone_type" ADD VALUE IF NOT EXISTS 'DISPO_CONTRACTED';
ALTER TYPE "milestone_type" ADD VALUE IF NOT EXISTS 'DISPO_CLOSED';
