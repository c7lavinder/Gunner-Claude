import { db } from "../_core/db";
import { tenants, tenantPlaybooks } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const NAH_TENANT_ID = 1;

const NAH_PIPELINE_STAGES = [
  { playbookCode: "new_lead", name: "New Lead", ghlPipelineId: "PLACEHOLDER_PIPELINE_ID", ghlStageId: "PLACEHOLDER_STAGE_NEW_LEAD", order: 0 },
  { playbookCode: "contacted", name: "Contacted", ghlPipelineId: "PLACEHOLDER_PIPELINE_ID", ghlStageId: "PLACEHOLDER_STAGE_CONTACTED", order: 1 },
  { playbookCode: "appointment_set", name: "Appointment Set", ghlPipelineId: "PLACEHOLDER_PIPELINE_ID", ghlStageId: "PLACEHOLDER_STAGE_APPT", order: 2 },
  { playbookCode: "offer_made", name: "Offer Made", ghlPipelineId: "PLACEHOLDER_PIPELINE_ID", ghlStageId: "PLACEHOLDER_STAGE_OFFER", order: 3 },
  { playbookCode: "under_contract", name: "Under Contract", ghlPipelineId: "PLACEHOLDER_PIPELINE_ID", ghlStageId: "PLACEHOLDER_STAGE_CONTRACT", order: 4 },
  { playbookCode: "dispo", name: "In Dispo", ghlPipelineId: "PLACEHOLDER_DISPO_PIPELINE_ID", ghlStageId: "PLACEHOLDER_STAGE_DISPO", order: 5 },
  { playbookCode: "closed", name: "Closed", ghlPipelineId: "PLACEHOLDER_PIPELINE_ID", ghlStageId: "PLACEHOLDER_STAGE_CLOSED", order: 6 },
  { playbookCode: "dead", name: "Dead", ghlPipelineId: "PLACEHOLDER_PIPELINE_ID", ghlStageId: "PLACEHOLDER_STAGE_DEAD", order: 99 },
];

const NAH_MARKETS = [
  {
    code: "charlotte-metro",
    name: "Charlotte Metro",
    state: "NC",
    isPrimary: true,
    zipCodes: [
      "28201","28202","28203","28204","28205","28206","28207","28208","28209","28210",
      "28211","28212","28213","28214","28215","28216","28217","28218","28269","28270",
      "28273","28277","28278","28226","28227","28262","28272","28105","28108","28110",
    ],
  },
  {
    code: "kitty-hawk",
    name: "Kitty Hawk / OBX",
    state: "NC",
    isPrimary: false,
    zipCodes: ["27949","27954","27959","27968","27982","27948","27953","27956"],
  },
];

const NAH_LEAD_SOURCES = [
  { code: "cold_call", name: "Cold Call", ghlSourceString: "Cold Call", isActive: true },
  { code: "driving_for_dollars", name: "Driving for Dollars", ghlSourceString: "DFD", isActive: true },
  { code: "direct_mail", name: "Direct Mail", ghlSourceString: "Direct Mail", isActive: true },
  { code: "ppc", name: "PPC / Google Ads", ghlSourceString: "PPC", isActive: true },
  { code: "referral", name: "Referral", ghlSourceString: "Referral", isActive: true },
  { code: "sms_blast", name: "SMS Blast", ghlSourceString: "SMS", isActive: true },
  { code: "facebook", name: "Facebook / Social", ghlSourceString: "Facebook", isActive: true },
  { code: "probate", name: "Probate", ghlSourceString: "Probate", isActive: true },
];

const NAH_KPI_TARGETS = {
  acquisitions: {
    daily: { calls: 50, appointments: 2, offers: 1 },
    weekly: { calls: 250, appointments: 10, offers: 5, contracts: 1 },
    monthly: { calls: 1000, appointments: 40, offers: 20, contracts: 4, deals_closed: 1 },
  },
  lead_manager: {
    daily: { calls: 100, contacts_made: 15, appointments_set: 3 },
    weekly: { calls: 500, contacts_made: 75, appointments_set: 15 },
    monthly: { calls: 2000, contacts_made: 300, appointments_set: 60 },
  },
  dispositions: {
    daily: { buyer_contacts: 10, deals_presented: 3 },
    weekly: { buyer_contacts: 50, deals_presented: 15, deals_assigned: 2 },
    monthly: { buyer_contacts: 200, deals_presented: 60, deals_assigned: 8, deals_closed: 4 },
  },
};

const NAH_ALGORITHM_OVERRIDES = {
  inventorySort: {
    newLeadWeight: 100,
    staleContactWeight: 80,
    highMotivationWeight: 90,
    appointmentTodayWeight: 95,
    offerExpiringWeight: 85,
    contractDeadlineWeight: 70,
  },
  buyerMatch: {
    marketMatchWeight: 45,
    priceRangeWeight: 30,
    propertyTypeWeight: 10,
    speedToCloseWeight: 15,
  },
  taskSort: {
    urgentCallbackWeight: 100,
    missedCallWeight: 90,
    appointmentPrepWeight: 80,
    followUpWeight: 70,
    coldCallWeight: 50,
  },
};

export async function seedNahTenantPlaybook() {
  // Only run if tenant ID=1 exists — skips gracefully on fresh databases
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, NAH_TENANT_ID))
    .limit(1);

  if (!tenant) {
    console.log("[seed] NAH tenant not found — skipping tenant playbook seed");
    return;
  }

  const [existing] = await db
    .select({ id: tenantPlaybooks.id })
    .from(tenantPlaybooks)
    .where(eq(tenantPlaybooks.tenantId, NAH_TENANT_ID))
    .limit(1);

  const data = {
    industryCode: "re-wholesaling",
    stages: NAH_PIPELINE_STAGES,
    markets: NAH_MARKETS,
    leadSources: NAH_LEAD_SOURCES,
    algorithmOverrides: NAH_ALGORITHM_OVERRIDES,
    customConfig: {
      kpiTargets: NAH_KPI_TARGETS,
      primaryMarket: "charlotte-metro",
      companyName: "New Again Houses",
      timezone: "America/New_York",
    },
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(tenantPlaybooks).set(data).where(eq(tenantPlaybooks.tenantId, NAH_TENANT_ID));
    console.log("[seed] NAH tenant playbook updated");
  } else {
    await db.insert(tenantPlaybooks).values({ tenantId: NAH_TENANT_ID, ...data });
    console.log("[seed] NAH tenant playbook inserted");
  }
}
