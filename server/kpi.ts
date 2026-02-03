import { getDb } from "./db";
import { 
  kpiPeriods, 
  teamMemberKpis, 
  campaignKpis, 
  kpiDeals, 
  kpiGoals,
  teamMembers,
  leadGenStaff,
  kpiMarkets,
  kpiChannels,
  type CampaignKpi
} from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

// ============ PERIODS ============

export async function getKpiPeriods(periodType?: "daily" | "weekly" | "monthly") {
  const db = await getDb();
  if (!db) return [];
  
  if (periodType) {
    return db.select().from(kpiPeriods).where(eq(kpiPeriods.periodType, periodType)).orderBy(desc(kpiPeriods.periodStart));
  }
  return db.select().from(kpiPeriods).orderBy(desc(kpiPeriods.periodStart));
}

export async function getKpiPeriodById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [period] = await db.select().from(kpiPeriods).where(eq(kpiPeriods.id, id));
  return period;
}

export async function createKpiPeriod(data: {
  periodType: "daily" | "weekly" | "monthly";
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
}) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.insert(kpiPeriods).values(data);
  return result.insertId;
}

// ============ TEAM MEMBER KPIs ============

export async function getTeamMemberKpis(periodId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select({
      kpi: teamMemberKpis,
      teamMember: teamMembers,
    })
    .from(teamMemberKpis)
    .leftJoin(teamMembers, eq(teamMemberKpis.teamMemberId, teamMembers.id))
    .where(eq(teamMemberKpis.periodId, periodId));
}

export async function upsertTeamMemberKpi(data: {
  teamMemberId: number;
  periodId: number;
  roleType: "am" | "lm" | "lg_cold_caller" | "lg_sms";
  metric1: number;
  metric2: number;
  metric3: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  
  // Check if record exists
  const [existing] = await db
    .select()
    .from(teamMemberKpis)
    .where(
      and(
        eq(teamMemberKpis.teamMemberId, data.teamMemberId),
        eq(teamMemberKpis.periodId, data.periodId)
      )
    );

  // Set labels based on role type
  const labels = getMetricLabels(data.roleType);

  if (existing) {
    await db
      .update(teamMemberKpis)
      .set({
        metric1: data.metric1,
        metric2: data.metric2,
        metric3: data.metric3,
        metric1Label: labels.metric1,
        metric2Label: labels.metric2,
        metric3Label: labels.metric3,
        notes: data.notes,
      })
      .where(eq(teamMemberKpis.id, existing.id));
    return existing.id;
  } else {
    const [result] = await db.insert(teamMemberKpis).values({
      ...data,
      metric1Label: labels.metric1,
      metric2Label: labels.metric2,
      metric3Label: labels.metric3,
    });
    return result.insertId;
  }
}

function getMetricLabels(roleType: "am" | "lm" | "lg_cold_caller" | "lg_sms") {
  switch (roleType) {
    case "am":
      return { metric1: "Calls", metric2: "Offers", metric3: "Contracts" };
    case "lm":
      return { metric1: "Calls", metric2: "Conversations", metric3: "Appointments" };
    case "lg_cold_caller":
      return { metric1: "Time (mins)", metric2: "Conversations", metric3: "Leads" };
    case "lg_sms":
      return { metric1: "SMS Sent", metric2: "Responses", metric3: "Leads" };
  }
}

// ============ CAMPAIGN KPIs ============

export async function getCampaignKpis(periodId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(campaignKpis)
    .where(eq(campaignKpis.periodId, periodId));
}

export async function upsertCampaignKpi(data: {
  periodId: number;
  market: "tennessee" | "global";
  channel: "cold_calls" | "sms" | "forms" | "ppl" | "jv" | "ppc" | "postcards" | "referrals";
  spent: number;
  volume: number;
  contacts: number;
  leads: number;
  offers: number;
  contracts: number;
  dealsCount: number;
  revenue: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  
  // Check if record exists (unique by period + market + channel)
  const [existing] = await db
    .select()
    .from(campaignKpis)
    .where(
      and(
        eq(campaignKpis.periodId, data.periodId),
        eq(campaignKpis.market, data.market),
        eq(campaignKpis.channel, data.channel)
      )
    );

  if (existing) {
    await db
      .update(campaignKpis)
      .set({
        spent: data.spent,
        volume: data.volume,
        contacts: data.contacts,
        leads: data.leads,
        offers: data.offers,
        contracts: data.contracts,
        dealsCount: data.dealsCount,
        revenue: data.revenue,
        notes: data.notes,
      })
      .where(eq(campaignKpis.id, existing.id));
    return existing.id;
  } else {
    const [result] = await db.insert(campaignKpis).values(data);
    return result.insertId;
  }
}

// ============ DEALS ============

export async function getKpiDeals(periodId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  if (periodId) {
    return db
      .select()
      .from(kpiDeals)
      .where(eq(kpiDeals.periodId, periodId))
      .orderBy(desc(kpiDeals.contractDate));
  }
  return db.select().from(kpiDeals).orderBy(desc(kpiDeals.contractDate));
}

export async function getKpiDealById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [deal] = await db.select().from(kpiDeals).where(eq(kpiDeals.id, id));
  return deal;
}

export async function createKpiDeal(data: {
  periodId?: number;
  propertyAddress: string;
  inventoryStatus?: "for_sale" | "assigned" | "funded";
  location?: "nashville" | "nash_sw" | "knoxville" | "chattanooga" | "global" | "nah";
  leadSource?: "cold_calls" | "sms" | "postcards" | "forms" | "ppl" | "ppc" | "jv" | "referrals";
  lmName?: "chris" | "daniel";
  amName?: "kyle";
  dmName?: "esteban" | "steve";
  revenue?: number;
  assignmentFee?: number;
  profit?: number;
  contractDate?: Date;
  closingDate?: Date;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.insert(kpiDeals).values(data);
  return result.insertId;
}

export async function updateKpiDeal(id: number, data: Partial<{
  periodId: number;
  propertyAddress: string;
  inventoryStatus: "for_sale" | "assigned" | "funded";
  location: "nashville" | "nash_sw" | "knoxville" | "chattanooga" | "global" | "nah";
  leadSource: "cold_calls" | "sms" | "postcards" | "forms" | "ppl" | "ppc" | "jv" | "referrals";
  lmName: "chris" | "daniel";
  amName: "kyle";
  dmName: "esteban" | "steve";
  revenue: number;
  assignmentFee: number;
  profit: number;
  contractDate: Date;
  closingDate: Date;
  notes: string;
}>) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(kpiDeals).set(data).where(eq(kpiDeals.id, id));
}

export async function deleteKpiDeal(id: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(kpiDeals).where(eq(kpiDeals.id, id));
}

// ============ SCOREBOARD CALCULATIONS ============

export async function getScoreboardData(periodId: number) {
  const campaigns = await getCampaignKpis(periodId);
  
  // Calculate totals and ROI metrics
  const totals = {
    spent: 0,
    volume: 0,
    contacts: 0,
    leads: 0,
    offers: 0,
    contracts: 0,
    deals: 0,
    revenue: 0,
  };

  const channelData = campaigns.map((c: CampaignKpi) => {
    totals.spent += c.spent;
    totals.volume += c.volume;
    totals.contacts += c.contacts;
    totals.leads += c.leads;
    totals.offers += c.offers;
    totals.contracts += c.contracts;
    totals.deals += c.dealsCount;
    totals.revenue += c.revenue;

    return {
      id: c.id,
      channel: c.channel,
      market: c.market,
      spent: c.spent,
      volume: c.volume,
      contacts: c.contacts,
      leads: c.leads,
      offers: c.offers,
      contracts: c.contracts,
      deals: c.dealsCount,
      revenue: c.revenue,
      notes: c.notes,
      // Calculated metrics
      contactRate: c.volume > 0 ? (c.contacts / c.volume) * 100 : 0, // Answer rate / Response rate
      costPerLead: c.leads > 0 ? c.spent / c.leads : 0,
      costPerOffer: c.offers > 0 ? c.spent / c.offers : 0,
      costPerContract: c.contracts > 0 ? c.spent / c.contracts : 0,
      costPerDeal: c.dealsCount > 0 ? c.spent / c.dealsCount : 0,
      roi: c.spent > 0 ? ((c.revenue - c.spent) / c.spent) * 100 : 0,
    };
  });

  return {
    channels: channelData,
    totals: {
      ...totals,
      contactRate: totals.volume > 0 ? (totals.contacts / totals.volume) * 100 : 0,
      costPerLead: totals.leads > 0 ? totals.spent / totals.leads : 0,
      costPerOffer: totals.offers > 0 ? totals.spent / totals.offers : 0,
      costPerContract: totals.contracts > 0 ? totals.spent / totals.contracts : 0,
      costPerDeal: totals.deals > 0 ? totals.spent / totals.deals : 0,
      roi: totals.spent > 0 ? ((totals.revenue - totals.spent) / totals.spent) * 100 : 0,
    },
  };
}

// ============ GOALS ============

export async function getKpiGoals(periodId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  if (periodId) {
    return db.select().from(kpiGoals).where(eq(kpiGoals.periodId, periodId));
  }
  return db.select().from(kpiGoals);
}

export async function upsertKpiGoal(data: {
  periodId?: number;
  goalType: "campaign" | "team_member";
  channel?: "cold_calls" | "sms" | "forms" | "ppl" | "jv" | "ppc" | "postcards" | "referrals" | "total";
  teamMemberId?: number;
  metricName: string;
  targetValue: number;
}) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.insert(kpiGoals).values(data);
  return result.insertId;
}


// ============ LEAD GEN STAFF ============

export async function getLeadGenStaff(activeOnly: boolean = true) {
  const db = await getDb();
  if (!db) return [];
  
  if (activeOnly) {
    return db.select().from(leadGenStaff).where(eq(leadGenStaff.isActive, "true")).orderBy(leadGenStaff.name);
  }
  return db.select().from(leadGenStaff).orderBy(leadGenStaff.name);
}

export async function createLeadGenStaff(data: {
  name: string;
  roleType: "lg_cold_caller" | "lg_sms" | "am" | "lm";
}) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.insert(leadGenStaff).values({
    name: data.name,
    roleType: data.roleType,
    isActive: "true",
  });
  return result.insertId;
}

export async function updateLeadGenStaff(id: number, data: {
  name?: string;
  roleType?: "lg_cold_caller" | "lg_sms" | "am" | "lm";
  isActive?: "true" | "false";
  endDate?: Date | null;
}) {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(leadGenStaff).set(data).where(eq(leadGenStaff.id, id));
  return true;
}

export async function deleteLeadGenStaff(id: number) {
  const db = await getDb();
  if (!db) return false;
  
  await db.delete(leadGenStaff).where(eq(leadGenStaff.id, id));
  return true;
}

// ============ KPI MARKETS ============

export async function getKpiMarkets(activeOnly: boolean = true) {
  const db = await getDb();
  if (!db) return [];
  
  if (activeOnly) {
    return db.select().from(kpiMarkets).where(eq(kpiMarkets.isActive, "true")).orderBy(kpiMarkets.name);
  }
  return db.select().from(kpiMarkets).orderBy(kpiMarkets.name);
}

export async function createKpiMarket(name: string) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.insert(kpiMarkets).values({ name, isActive: "true" });
  return result.insertId;
}

export async function updateKpiMarket(id: number, data: { name?: string; isActive?: "true" | "false" }) {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(kpiMarkets).set(data).where(eq(kpiMarkets.id, id));
  return true;
}

export async function deleteKpiMarket(id: number) {
  const db = await getDb();
  if (!db) return false;
  
  await db.delete(kpiMarkets).where(eq(kpiMarkets.id, id));
  return true;
}

// ============ KPI CHANNELS ============

export async function getKpiChannels(activeOnly: boolean = true) {
  const db = await getDb();
  if (!db) return [];
  
  if (activeOnly) {
    return db.select().from(kpiChannels).where(eq(kpiChannels.isActive, "true")).orderBy(kpiChannels.name);
  }
  return db.select().from(kpiChannels).orderBy(kpiChannels.name);
}

export async function createKpiChannel(name: string, code: string) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.insert(kpiChannels).values({ name, code, isActive: "true" });
  return result.insertId;
}

export async function updateKpiChannel(id: number, data: { name?: string; code?: string; isActive?: "true" | "false" }) {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(kpiChannels).set(data).where(eq(kpiChannels.id, id));
  return true;
}

export async function deleteKpiChannel(id: number) {
  const db = await getDb();
  if (!db) return false;
  
  await db.delete(kpiChannels).where(eq(kpiChannels.id, id));
  return true;
}
