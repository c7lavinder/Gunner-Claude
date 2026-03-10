import type { IndustryPlaybook } from "../../shared/types";
import { RE_WHOLESALING_PLAYBOOK } from "./reWholesaling";

export const SOLAR_PLAYBOOK: IndustryPlaybook = {
  code: "solar",
  name: "Solar Sales",
  terminology: {
    contact: "Homeowner", contactPlural: "Homeowners",
    asset: "Property", assetPlural: "Properties",
    deal: "Deal", dealPlural: "Deals",
    walkthrough: "Site Survey",
  },
  roles: [
    { code: "setter", name: "Setter", description: "Sets appointments for closers via door-to-door or phone", color: "#0ea5e9" },
    { code: "closer", name: "Closer", description: "Runs the in-home or virtual consultation and closes the deal", color: "#6366f1" },
    { code: "project_mgr", name: "Project Manager", description: "Manages install timeline, permits, and inspections", color: "#10b981" },
  ],
  stages: [
    { code: "new_lead", name: "New Lead", pipeline: "sales", order: 0 },
    { code: "appointment_set", name: "Appointment Set", pipeline: "sales", order: 1 },
    { code: "consultation_done", name: "Consultation Done", pipeline: "sales", order: 2 },
    { code: "proposal_sent", name: "Proposal Sent", pipeline: "sales", order: 3 },
    { code: "contract_signed", name: "Contract Signed", pipeline: "sales", order: 4 },
    { code: "site_survey", name: "Site Survey", pipeline: "install", order: 5 },
    { code: "permitting", name: "Permitting", pipeline: "install", order: 6 },
    { code: "install_scheduled", name: "Install Scheduled", pipeline: "install", order: 7 },
    { code: "installed", name: "Installed", pipeline: "install", order: 8 },
    { code: "pto", name: "PTO Approved", pipeline: "install", order: 9 },
    { code: "dead", name: "Dead", pipeline: "sales", order: 99 },
  ],
  callTypes: [
    { code: "cold_knock", name: "Door Knock / Cold Call", description: "First contact with homeowner" },
    { code: "appointment_confirm", name: "Appointment Confirmation", description: "Confirming scheduled consultation" },
    { code: "consultation", name: "Consultation Call", description: "Running the solar presentation" },
    { code: "follow_up", name: "Follow Up", description: "Post-consultation nurture" },
  ],
  rubrics: [
    {
      id: "solar-setter",
      name: "Solar Setter Call",
      role: "setter",
      callType: "cold_knock",
      totalPoints: 100,
      criteria: [
        { name: "Opening Hook", maxPoints: 20, description: "Captures attention quickly with a relevant hook" },
        { name: "Qualification", maxPoints: 25, description: "Confirms homeownership, roof age, electric bill, credit" },
        { name: "Value Proposition", maxPoints: 20, description: "Clearly explains savings and incentives" },
        { name: "Objection Handling", maxPoints: 20, description: "Handles objections around cost, roof, timing" },
        { name: "Appointment Close", maxPoints: 15, description: "Secures a firm appointment with date/time" },
      ],
    },
  ],
  outcomeTypes: ["Appointment Set", "Proposal Sent", "Contract Signed", "Not Interested", "Not Qualified", "Voicemail"],
  kpiFunnelStages: ["Doors Knocked", "Contacts Made", "Appointments Set", "Proposals Sent", "Contracts Signed", "Installs Completed"],
  algorithmDefaults: {
    inventorySort: { newLeadWeight: 100, staleContactWeight: 75, appointmentTodayWeight: 95 },
    buyerMatch: {},
    taskSort: { urgentCallbackWeight: 100, appointmentPrepWeight: 90, followUpWeight: 70 },
  },
};

export const INSURANCE_PLAYBOOK: IndustryPlaybook = {
  code: "insurance",
  name: "Insurance Sales",
  terminology: {
    contact: "Prospect", contactPlural: "Prospects",
    asset: "Policy", assetPlural: "Policies",
    deal: "Policy", dealPlural: "Policies",
    walkthrough: "Needs Assessment",
  },
  roles: [
    { code: "agent", name: "Insurance Agent", description: "Sells and services insurance policies", color: "#6366f1" },
    { code: "csr", name: "Customer Service Rep", description: "Handles inbound inquiries and policy changes", color: "#0ea5e9" },
  ],
  stages: [
    { code: "new_lead", name: "New Lead", pipeline: "sales", order: 0 },
    { code: "contacted", name: "Contacted", pipeline: "sales", order: 1 },
    { code: "needs_analysis", name: "Needs Analysis", pipeline: "sales", order: 2 },
    { code: "quote_sent", name: "Quote Sent", pipeline: "sales", order: 3 },
    { code: "application", name: "Application", pipeline: "sales", order: 4 },
    { code: "underwriting", name: "Underwriting", pipeline: "sales", order: 5 },
    { code: "policy_issued", name: "Policy Issued", pipeline: "service", order: 6 },
    { code: "dead", name: "Dead", pipeline: "sales", order: 99 },
  ],
  callTypes: [
    { code: "cold_call", name: "Cold Call", description: "Outreach to a new prospect" },
    { code: "quote_followup", name: "Quote Follow-Up", description: "Following up after sending a quote" },
    { code: "renewal", name: "Renewal Call", description: "Annual renewal review" },
    { code: "claims_assist", name: "Claims Assist", description: "Helping a client with a claim" },
  ],
  rubrics: [
    {
      id: "ins-cold",
      name: "Insurance Cold Call",
      role: "agent",
      callType: "cold_call",
      totalPoints: 100,
      criteria: [
        { name: "Introduction", maxPoints: 15, description: "Clear intro with name and agency" },
        { name: "Needs Discovery", maxPoints: 25, description: "Uncovers current coverage gaps and life changes" },
        { name: "Value Presentation", maxPoints: 25, description: "Explains coverage benefits, not just price" },
        { name: "Objection Handling", maxPoints: 20, description: "Handles price and loyalty objections" },
        { name: "Next Step", maxPoints: 15, description: "Sets clear next step — quote, appointment, or application" },
      ],
    },
  ],
  outcomeTypes: ["Quote Requested", "Application Started", "Policy Bound", "Not Interested", "Voicemail", "Call Back Later"],
  kpiFunnelStages: ["Leads Generated", "Contacts Made", "Quotes Sent", "Applications", "Policies Issued"],
  algorithmDefaults: {
    inventorySort: { renewalWeight: 100, newLeadWeight: 85, quoteFollowUpWeight: 90 },
    buyerMatch: {},
    taskSort: { claimsPriorityWeight: 100, renewalWeight: 90, followUpWeight: 70 },
  },
};

export const SAAS_PLAYBOOK: IndustryPlaybook = {
  code: "saas",
  name: "SaaS Sales",
  terminology: {
    contact: "Lead", contactPlural: "Leads",
    asset: "Account", assetPlural: "Accounts",
    deal: "Opportunity", dealPlural: "Opportunities",
    walkthrough: "Demo",
  },
  roles: [
    { code: "sdr", name: "SDR", description: "Qualifies leads and books demos", color: "#0ea5e9" },
    { code: "ae", name: "Account Executive", description: "Runs demos and closes deals", color: "#6366f1" },
    { code: "csm", name: "Customer Success Manager", description: "Onboards and retains customers", color: "#10b981" },
  ],
  stages: [
    { code: "mql", name: "MQL", pipeline: "sales", order: 0 },
    { code: "sql", name: "SQL", pipeline: "sales", order: 1 },
    { code: "demo_scheduled", name: "Demo Scheduled", pipeline: "sales", order: 2 },
    { code: "demo_completed", name: "Demo Completed", pipeline: "sales", order: 3 },
    { code: "proposal", name: "Proposal", pipeline: "sales", order: 4 },
    { code: "negotiation", name: "Negotiation", pipeline: "sales", order: 5 },
    { code: "closed_won", name: "Closed Won", pipeline: "sales", order: 6 },
    { code: "closed_lost", name: "Closed Lost", pipeline: "sales", order: 99 },
  ],
  callTypes: [
    { code: "discovery", name: "Discovery Call", description: "Initial qualification and needs assessment" },
    { code: "demo", name: "Demo", description: "Product demonstration" },
    { code: "follow_up", name: "Follow Up", description: "Post-demo nurture" },
    { code: "negotiation", name: "Negotiation Call", description: "Pricing and terms discussion" },
  ],
  rubrics: [
    {
      id: "saas-discovery",
      name: "SaaS Discovery Call",
      role: "sdr",
      callType: "discovery",
      totalPoints: 100,
      criteria: [
        { name: "Agenda Setting", maxPoints: 10, description: "Sets clear agenda for the call" },
        { name: "Pain Discovery", maxPoints: 30, description: "Uncovers 2-3 specific pain points" },
        { name: "Budget & Authority", maxPoints: 20, description: "Identifies decision maker and budget range" },
        { name: "Timeline", maxPoints: 15, description: "Establishes buying timeline and urgency" },
        { name: "Next Step", maxPoints: 15, description: "Secures demo or meeting with decision maker" },
        { name: "Professionalism", maxPoints: 10, description: "Maintains consultative, not pushy, approach" },
      ],
    },
  ],
  outcomeTypes: ["Demo Booked", "Qualified Out", "Proposal Sent", "Closed Won", "Closed Lost", "Voicemail", "No Show"],
  kpiFunnelStages: ["Leads", "SQLs", "Demos", "Proposals", "Closed Won"],
  algorithmDefaults: {
    inventorySort: { demoTodayWeight: 100, proposalFollowUpWeight: 90, newMqlWeight: 70 },
    buyerMatch: {},
    taskSort: { demoFollowUpWeight: 100, proposalWeight: 90, coldOutreachWeight: 50 },
  },
};

export const HOME_SERVICES_PLAYBOOK: IndustryPlaybook = {
  code: "home-services",
  name: "Home Services",
  terminology: {
    contact: "Customer", contactPlural: "Customers",
    asset: "Job", assetPlural: "Jobs",
    deal: "Job", dealPlural: "Jobs",
    walkthrough: "Estimate Visit",
  },
  roles: [
    { code: "csr", name: "CSR", description: "Handles inbound calls and books estimates", color: "#0ea5e9" },
    { code: "estimator", name: "Estimator", description: "Runs on-site estimates and closes jobs", color: "#6366f1" },
    { code: "tech", name: "Technician", description: "Executes the work on-site", color: "#10b981" },
  ],
  stages: [
    { code: "new_lead", name: "New Lead", pipeline: "sales", order: 0 },
    { code: "estimate_scheduled", name: "Estimate Scheduled", pipeline: "sales", order: 1 },
    { code: "estimate_given", name: "Estimate Given", pipeline: "sales", order: 2 },
    { code: "job_sold", name: "Job Sold", pipeline: "production", order: 3 },
    { code: "scheduled", name: "Scheduled", pipeline: "production", order: 4 },
    { code: "in_progress", name: "In Progress", pipeline: "production", order: 5 },
    { code: "completed", name: "Completed", pipeline: "production", order: 6 },
    { code: "dead", name: "Dead", pipeline: "sales", order: 99 },
  ],
  callTypes: [
    { code: "inbound", name: "Inbound Call", description: "Customer calls in for service" },
    { code: "estimate_follow_up", name: "Estimate Follow-Up", description: "Following up after an estimate" },
    { code: "scheduling", name: "Scheduling Call", description: "Scheduling or rescheduling work" },
  ],
  rubrics: [
    {
      id: "hs-inbound",
      name: "Home Services Inbound",
      role: "csr",
      callType: "inbound",
      totalPoints: 100,
      criteria: [
        { name: "Greeting & Energy", maxPoints: 15, description: "Answers with enthusiasm and professionalism" },
        { name: "Needs Assessment", maxPoints: 25, description: "Understands the customer's problem and urgency" },
        { name: "Service Explanation", maxPoints: 20, description: "Explains what they do and how it works" },
        { name: "Pricing Confidence", maxPoints: 15, description: "Handles pricing questions with confidence" },
        { name: "Booking", maxPoints: 25, description: "Books the estimate or service visit" },
      ],
    },
  ],
  outcomeTypes: ["Estimate Booked", "Job Sold", "Follow-Up Set", "Not Interested", "Voicemail", "Wrong Number"],
  kpiFunnelStages: ["Inbound Calls", "Estimates Booked", "Estimates Run", "Jobs Sold", "Jobs Completed"],
  algorithmDefaults: {
    inventorySort: { urgentServiceWeight: 100, estimateFollowUpWeight: 90, newLeadWeight: 75 },
    buyerMatch: {},
    taskSort: { urgentServiceWeight: 100, estimateFollowUpWeight: 90, schedulingWeight: 70 },
  },
};

export const ALL_INDUSTRY_PLAYBOOKS: IndustryPlaybook[] = [
  RE_WHOLESALING_PLAYBOOK,
  SOLAR_PLAYBOOK,
  INSURANCE_PLAYBOOK,
  SAAS_PLAYBOOK,
  HOME_SERVICES_PLAYBOOK,
];
