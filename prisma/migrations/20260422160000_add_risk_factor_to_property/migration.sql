-- Risk Factor column for properties. Free-form string so users can enter any
-- scheme ("High", "8/10", "title issue"). Cash value lives here; per-offer-type
-- values live in alt_prices[type].riskFactor alongside the price overrides.
ALTER TABLE "properties" ADD COLUMN "risk_factor" TEXT;
