export interface DemoGrade {
  overallGrade: string;
  overallScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  criteriaScores: Array<{
    name: string;
    score: number;
    maxPoints: number;
    explanation: string;
  }>;
}

type GradeVariant = DemoGrade & { weight: number };

const COLD_CALL_CRITERIA = [
  { name: "Introduction & Rapport", maxPoints: 15 },
  { name: "Reason for Call", maxPoints: 10 },
  { name: "Seller Motivation", maxPoints: 20 },
  { name: "Property Condition", maxPoints: 15 },
  { name: "Financial Discovery", maxPoints: 15 },
  { name: "Timeline & Urgency", maxPoints: 10 },
  { name: "Next Steps & Close", maxPoints: 15 },
];

const WARM_CALL_CRITERIA = [
  { name: "Context Recall", maxPoints: 15 },
  { name: "Updated Situation", maxPoints: 20 },
  { name: "Deeper Motivation", maxPoints: 20 },
  { name: "Objection Handling", maxPoints: 20 },
  { name: "Commitment / Next Step", maxPoints: 15 },
  { name: "Tone & Empathy", maxPoints: 10 },
];

const OFFER_CALL_CRITERIA = [
  { name: "Recap & Frame", maxPoints: 15 },
  { name: "Number Presentation", maxPoints: 20 },
  { name: "Value Anchoring", maxPoints: 15 },
  { name: "Objection Handling", maxPoints: 20 },
  { name: "Urgency Creation", maxPoints: 15 },
  { name: "Contract / Close", maxPoints: 15 },
];

const INBOUND_CRITERIA = [
  { name: "Speed & Energy", maxPoints: 15 },
  { name: "Information Capture", maxPoints: 20 },
  { name: "Qualification", maxPoints: 20 },
  { name: "Rapport Building", maxPoints: 15 },
  { name: "Appointment Setting", maxPoints: 20 },
  { name: "CRM Entry", maxPoints: 10 },
];

const DISPO_CALL_CRITERIA = [
  { name: "Buyer Criteria Confirm", maxPoints: 15 },
  { name: "Deal Presentation", maxPoints: 25 },
  { name: "Urgency & Scarcity", maxPoints: 15 },
  { name: "Objection Handling", maxPoints: 20 },
  { name: "Closing for Commitment", maxPoints: 15 },
  { name: "Follow-Up Setup", maxPoints: 10 },
];

const FOLLOW_UP_CRITERIA = [
  { name: "Context & Personalization", maxPoints: 20 },
  { name: "Updated Qualification", maxPoints: 20 },
  { name: "Value Reinforcement", maxPoints: 15 },
  { name: "Objection Handling", maxPoints: 20 },
  { name: "Advancement", maxPoints: 15 },
  { name: "Professionalism", maxPoints: 10 },
];

function buildCriteria(
  criteria: { name: string; maxPoints: number }[],
  pct: number,
  explanations: string[]
): DemoGrade["criteriaScores"] {
  return criteria.map((c, i) => {
    const score = Math.round((c.maxPoints * pct) / 5) * 5;
    const clamped = Math.min(c.maxPoints, Math.max(0, score));
    return {
      name: c.name,
      score: clamped,
      maxPoints: c.maxPoints,
      explanation: explanations[i] ?? "Met expectations for this criterion.",
    };
  });
}

const COLD_CALL_GRADES: GradeVariant[] = [
  {
    weight: 10,
    overallGrade: "A",
    overallScore: 92,
    summary: "Outstanding cold call. Built strong rapport quickly, uncovered seller motivation and timeline, and secured a concrete next step.",
    strengths: ["Excellent introduction and reason for call", "Deep discovery on seller motivation and property condition", "Clear next step with specific callback date"],
    improvements: ["Could probe slightly deeper on financial expectations before closing"],
    criteriaScores: buildCriteria(
      COLD_CALL_CRITERIA,
      0.92,
      ["Warm, confident intro; seller engaged quickly", "Clearly stated purpose without sounding salesy", "Uncovered inheritance, tax liens, and desire to move", "Asked about roof, basement, HVAC condition", "Discussed mortgage and asking expectations", "Established need to close within 60 days", "Set Tuesday callback with specific time"]
    ),
  },
  {
    weight: 12,
    overallGrade: "B+",
    overallScore: 88,
    summary: "Strong cold call with good discovery and rapport. Minor gaps in financial discovery.",
    strengths: ["Solid rapport building", "Good motivation discovery", "Set clear follow-up"],
    improvements: ["Ask about mortgage balance earlier", "Tighten timeline questions"],
    criteriaScores: buildCriteria(
      COLD_CALL_CRITERIA,
      0.88,
      ["Friendly intro, seller receptive", "Clear reason for calling", "Identified motivation and family situation", "Covered condition basics", "Partial financial info gathered", "Timeline discussed", "Callback scheduled"]
    ),
  },
  {
    weight: 13,
    overallGrade: "B",
    overallScore: 82,
    summary: "Good cold call. Covered most discovery areas but talked a bit too much.",
    strengths: ["Professional demeanor", "Uncovered key motivation", "Got next step"],
    improvements: ["Let seller talk more", "Ask about liens and mortgage earlier"],
    criteriaScores: buildCriteria(
      COLD_CALL_CRITERIA,
      0.82,
      ["Professional intro", "Reason stated", "Motivation partially uncovered", "Some condition questions", "Limited financial discovery", "Timeline mentioned", "Follow-up set"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C+",
    overallScore: 76,
    summary: "Average cold call. Hit the basics but missed depth on motivation and financials.",
    strengths: ["Friendly tone", "Got property address confirmed", "Attempted next step"],
    improvements: ["Ask why they want to sell before pitching", "Discover mortgage and liens", "Reduce talk ratio"],
    criteriaScores: buildCriteria(
      COLD_CALL_CRITERIA,
      0.76,
      ["Decent intro", "Reason for call stated", "Surface-level motivation", "Basic condition questions", "Skipped financial discovery", "Vague timeline", "Weak next step"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C",
    overallScore: 68,
    summary: "Below average. Sounded scripted and did not uncover enough seller motivation.",
    strengths: ["Maintained professionalism", "Confirmed property ownership"],
    improvements: ["Ask open-ended questions", "Build genuine rapport", "Discover motivation before discussing offer"],
    criteriaScores: buildCriteria(
      COLD_CALL_CRITERIA,
      0.68,
      ["Rushed intro", "Generic reason", "Little motivation discovery", "Few condition questions", "No financial discovery", "No timeline", "Vague next step"]
    ),
  },
  {
    weight: 20,
    overallGrade: "D",
    overallScore: 54,
    summary: "Struggled with objections and ended without a clear next step.",
    strengths: ["Attempted to qualify"],
    improvements: ["Handle not interested with empathy", "Never give up without a callback", "Listen before responding"],
    criteriaScores: buildCriteria(
      COLD_CALL_CRITERIA,
      0.54,
      ["Weak intro", "Unclear purpose", "No motivation uncovered", "Skipped condition", "No financial discovery", "No timeline", "No next step"]
    ),
  },
  {
    weight: 5,
    overallGrade: "F",
    overallScore: 38,
    summary: "Unprepared call. Did not research property or qualify seller before pitching.",
    strengths: ["None notable"],
    improvements: ["Research property before calling", "Confirm seller name and address", "Never make offer without qualification"],
    criteriaScores: buildCriteria(
      COLD_CALL_CRITERIA,
      0.38,
      ["Did not confirm name", "No clear reason", "Made offer without motivation", "No condition questions", "No financial discovery", "No timeline", "Call ended abruptly"]
    ),
  },
];

const WARM_CALL_GRADES: GradeVariant[] = [
  {
    weight: 10,
    overallGrade: "A",
    overallScore: 91,
    summary: "Excellent warm call. Referenced prior conversation, re-qualified, and advanced to appointment.",
    strengths: ["Strong context recall", "Updated situation before pitching", "Handled HVAC objection with empathy"],
    improvements: ["Minor: could have asked about competing offers earlier"],
    criteriaScores: buildCriteria(
      WARM_CALL_CRITERIA,
      0.91,
      ["Referenced last week's conversation and family situation", "Confirmed daughter discussion and increased motivation", "Dug into HVAC frustration and repair costs", "Addressed repair concerns with as-is value prop", "Secured Thursday 2pm walkthrough", "Empathetic throughout"]
    ),
  },
  {
    weight: 12,
    overallGrade: "B+",
    overallScore: 86,
    summary: "Solid warm call with good continuity. Could push for commitment more firmly.",
    strengths: ["Good context recall", "Updated qualification", "Professional tone"],
    improvements: ["Trial close earlier", "Address objections with more conviction"],
    criteriaScores: buildCriteria(
      WARM_CALL_CRITERIA,
      0.86,
      ["Referenced prior call", "Checked for changes", "Motivation explored", "Handled some objections", "Got callback", "Professional tone"]
    ),
  },
  {
    weight: 13,
    overallGrade: "B",
    overallScore: 80,
    summary: "Good follow-up. Re-engaged seller but missed some urgency signals.",
    strengths: ["Remembered prior conversation", "Asked about changes"],
    improvements: ["Stronger objection handling", "More direct ask for appointment"],
    criteriaScores: buildCriteria(
      WARM_CALL_CRITERIA,
      0.8,
      ["Some context recall", "Updated situation", "Partial motivation", "Basic objection handling", "Weak commitment", "Decent tone"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C+",
    overallScore: 74,
    summary: "Average warm call. Hit the basics but did not advance the deal.",
    strengths: ["Friendly", "Asked if situation changed"],
    improvements: ["Reference specific prior details", "Push for concrete next step"],
    criteriaScores: buildCriteria(
      WARM_CALL_CRITERIA,
      0.74,
      ["Generic recall", "Surface update", "Limited motivation", "Objections not fully addressed", "No clear next step", "Okay tone"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C",
    overallScore: 66,
    summary: "Below average. Sounded like a cold call, not a follow-up.",
    strengths: ["Maintained professionalism"],
    improvements: ["Reference prior conversation by name", "Re-qualify before pitching", "Show you remember them"],
    criteriaScores: buildCriteria(
      WARM_CALL_CRITERIA,
      0.66,
      ["Little context", "Did not update situation", "No deeper motivation", "Weak objection handling", "Vague next step", "Flat tone"]
    ),
  },
  {
    weight: 20,
    overallGrade: "D",
    overallScore: 52,
    summary: "Pushed for appointment without re-qualifying. Seller felt rushed.",
    strengths: ["Attempted to close"],
    improvements: ["Always re-qualify on warm calls", "Build on prior context", "Do not assume nothing changed"],
    criteriaScores: buildCriteria(
      WARM_CALL_CRITERIA,
      0.52,
      ["No context recall", "Skipped update", "No motivation", "Poor objection handling", "Pushed too hard", "Rushed tone"]
    ),
  },
  {
    weight: 5,
    overallGrade: "F",
    overallScore: 35,
    summary: "Critical failure: did not reference previous conversation. Sounded like cold outreach.",
    strengths: ["None notable"],
    improvements: ["Always reference prior contact", "Never treat warm lead as cold", "Review notes before calling"],
    criteriaScores: buildCriteria(
      WARM_CALL_CRITERIA,
      0.35,
      ["No prior context", "No situation update", "No motivation", "No objection handling", "No commitment", "Unprofessional"]
    ),
  },
];

const OFFER_CALL_GRADES: GradeVariant[] = [
  {
    weight: 10,
    overallGrade: "A",
    overallScore: 93,
    summary: "Outstanding offer presentation. Recapped situation, presented number with justification, anchored value, and handled price objection professionally.",
    strengths: ["Clear recap before presenting", "Confident number with repair breakdown", "Anchored on speed and certainty", "Handled Zillow objection with data"],
    improvements: ["Could create slightly more urgency on timeline"],
    criteriaScores: buildCriteria(
      OFFER_CALL_CRITERIA,
      0.93,
      ["Recapped walkthrough and repairs before number", "Presented $142K with clear justification", "Anchored on speed, no repairs, certainty", "Addressed Zillow with comp logic", "Monday follow-up creates gentle urgency", "Moved toward contract with clear path"]
    ),
  },
  {
    weight: 12,
    overallGrade: "B+",
    overallScore: 87,
    summary: "Strong offer call. Good presentation and objection handling. Minor gap in urgency.",
    strengths: ["Solid recap", "Handled price pushback", "Value anchoring present"],
    improvements: ["Create more urgency", "Tighten transition to close"],
    criteriaScores: buildCriteria(
      OFFER_CALL_CRITERIA,
      0.87,
      ["Recapped situation", "Clear number presentation", "Value mentioned", "Handled objection", "Some urgency", "Next step set"]
    ),
  },
  {
    weight: 13,
    overallGrade: "B",
    overallScore: 81,
    summary: "Good offer presentation. Seller considering. Could improve objection handling.",
    strengths: ["Professional presentation", "Number justified", "Got callback commitment"],
    improvements: ["Address concerns more directly", "Stronger value anchoring"],
    criteriaScores: buildCriteria(
      OFFER_CALL_CRITERIA,
      0.81,
      ["Basic recap", "Number presented", "Some value", "Partial objection handling", "Limited urgency", "Callback set"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C+",
    overallScore: 75,
    summary: "Average offer call. Presented number but seller concerns were not fully addressed.",
    strengths: ["Got number out", "Maintained composure"],
    improvements: ["Justify number with comps", "Handle price objection with logic", "Create urgency"],
    criteriaScores: buildCriteria(
      OFFER_CALL_CRITERIA,
      0.75,
      ["Weak recap", "Number given", "Little value anchoring", "Objection partially addressed", "No urgency", "Vague next step"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C",
    overallScore: 67,
    summary: "Below average. Presented number without enough context. Seller pushed back and rep got defensive.",
    strengths: ["Attempted to close"],
    improvements: ["Recap before presenting", "Never get defensive on price", "Anchor value before number"],
    criteriaScores: buildCriteria(
      OFFER_CALL_CRITERIA,
      0.67,
      ["No recap", "Number dropped", "No value anchoring", "Defensive on objection", "No urgency", "Weak close"]
    ),
  },
  {
    weight: 20,
    overallGrade: "D",
    overallScore: 53,
    summary: "Presented number without justification. Got defensive when seller pushed back.",
    strengths: ["Stated offer amount"],
    improvements: ["Always justify with comps", "Never present without context", "Stay calm on objections"],
    criteriaScores: buildCriteria(
      OFFER_CALL_CRITERIA,
      0.53,
      ["No recap", "Number without context", "No value", "Poor objection handling", "No urgency", "No close"]
    ),
  },
  {
    weight: 5,
    overallGrade: "F",
    overallScore: 36,
    summary: "Critical failure: presented number without any justification or context. Defensive when challenged.",
    strengths: ["None notable"],
    improvements: ["Never present number without recap", "Justify every offer", "Stay professional when challenged"],
    criteriaScores: buildCriteria(
      OFFER_CALL_CRITERIA,
      0.36,
      ["No recap", "Number dropped cold", "No value", "Argumentative", "No urgency", "Call ended poorly"]
    ),
  },
];

const INBOUND_GRADES: GradeVariant[] = [
  {
    weight: 10,
    overallGrade: "A",
    overallScore: 92,
    summary: "Excellent inbound handling. Answered with energy, captured all info quickly, qualified, and set appointment.",
    strengths: ["Fast, enthusiastic answer", "Captured name, address, phone, email in under 2 min", "Qualified motivation and timeline", "Set walkthrough for Thursday"],
    improvements: ["Confirm CRM entry verbally"],
    criteriaScores: buildCriteria(
      INBOUND_CRITERIA,
      0.92,
      ["Answered promptly with energy", "All key info captured quickly", "Motivation, timeline, condition asked", "Seller felt comfortable", "Appointment set", "Confirmed follow-up in system"]
    ),
  },
  {
    weight: 12,
    overallGrade: "B+",
    overallScore: 86,
    summary: "Strong inbound. Good capture and qualification. Minor delay in appointment ask.",
    strengths: ["Professional energy", "Complete info capture", "Good qualification"],
    improvements: ["Ask for appointment earlier", "Confirm CRM entry"],
    criteriaScores: buildCriteria(
      INBOUND_CRITERIA,
      0.86,
      ["Good energy", "Info captured", "Qualified well", "Rapport built", "Appointment set", "CRM mentioned"]
    ),
  },
  {
    weight: 13,
    overallGrade: "B",
    overallScore: 79,
    summary: "Good inbound. Captured info and qualified. Could improve appointment conversion.",
    strengths: ["Friendly", "Got key details", "Qualified basics"],
    improvements: ["Stronger appointment ask", "Faster info capture"],
    criteriaScores: buildCriteria(
      INBOUND_CRITERIA,
      0.79,
      ["Decent energy", "Most info captured", "Partial qualification", "Some rapport", "Callback only", "CRM not confirmed"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C+",
    overallScore: 72,
    summary: "Average inbound. Hit basics but let caller hang up without clear next step.",
    strengths: ["Answered", "Got name and address"],
    improvements: ["Capture all info before they go", "Always set next step", "Qualify motivation"],
    criteriaScores: buildCriteria(
      INBOUND_CRITERIA,
      0.72,
      ["Okay energy", "Partial capture", "Weak qualification", "Limited rapport", "No appointment", "No CRM mention"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C",
    overallScore: 64,
    summary: "Below average. Did not capture full info. Caller hung up without next step.",
    strengths: ["Answered call"],
    improvements: ["Capture name, address, phone, email in first 2 min", "Never let them hang up without next step"],
    criteriaScores: buildCriteria(
      INBOUND_CRITERIA,
      0.64,
      ["Flat energy", "Incomplete capture", "No qualification", "No rapport", "No next step", "No CRM"]
    ),
  },
  {
    weight: 20,
    overallGrade: "D",
    overallScore: 50,
    summary: "Critical gap: did not capture seller name and address. Caller hung up without next step.",
    strengths: ["Answered"],
    improvements: ["Always capture name and address", "Set callback or appointment before they go"],
    criteriaScores: buildCriteria(
      INBOUND_CRITERIA,
      0.5,
      ["Slow answer", "No name/address", "No qualification", "No rapport", "No next step", "No CRM"]
    ),
  },
  {
    weight: 5,
    overallGrade: "F",
    overallScore: 34,
    summary: "Critical failure: let caller hang up without capturing name, address, or setting next step.",
    strengths: ["None notable"],
    improvements: ["Capture name and address immediately", "Never end call without next step", "Qualify before they go"],
    criteriaScores: buildCriteria(
      INBOUND_CRITERIA,
      0.34,
      ["Poor energy", "No capture", "No qualification", "No rapport", "Caller hung up", "No CRM"]
    ),
  },
];

const DISPO_CALL_GRADES: GradeVariant[] = [
  {
    weight: 10,
    overallGrade: "A",
    overallScore: 91,
    summary: "Outstanding dispo call. Confirmed buyer criteria, presented deal clearly with numbers, created urgency, and got commitment.",
    strengths: ["Confirmed area and price range first", "Clear ARV, rehab, assignment fee", "Communicated competitive interest", "Got EMD commitment"],
    improvements: ["Could mention walkthrough availability earlier"],
    criteriaScores: buildCriteria(
      DISPO_CALL_CRITERIA,
      0.91,
      ["Confirmed Nashville, $80K range, SFR", "Presented address, ARV, rehab, fee clearly", "Mentioned other buyers interested", "Handled ARV question with comps", "Got EMD commitment", "Set walkthrough if needed"]
    ),
  },
  {
    weight: 12,
    overallGrade: "B+",
    overallScore: 85,
    summary: "Strong dispo pitch. Good deal presentation and objection handling.",
    strengths: ["Checked buyer criteria", "Clear numbers", "Handled price concern"],
    improvements: ["Create more urgency", "Push for commitment"],
    criteriaScores: buildCriteria(
      DISPO_CALL_CRITERIA,
      0.85,
      ["Criteria confirmed", "Deal presented well", "Some urgency", "Objection handled", "Callback set", "Follow-up clear"]
    ),
  },
  {
    weight: 13,
    overallGrade: "B",
    overallScore: 78,
    summary: "Good dispo call. Presented deal but could not close. Set follow-up.",
    strengths: ["Professional presentation", "Numbers clear", "Buyer engaged"],
    improvements: ["Confirm criteria before pitching", "Stronger close attempt"],
    criteriaScores: buildCriteria(
      DISPO_CALL_CRITERIA,
      0.78,
      ["Partial criteria check", "Deal presented", "Limited urgency", "Basic objection handling", "No commitment", "Follow-up set"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C+",
    overallScore: 71,
    summary: "Average dispo. Pitched deal without confirming buyer criteria first.",
    strengths: ["Got numbers out", "Buyer listened"],
    improvements: ["Always confirm criteria before pitching", "Answer basic property questions"],
    criteriaScores: buildCriteria(
      DISPO_CALL_CRITERIA,
      0.71,
      ["Skipped criteria", "Deal presented", "No urgency", "Weak objection handling", "No commitment", "Vague follow-up"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C",
    overallScore: 62,
    summary: "Below average. Could not answer basic property questions. Buyer lost confidence.",
    strengths: ["Attempted pitch"],
    improvements: ["Know the deal before calling", "Confirm buyer criteria", "Be ready for objections"],
    criteriaScores: buildCriteria(
      DISPO_CALL_CRITERIA,
      0.62,
      ["No criteria", "Weak presentation", "No urgency", "Could not answer questions", "No close", "No follow-up"]
    ),
  },
  {
    weight: 20,
    overallGrade: "D",
    overallScore: 51,
    summary: "Did not confirm buyer criteria before pitching. Could not answer ARV question.",
    strengths: ["Made the call"],
    improvements: ["Always confirm criteria first", "Know ARV and comps", "Never pitch blind"],
    criteriaScores: buildCriteria(
      DISPO_CALL_CRITERIA,
      0.51,
      ["No criteria confirm", "Poor presentation", "No urgency", "Failed objection handling", "No commitment", "No follow-up"]
    ),
  },
  {
    weight: 5,
    overallGrade: "F",
    overallScore: 35,
    summary: "Critical failure: did not confirm buyer criteria. Could not answer basic property questions.",
    strengths: ["None notable"],
    improvements: ["Confirm criteria before every dispo call", "Know the deal inside out", "Never pitch without qualification"],
    criteriaScores: buildCriteria(
      DISPO_CALL_CRITERIA,
      0.35,
      ["No criteria", "Could not present", "No urgency", "Could not answer", "No close", "No follow-up"]
    ),
  },
];

const FOLLOW_UP_GRADES: GradeVariant[] = [
  {
    weight: 10,
    overallGrade: "A",
    overallScore: 90,
    summary: "Excellent follow-up. Referenced prior conversations, re-qualified, reinforced value, and advanced to walkthrough.",
    strengths: ["Strong context and personalization", "Updated qualification on daughter discussion", "Value reinforcement on as-is", "Advanced to appointment"],
    improvements: ["Could ask about competing offers"],
    criteriaScores: buildCriteria(
      FOLLOW_UP_CRITERIA,
      0.9,
      ["Referenced last week and family situation", "Confirmed increased motivation", "Reinforced no-repair value", "Addressed HVAC concern", "Set Thursday walkthrough", "Professional throughout"]
    ),
  },
  {
    weight: 12,
    overallGrade: "B+",
    overallScore: 84,
    summary: "Solid follow-up with good context recall. Advanced deal.",
    strengths: ["Good personalization", "Checked for changes", "Set next step"],
    improvements: ["Stronger value reinforcement", "Trial close earlier"],
    criteriaScores: buildCriteria(
      FOLLOW_UP_CRITERIA,
      0.84,
      ["Context recalled", "Situation updated", "Value mentioned", "Objections addressed", "Appointment set", "Professional"]
    ),
  },
  {
    weight: 13,
    overallGrade: "B",
    overallScore: 77,
    summary: "Good follow-up. Re-engaged but could advance more.",
    strengths: ["Referenced prior call", "Asked about changes"],
    improvements: ["Push for concrete next step", "Address objections more directly"],
    criteriaScores: buildCriteria(
      FOLLOW_UP_CRITERIA,
      0.77,
      ["Some context", "Partial update", "Limited value", "Basic objection handling", "Callback only", "Decent tone"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C+",
    overallScore: 70,
    summary: "Average follow-up. Sounded generic. Did not advance deal.",
    strengths: ["Friendly", "Made contact"],
    improvements: ["Reference specific prior details", "Show you remember them", "Push for advancement"],
    criteriaScores: buildCriteria(
      FOLLOW_UP_CRITERIA,
      0.7,
      ["Generic context", "Surface update", "Weak value", "Objections not addressed", "No advancement", "Okay tone"]
    ),
  },
  {
    weight: 20,
    overallGrade: "C",
    overallScore: 63,
    summary: "Below average. Sounded like reading from script. No personalization.",
    strengths: ["Maintained professionalism"],
    improvements: ["Personalize every follow-up", "Reference prior conversation", "Never sound scripted"],
    criteriaScores: buildCriteria(
      FOLLOW_UP_CRITERIA,
      0.63,
      ["No context", "No update", "No value", "Poor objection handling", "No advancement", "Scripted tone"]
    ),
  },
  {
    weight: 20,
    overallGrade: "D",
    overallScore: 50,
    summary: "No reference to why calling back. Sounded like cold outreach.",
    strengths: ["Attempted call"],
    improvements: ["Always reference prior contact", "Explain why you are calling", "Never sound generic"],
    criteriaScores: buildCriteria(
      FOLLOW_UP_CRITERIA,
      0.5,
      ["No context", "No update", "No value", "No objection handling", "No advancement", "Generic script"]
    ),
  },
  {
    weight: 5,
    overallGrade: "F",
    overallScore: 33,
    summary: "Critical failure: no reference to prior conversation. Sounded like generic script.",
    strengths: ["None notable"],
    improvements: ["Reference prior conversations", "Never read from generic script", "Show you remember the seller"],
    criteriaScores: buildCriteria(
      FOLLOW_UP_CRITERIA,
      0.33,
      ["No context", "No update", "No value", "No objection handling", "No advancement", "Unprofessional"]
    ),
  },
];

const CALL_TYPE_MAP: Record<string, GradeVariant[]> = {
  cold_call: COLD_CALL_GRADES,
  warm_call: WARM_CALL_GRADES,
  offer_call: OFFER_CALL_GRADES,
  inbound: INBOUND_GRADES,
  dispo_call: DISPO_CALL_GRADES,
  follow_up: FOLLOW_UP_GRADES,
};

function weightedRandom<T extends { weight: number }>(variants: T[]): T {
  const total = variants.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const v of variants) {
    r -= v.weight;
    if (r <= 0) return v;
  }
  return variants[variants.length - 1];
}

export function getRandomGrade(callType: string): DemoGrade {
  const variants = CALL_TYPE_MAP[callType] ?? CALL_TYPE_MAP.cold_call;
  const selected = weightedRandom(variants);
  const { weight, ...grade } = selected;
  return grade;
}
