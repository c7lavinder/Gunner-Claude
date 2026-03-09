/**
 * KPI Page Backend Service
 * 
 * Provides:
 * 1. Funnel aggregation: Leads → Apts → Offers → Contracts → Closed → Revenue
 * 2. Source/Market CRUD with zip codes and GHL mapping
 * 3. Spend/Volume monthly entry
 * 4. Detail tables: by source, by market, source×market pivot
 * 5. Data quality check (properties missing source/market)
 * 6. Trend comparison (current vs previous period)
 */

import { getDb } from "./db";
import {
  dispoProperties,
  kpiMarkets,
  kpiSources,
  kpiSpend,
  kpiVolume,
  teamMembers,
} from "../drizzle/schema";
import { eq, and, sql, gte, lt, isNull, inArray, or, count } from "drizzle-orm";

// ─── TYPES ──────────────────────────────────────────────

export interface DateRange {
  start: Date;
  end: Date;
}

export interface FunnelFilters {
  tenantId: number;
  dateRange: DateRange;
  marketId?: number | null;
  sourceId?: number | null;
}

export interface FunnelCounts {
  leads: number;
  apts: number;
  offers: number;
  contracts: number;
  closed: number;
  revenue: number; // in cents
}

export interface ScoreboardCard {
  label: string;
  value: number;
  previousValue: number;
  trend: "up" | "down" | "neutral";
  format: "number" | "currency";
}

// ─── PERIOD HELPERS ─────────────────────────────────────

export function getDateRange(period: string, customStart?: string, customEnd?: string): { current: DateRange; previous: DateRange } {
  const now = new Date();
  // Use Central Time for date boundaries
  const ctNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  
  let currentStart: Date;
  let currentEnd: Date;
  let previousStart: Date;
  let previousEnd: Date;

  switch (period) {
    case "this_month": {
      currentStart = new Date(ctNow.getFullYear(), ctNow.getMonth(), 1);
      currentEnd = new Date(ctNow.getFullYear(), ctNow.getMonth() + 1, 0, 23, 59, 59);
      previousStart = new Date(ctNow.getFullYear(), ctNow.getMonth() - 1, 1);
      previousEnd = new Date(ctNow.getFullYear(), ctNow.getMonth(), 0, 23, 59, 59);
      break;
    }
    case "last_month": {
      currentStart = new Date(ctNow.getFullYear(), ctNow.getMonth() - 1, 1);
      currentEnd = new Date(ctNow.getFullYear(), ctNow.getMonth(), 0, 23, 59, 59);
      previousStart = new Date(ctNow.getFullYear(), ctNow.getMonth() - 2, 1);
      previousEnd = new Date(ctNow.getFullYear(), ctNow.getMonth() - 1, 0, 23, 59, 59);
      break;
    }
    case "this_quarter": {
      const qMonth = Math.floor(ctNow.getMonth() / 3) * 3;
      currentStart = new Date(ctNow.getFullYear(), qMonth, 1);
      currentEnd = new Date(ctNow.getFullYear(), qMonth + 3, 0, 23, 59, 59);
      previousStart = new Date(ctNow.getFullYear(), qMonth - 3, 1);
      previousEnd = new Date(ctNow.getFullYear(), qMonth, 0, 23, 59, 59);
      break;
    }
    case "ytd": {
      currentStart = new Date(ctNow.getFullYear(), 0, 1);
      currentEnd = now;
      // No comparison for YTD
      previousStart = currentStart;
      previousEnd = currentStart;
      break;
    }
    case "custom": {
      currentStart = customStart ? new Date(customStart) : new Date(ctNow.getFullYear(), ctNow.getMonth(), 1);
      currentEnd = customEnd ? new Date(customEnd + "T23:59:59") : now;
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      previousEnd = new Date(currentStart.getTime() - 1);
      previousStart = new Date(previousEnd.getTime() - durationMs);
      break;
    }
    default: {
      // Default to this month
      currentStart = new Date(ctNow.getFullYear(), ctNow.getMonth(), 1);
      currentEnd = new Date(ctNow.getFullYear(), ctNow.getMonth() + 1, 0, 23, 59, 59);
      previousStart = new Date(ctNow.getFullYear(), ctNow.getMonth() - 1, 1);
      previousEnd = new Date(ctNow.getFullYear(), ctNow.getMonth(), 0, 23, 59, 59);
    }
  }

  return {
    current: { start: currentStart, end: currentEnd },
    previous: { start: previousStart, end: previousEnd },
  };
}

// ─── FUNNEL AGGREGATION ─────────────────────────────────

/**
 * Count properties in each funnel stage within a date range.
 * 
 * Funnel logic (from spec):
 * - Leads: any property created in period (1 per property regardless of stage movement)
 * - Apts: property reached apt stage (aptSetAt or aptEverSet)
 * - Offers: property had offer made (offerMadeAt or offerEverMade)
 * - Contracts: property went under contract (underContractAt or everUnderContract)
 * - Closed: property reached Purchased status (closedAt or everClosed)
 * - Revenue: sum of (acceptedOffer - contractPrice) for closed properties
 */
export async function getFunnelCounts(filters: FunnelFilters): Promise<FunnelCounts> {
  const db = await getDb();
  if (!db) return { leads: 0, apts: 0, offers: 0, contracts: 0, closed: 0, revenue: 0 };

  const { tenantId, dateRange, marketId, sourceId } = filters;

  // Build base conditions
  const baseConds: any[] = [eq(dispoProperties.tenantId, tenantId)];
  if (marketId) baseConds.push(eq(dispoProperties.marketId, marketId));
  if (sourceId) baseConds.push(eq(dispoProperties.sourceId, sourceId));

  // Leads: properties created in period
  const [leadsResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(dispoProperties)
    .where(and(
      ...baseConds,
      gte(dispoProperties.createdAt, dateRange.start),
      lt(dispoProperties.createdAt, dateRange.end),
    ));
  const leads = Number(leadsResult?.count || 0);

  // Apts: properties with aptSetAt in period OR aptEverSet=true and created in period
  const [aptsResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(dispoProperties)
    .where(and(
      ...baseConds,
      or(
        and(
          sql`${dispoProperties.aptSetAt} IS NOT NULL`,
          gte(dispoProperties.aptSetAt, dateRange.start),
          lt(dispoProperties.aptSetAt, dateRange.end),
        ),
        and(
          eq(dispoProperties.aptEverSet, true),
          sql`${dispoProperties.aptSetAt} IS NULL`,
          gte(dispoProperties.createdAt, dateRange.start),
          lt(dispoProperties.createdAt, dateRange.end),
        ),
      ),
    ));
  const apts = Number(aptsResult?.count || 0);

  // Offers: properties with offerMadeAt in period
  const [offersResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(dispoProperties)
    .where(and(
      ...baseConds,
      or(
        and(
          sql`${dispoProperties.offerMadeAt} IS NOT NULL`,
          gte(dispoProperties.offerMadeAt, dateRange.start),
          lt(dispoProperties.offerMadeAt, dateRange.end),
        ),
        and(
          eq(dispoProperties.offerEverMade, true),
          sql`${dispoProperties.offerMadeAt} IS NULL`,
          gte(dispoProperties.createdAt, dateRange.start),
          lt(dispoProperties.createdAt, dateRange.end),
        ),
      ),
    ));
  const offers = Number(offersResult?.count || 0);

  // Contracts: properties with underContractAt in period
  const [contractsResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(dispoProperties)
    .where(and(
      ...baseConds,
      or(
        and(
          sql`${dispoProperties.underContractAt} IS NOT NULL`,
          gte(dispoProperties.underContractAt, dateRange.start),
          lt(dispoProperties.underContractAt, dateRange.end),
        ),
        and(
          eq(dispoProperties.everUnderContract, true),
          sql`${dispoProperties.underContractAt} IS NULL`,
          gte(dispoProperties.createdAt, dateRange.start),
          lt(dispoProperties.createdAt, dateRange.end),
        ),
      ),
    ));
  const contracts = Number(contractsResult?.count || 0);

  // Closed: properties with closedAt in period (Purchased only)
  const [closedResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(dispoProperties)
    .where(and(
      ...baseConds,
      or(
        and(
          sql`${dispoProperties.closedAt} IS NOT NULL`,
          gte(dispoProperties.closedAt, dateRange.start),
          lt(dispoProperties.closedAt, dateRange.end),
        ),
        and(
          eq(dispoProperties.everClosed, true),
          sql`${dispoProperties.closedAt} IS NULL`,
          gte(dispoProperties.createdAt, dateRange.start),
          lt(dispoProperties.createdAt, dateRange.end),
        ),
      ),
    ));
  const closed = Number(closedResult?.count || 0);

  // Revenue: sum of (acceptedOffer - contractPrice) for closed properties
  const [revenueResult] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${dispoProperties.acceptedOffer} - ${dispoProperties.contractPrice}), 0)`,
    })
    .from(dispoProperties)
    .where(and(
      ...baseConds,
      sql`${dispoProperties.acceptedOffer} IS NOT NULL`,
      sql`${dispoProperties.contractPrice} IS NOT NULL`,
      or(
        and(
          sql`${dispoProperties.closedAt} IS NOT NULL`,
          gte(dispoProperties.closedAt, dateRange.start),
          lt(dispoProperties.closedAt, dateRange.end),
        ),
        and(
          eq(dispoProperties.everClosed, true),
          sql`${dispoProperties.closedAt} IS NULL`,
          gte(dispoProperties.createdAt, dateRange.start),
          lt(dispoProperties.createdAt, dateRange.end),
        ),
      ),
    ));
  const revenue = Number(revenueResult?.total || 0);

  return { leads, apts, offers, contracts, closed, revenue };
}

// ─── SCOREBOARD ─────────────────────────────────────────

export async function getKpiScoreboard(
  tenantId: number,
  period: string,
  marketId?: number | null,
  sourceId?: number | null,
  customStart?: string,
  customEnd?: string,
) {
  const { current, previous } = getDateRange(period, customStart, customEnd);
  const isYtd = period === "ytd";

  const [currentCounts, previousCounts] = await Promise.all([
    getFunnelCounts({ tenantId, dateRange: current, marketId, sourceId }),
    isYtd
      ? Promise.resolve({ leads: 0, apts: 0, offers: 0, contracts: 0, closed: 0, revenue: 0 })
      : getFunnelCounts({ tenantId, dateRange: previous, marketId, sourceId }),
  ]);

  // Get spend for current period
  const db = await getDb();
  let currentSpend = 0;
  let previousSpend = 0;

  if (db) {
    const currentMonth = `${current.start.getFullYear()}-${String(current.start.getMonth() + 1).padStart(2, "0")}`;
    const spendConds: any[] = [eq(kpiSpend.tenantId, tenantId), eq(kpiSpend.month, currentMonth)];
    if (marketId) spendConds.push(eq(kpiSpend.marketId, marketId));
    if (sourceId) spendConds.push(eq(kpiSpend.sourceId, sourceId));

    const [spendResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(${kpiSpend.amount}), 0)` })
      .from(kpiSpend)
      .where(and(...spendConds));
    currentSpend = Number(spendResult?.total || 0);

    if (!isYtd) {
      const prevMonth = `${previous.start.getFullYear()}-${String(previous.start.getMonth() + 1).padStart(2, "0")}`;
      const prevSpendConds: any[] = [eq(kpiSpend.tenantId, tenantId), eq(kpiSpend.month, prevMonth)];
      if (marketId) prevSpendConds.push(eq(kpiSpend.marketId, marketId));
      if (sourceId) prevSpendConds.push(eq(kpiSpend.sourceId, sourceId));

      const [prevSpendResult] = await db
        .select({ total: sql<number>`COALESCE(SUM(${kpiSpend.amount}), 0)` })
        .from(kpiSpend)
        .where(and(...prevSpendConds));
      previousSpend = Number(prevSpendResult?.total || 0);
    }
  }

  function trend(current: number, previous: number): "up" | "down" | "neutral" {
    if (isYtd) return "neutral";
    if (current > previous) return "up";
    if (current < previous) return "down";
    return "neutral";
  }

  return {
    period,
    dateRange: { start: current.start.toISOString(), end: current.end.toISOString() },
    cards: [
      { label: "Spend", value: currentSpend, previousValue: previousSpend, trend: trend(previousSpend, currentSpend), format: "currency" as const },
      { label: "Leads", value: currentCounts.leads, previousValue: previousCounts.leads, trend: trend(currentCounts.leads, previousCounts.leads), format: "number" as const },
      { label: "Apts", value: currentCounts.apts, previousValue: previousCounts.apts, trend: trend(currentCounts.apts, previousCounts.apts), format: "number" as const },
      { label: "Offers", value: currentCounts.offers, previousValue: previousCounts.offers, trend: trend(currentCounts.offers, previousCounts.offers), format: "number" as const },
      { label: "Contracts", value: currentCounts.contracts, previousValue: previousCounts.contracts, trend: trend(currentCounts.contracts, previousCounts.contracts), format: "number" as const },
      { label: "Closed", value: currentCounts.closed, previousValue: previousCounts.closed, trend: trend(currentCounts.closed, previousCounts.closed), format: "number" as const },
      { label: "Revenue", value: currentCounts.revenue, previousValue: previousCounts.revenue, trend: trend(currentCounts.revenue, previousCounts.revenue), format: "currency" as const },
    ],
    funnel: currentCounts,
  };
}

// ─── DETAIL TABLE: BY SOURCE ────────────────────────────

export async function getDetailBySource(
  tenantId: number,
  period: string,
  marketId?: number | null,
  customStart?: string,
  customEnd?: string,
) {
  const db = await getDb();
  if (!db) return [];

  const { current } = getDateRange(period, customStart, customEnd);
  const sources = await db.select().from(kpiSources).where(and(eq(kpiSources.tenantId, tenantId), eq(kpiSources.isActive, true)));

  const rows = [];
  for (const source of sources) {
    const counts = await getFunnelCounts({ tenantId, dateRange: current, marketId, sourceId: source.id });

    // Get spend
    const currentMonth = `${current.start.getFullYear()}-${String(current.start.getMonth() + 1).padStart(2, "0")}`;
    const spendConds: any[] = [eq(kpiSpend.tenantId, tenantId), eq(kpiSpend.sourceId, source.id), eq(kpiSpend.month, currentMonth)];
    if (marketId) spendConds.push(eq(kpiSpend.marketId, marketId));
    const [spendResult] = await db.select({ total: sql<number>`COALESCE(SUM(${kpiSpend.amount}), 0)` }).from(kpiSpend).where(and(...spendConds));
    const spend = Number(spendResult?.total || 0);

    // Get volume
    const volConds: any[] = [eq(kpiVolume.tenantId, tenantId), eq(kpiVolume.sourceId, source.id), eq(kpiVolume.month, currentMonth)];
    if (marketId) volConds.push(eq(kpiVolume.marketId, marketId));
    const [volResult] = await db.select({ total: sql<number>`COALESCE(SUM(${kpiVolume.count}), 0)` }).from(kpiVolume).where(and(...volConds));
    const volume = Number(volResult?.total || 0);

    const cpl = counts.leads > 0 ? spend / counts.leads : 0;
    const costPerDeal = counts.closed > 0 ? spend / counts.closed : 0;
    const roi = spend > 0 ? ((counts.revenue - spend) / spend) * 100 : 0;

    rows.push({
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      spend,
      volume,
      ...counts,
      cpl: Math.round(cpl),
      costPerDeal: Math.round(costPerDeal),
      roi: Math.round(roi * 10) / 10,
      aptRate: counts.leads > 0 ? Math.round((counts.apts / counts.leads) * 1000) / 10 : 0,
      offerRate: counts.apts > 0 ? Math.round((counts.offers / counts.apts) * 1000) / 10 : 0,
      contractRate: counts.offers > 0 ? Math.round((counts.contracts / counts.offers) * 1000) / 10 : 0,
      closeRate: counts.contracts > 0 ? Math.round((counts.closed / counts.contracts) * 1000) / 10 : 0,
    });
  }

  // Add "Unassigned" row for properties without source
  const unassignedCounts = await getFunnelCounts({ tenantId, dateRange: current, marketId, sourceId: -1 });
  // For unassigned, we query properties with NULL sourceId
  const unassignedBaseConds: any[] = [
    eq(dispoProperties.tenantId, tenantId),
    isNull(dispoProperties.sourceId),
    gte(dispoProperties.createdAt, current.start),
    lt(dispoProperties.createdAt, current.end),
  ];
  if (marketId) unassignedBaseConds.push(eq(dispoProperties.marketId, marketId));
  const [unassignedLeads] = await db.select({ count: sql<number>`COUNT(*)` }).from(dispoProperties).where(and(...unassignedBaseConds));

  if (Number(unassignedLeads?.count || 0) > 0) {
    rows.push({
      sourceId: null,
      sourceName: "Unassigned",
      sourceType: "unknown" as any,
      spend: 0,
      volume: 0,
      leads: Number(unassignedLeads?.count || 0),
      apts: 0,
      offers: 0,
      contracts: 0,
      closed: 0,
      revenue: 0,
      cpl: 0,
      costPerDeal: 0,
      roi: 0,
      aptRate: 0,
      offerRate: 0,
      contractRate: 0,
      closeRate: 0,
    });
  }

  return rows;
}

// ─── DETAIL TABLE: BY MARKET ────────────────────────────

export async function getDetailByMarket(
  tenantId: number,
  period: string,
  sourceId?: number | null,
  customStart?: string,
  customEnd?: string,
) {
  const db = await getDb();
  if (!db) return [];

  const { current } = getDateRange(period, customStart, customEnd);
  const markets = await db.select().from(kpiMarkets).where(and(eq(kpiMarkets.tenantId, tenantId), eq(kpiMarkets.isActive, "true")));

  const rows = [];
  for (const market of markets) {
    const counts = await getFunnelCounts({ tenantId, dateRange: current, marketId: market.id, sourceId });

    const currentMonth = `${current.start.getFullYear()}-${String(current.start.getMonth() + 1).padStart(2, "0")}`;
    const spendConds: any[] = [eq(kpiSpend.tenantId, tenantId), eq(kpiSpend.marketId, market.id), eq(kpiSpend.month, currentMonth)];
    if (sourceId) spendConds.push(eq(kpiSpend.sourceId, sourceId));
    const [spendResult] = await db.select({ total: sql<number>`COALESCE(SUM(${kpiSpend.amount}), 0)` }).from(kpiSpend).where(and(...spendConds));
    const spend = Number(spendResult?.total || 0);

    const volConds: any[] = [eq(kpiVolume.tenantId, tenantId), eq(kpiVolume.marketId, market.id), eq(kpiVolume.month, currentMonth)];
    if (sourceId) volConds.push(eq(kpiVolume.sourceId, sourceId));
    const [volResult] = await db.select({ total: sql<number>`COALESCE(SUM(${kpiVolume.count}), 0)` }).from(kpiVolume).where(and(...volConds));
    const volume = Number(volResult?.total || 0);

    const cpl = counts.leads > 0 ? spend / counts.leads : 0;
    const costPerDeal = counts.closed > 0 ? spend / counts.closed : 0;
    const roi = spend > 0 ? ((counts.revenue - spend) / spend) * 100 : 0;

    rows.push({
      marketId: market.id,
      marketName: market.name,
      isGlobal: market.isGlobal,
      spend,
      volume,
      ...counts,
      cpl: Math.round(cpl),
      costPerDeal: Math.round(costPerDeal),
      roi: Math.round(roi * 10) / 10,
      aptRate: counts.leads > 0 ? Math.round((counts.apts / counts.leads) * 1000) / 10 : 0,
      offerRate: counts.apts > 0 ? Math.round((counts.offers / counts.apts) * 1000) / 10 : 0,
      contractRate: counts.offers > 0 ? Math.round((counts.contracts / counts.offers) * 1000) / 10 : 0,
      closeRate: counts.contracts > 0 ? Math.round((counts.closed / counts.contracts) * 1000) / 10 : 0,
    });
  }

  return rows;
}

// ─── SOURCE × MARKET PIVOT ──────────────────────────────

export async function getSourceMarketPivot(
  tenantId: number,
  period: string,
  customStart?: string,
  customEnd?: string,
) {
  const db = await getDb();
  if (!db) return { sources: [], markets: [], cells: {} };

  const { current } = getDateRange(period, customStart, customEnd);
  const sources = await db.select().from(kpiSources).where(and(eq(kpiSources.tenantId, tenantId), eq(kpiSources.isActive, true)));
  const markets = await db.select().from(kpiMarkets).where(and(eq(kpiMarkets.tenantId, tenantId), eq(kpiMarkets.isActive, "true")));

  const cells: Record<string, { leads: number; contracts: number; spend: number; revenue: number }> = {};

  for (const source of sources) {
    for (const market of markets) {
      const key = `${source.id}_${market.id}`;
      const counts = await getFunnelCounts({ tenantId, dateRange: current, marketId: market.id, sourceId: source.id });

      const currentMonth = `${current.start.getFullYear()}-${String(current.start.getMonth() + 1).padStart(2, "0")}`;
      const [spendResult] = await db.select({ total: sql<number>`COALESCE(SUM(${kpiSpend.amount}), 0)` }).from(kpiSpend)
        .where(and(eq(kpiSpend.tenantId, tenantId), eq(kpiSpend.sourceId, source.id), eq(kpiSpend.marketId, market.id), eq(kpiSpend.month, currentMonth)));

      cells[key] = {
        leads: counts.leads,
        contracts: counts.contracts,
        spend: Number(spendResult?.total || 0),
        revenue: counts.revenue,
      };
    }
  }

  return {
    sources: sources.map(s => ({ id: s.id, name: s.name, type: s.type })),
    markets: markets.map(m => ({ id: m.id, name: m.name, isGlobal: m.isGlobal })),
    cells,
  };
}

// ─── DATA QUALITY ───────────────────────────────────────

export async function getDataQuality(tenantId: number) {
  const db = await getDb();
  if (!db) return { missingSource: 0, missingMarket: 0, total: 0 };

  const [missingSourceResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(dispoProperties)
    .where(and(eq(dispoProperties.tenantId, tenantId), isNull(dispoProperties.sourceId)));

  const [missingMarketResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(dispoProperties)
    .where(and(eq(dispoProperties.tenantId, tenantId), isNull(dispoProperties.marketId)));

  const [totalResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(dispoProperties)
    .where(eq(dispoProperties.tenantId, tenantId));

  return {
    missingSource: Number(missingSourceResult?.count || 0),
    missingMarket: Number(missingMarketResult?.count || 0),
    total: Number(totalResult?.count || 0),
  };
}

// ─── SOURCES CRUD (upgraded) ────────────────────────────

export async function getKpiSourcesList(tenantId: number, activeOnly: boolean = true) {
  const db = await getDb();
  if (!db) return [];

  const conds: any[] = [eq(kpiSources.tenantId, tenantId)];
  if (activeOnly) conds.push(eq(kpiSources.isActive, true));

  return db.select().from(kpiSources).where(and(...conds)).orderBy(kpiSources.name);
}

export async function createKpiSource(data: {
  tenantId: number;
  name: string;
  type: "outbound" | "inbound";
  tracksVolume?: boolean;
  volumeLabel?: string;
  ghlSourceMapping?: string;
}) {
  const db = await getDb();
  if (!db) return null;

  const [result] = await db.insert(kpiSources).values({
    tenantId: data.tenantId,
    name: data.name,
    type: data.type,
    tracksVolume: data.tracksVolume ?? false,
    volumeLabel: data.volumeLabel || null,
    ghlSourceMapping: data.ghlSourceMapping || null,
    isActive: true,
  }).returning({ id: kpiSources.id });
  return result.id;
}

export async function updateKpiSource(id: number, data: {
  name?: string;
  type?: "outbound" | "inbound";
  tracksVolume?: boolean;
  volumeLabel?: string;
  ghlSourceMapping?: string;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) return false;

  await db.update(kpiSources).set(data).where(eq(kpiSources.id, id));
  return true;
}

export async function deleteKpiSource(id: number) {
  const db = await getDb();
  if (!db) return false;

  await db.update(kpiSources).set({ isActive: false }).where(eq(kpiSources.id, id));
  return true;
}

// ─── MARKETS CRUD (upgraded) ────────────────────────────

export async function getKpiMarketsList(tenantId: number, activeOnly: boolean = true) {
  const db = await getDb();
  if (!db) return [];

  const conds: any[] = [eq(kpiMarkets.tenantId, tenantId)];
  if (activeOnly) conds.push(eq(kpiMarkets.isActive, "true"));

  return db.select().from(kpiMarkets).where(and(...conds)).orderBy(kpiMarkets.name);
}

export async function createKpiMarketV2(data: {
  tenantId: number;
  name: string;
  zipCodes?: string[];
  isGlobal?: boolean;
}) {
  const db = await getDb();
  if (!db) return null;

  const [result] = await db.insert(kpiMarkets).values({
    tenantId: data.tenantId,
    name: data.name,
    zipCodes: data.zipCodes || [],
    isGlobal: data.isGlobal ?? false,
    isActive: "true",
  }).returning({ id: kpiMarkets.id });
  return result.id;
}

export async function updateKpiMarketV2(id: number, data: {
  name?: string;
  zipCodes?: string[];
  isGlobal?: boolean;
  isActive?: "true" | "false";
}) {
  const db = await getDb();
  if (!db) return false;

  await db.update(kpiMarkets).set(data).where(eq(kpiMarkets.id, id));
  return true;
}

// ─── SPEND / VOLUME ENTRY ───────────────────────────────

export async function upsertSpend(data: {
  tenantId: number;
  sourceId: number;
  marketId: number;
  month: string; // YYYY-MM
  amount: number; // in cents
}) {
  const db = await getDb();
  if (!db) return null;

  const [existing] = await db.select().from(kpiSpend).where(and(
    eq(kpiSpend.tenantId, data.tenantId),
    eq(kpiSpend.sourceId, data.sourceId),
    eq(kpiSpend.marketId, data.marketId),
    eq(kpiSpend.month, data.month),
  ));

  if (existing) {
    await db.update(kpiSpend).set({ amount: data.amount }).where(eq(kpiSpend.id, existing.id));
    return existing.id;
  } else {
    const [result] = await db.insert(kpiSpend).values(data).returning({ id: kpiSpend.id });
    return result.id;
  }
}

export async function upsertVolume(data: {
  tenantId: number;
  sourceId: number;
  marketId: number;
  month: string;
  count: number;
}) {
  const db = await getDb();
  if (!db) return null;

  const [existing] = await db.select().from(kpiVolume).where(and(
    eq(kpiVolume.tenantId, data.tenantId),
    eq(kpiVolume.sourceId, data.sourceId),
    eq(kpiVolume.marketId, data.marketId),
    eq(kpiVolume.month, data.month),
  ));

  if (existing) {
    await db.update(kpiVolume).set({ count: data.count }).where(eq(kpiVolume.id, existing.id));
    return existing.id;
  } else {
    const [result] = await db.insert(kpiVolume).values(data).returning({ id: kpiVolume.id });
    return result.id;
  }
}

export async function getSpendForMonth(tenantId: number, month: string) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(kpiSpend).where(and(eq(kpiSpend.tenantId, tenantId), eq(kpiSpend.month, month)));
}

export async function getVolumeForMonth(tenantId: number, month: string) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(kpiVolume).where(and(eq(kpiVolume.tenantId, tenantId), eq(kpiVolume.month, month)));
}

// ─── FUNNEL PROPERTY LIST (for click-through) ───────────

export async function getFunnelPropertyList(
  tenantId: number,
  stage: "leads" | "apts" | "offers" | "contracts" | "closed",
  period: string,
  marketId?: number | null,
  sourceId?: number | null,
  customStart?: string,
  customEnd?: string,
) {
  const db = await getDb();
  if (!db) return [];

  const { current } = getDateRange(period, customStart, customEnd);
  const baseConds: any[] = [eq(dispoProperties.tenantId, tenantId)];
  if (marketId) baseConds.push(eq(dispoProperties.marketId, marketId));
  if (sourceId) baseConds.push(eq(dispoProperties.sourceId, sourceId));

  let stageConds: any;
  switch (stage) {
    case "leads":
      stageConds = and(
        ...baseConds,
        gte(dispoProperties.createdAt, current.start),
        lt(dispoProperties.createdAt, current.end),
      );
      break;
    case "apts":
      stageConds = and(
        ...baseConds,
        or(
          and(
            sql`${dispoProperties.aptSetAt} IS NOT NULL`,
            gte(dispoProperties.aptSetAt, current.start),
            lt(dispoProperties.aptSetAt, current.end),
          ),
          and(
            eq(dispoProperties.aptEverSet, true),
            sql`${dispoProperties.aptSetAt} IS NULL`,
            gte(dispoProperties.createdAt, current.start),
            lt(dispoProperties.createdAt, current.end),
          ),
        ),
      );
      break;
    case "offers":
      stageConds = and(
        ...baseConds,
        or(
          and(
            sql`${dispoProperties.offerMadeAt} IS NOT NULL`,
            gte(dispoProperties.offerMadeAt, current.start),
            lt(dispoProperties.offerMadeAt, current.end),
          ),
          and(
            eq(dispoProperties.offerEverMade, true),
            sql`${dispoProperties.offerMadeAt} IS NULL`,
            gte(dispoProperties.createdAt, current.start),
            lt(dispoProperties.createdAt, current.end),
          ),
        ),
      );
      break;
    case "contracts":
      stageConds = and(
        ...baseConds,
        or(
          and(
            sql`${dispoProperties.underContractAt} IS NOT NULL`,
            gte(dispoProperties.underContractAt, current.start),
            lt(dispoProperties.underContractAt, current.end),
          ),
          and(
            eq(dispoProperties.everUnderContract, true),
            sql`${dispoProperties.underContractAt} IS NULL`,
            gte(dispoProperties.createdAt, current.start),
            lt(dispoProperties.createdAt, current.end),
          ),
        ),
      );
      break;
    case "closed":
      stageConds = and(
        ...baseConds,
        or(
          and(
            sql`${dispoProperties.closedAt} IS NOT NULL`,
            gte(dispoProperties.closedAt, current.start),
            lt(dispoProperties.closedAt, current.end),
          ),
          and(
            eq(dispoProperties.everClosed, true),
            sql`${dispoProperties.closedAt} IS NULL`,
            gte(dispoProperties.createdAt, current.start),
            lt(dispoProperties.createdAt, current.end),
          ),
        ),
      );
      break;
  }

  const props = await db
    .select({
      id: dispoProperties.id,
      address: dispoProperties.address,
      city: dispoProperties.city,
      state: dispoProperties.state,
      status: dispoProperties.status,
      sellerName: dispoProperties.sellerName,
      contractPrice: dispoProperties.contractPrice,
      acceptedOffer: dispoProperties.acceptedOffer,
      createdAt: dispoProperties.createdAt,
      aptSetAt: dispoProperties.aptSetAt,
      offerMadeAt: dispoProperties.offerMadeAt,
      underContractAt: dispoProperties.underContractAt,
      closedAt: dispoProperties.closedAt,
      sourceId: dispoProperties.sourceId,
      marketId: dispoProperties.marketId,
      opportunitySource: dispoProperties.opportunitySource,
      market: dispoProperties.market,
    })
    .from(dispoProperties)
    .where(stageConds)
    .orderBy(sql`${dispoProperties.createdAt} DESC`)
    .limit(200);

  return props;
}
