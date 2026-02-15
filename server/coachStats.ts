/**
 * Coach Stats Engine
 * 
 * Detects stats-related questions from the AI Coach and computes
 * precise answers from the database, so the LLM can present exact
 * numbers instead of estimating from raw call data.
 */

import { getCallStats, getLeaderboardData, getTeamMembers, getTeamMemberById } from "./db";
import { getGamificationSummary, getGamificationLeaderboard } from "./gamification";

// ============ STATS QUESTION DETECTION ============

export interface StatsIntent {
  type: "call_count" | "average_score" | "grade_distribution" | "streak" | "xp_level" | 
        "badges" | "leaderboard" | "trend" | "outcome" | "comparison" | "duration";
  period: "today" | "week" | "month" | "ytd" | "all";
  targetMemberId?: number; // specific member, or undefined = self/team
  targetMemberName?: string;
}

/**
 * Detect if a question is asking for stats and extract the intent
 */
export function detectStatsIntent(
  question: string,
  teamMembers: Array<{ id: number; name: string }>,
  currentUserTeamMemberId?: number
): StatsIntent | null {
  const q = question.toLowerCase();

  // Must match at least one stats pattern
  const statsPatterns: Array<{ pattern: RegExp; type: StatsIntent["type"] }> = [
    // Duration — must come before average_score since 'average call duration' matches both
    { pattern: /(average|avg|mean) (call )?(duration|length|time)/, type: "duration" },
    { pattern: /(call )?(duration|length) (average|avg)/, type: "duration" },
    { pattern: /how long (are|were|is) (my |the |their )?(calls|conversations)/, type: "duration" },

    // Call counts
    { pattern: /how many (calls|conversations|dials)/, type: "call_count" },
    { pattern: /call (count|total|volume|number)/, type: "call_count" },
    { pattern: /number of (calls|conversations|dials)/, type: "call_count" },
    { pattern: /total (calls|conversations|dials)/, type: "call_count" },
    { pattern: /calls (did|have|has|made|taken|completed)/, type: "call_count" },

    // Average scores
    { pattern: /(average|avg|mean) (score|grade|rating)/, type: "average_score" },
    { pattern: /(score|grade|rating) (average|avg|mean)/, type: "average_score" },
    { pattern: /what('s| is) (my|the|their|his|her) (average|avg|score)/, type: "average_score" },
    { pattern: /scoring/, type: "average_score" },
    { pattern: /\b\w+'s (average|avg|score)/, type: "average_score" },

    // Grade distribution
    { pattern: /how many (a|b|c|d|f)('s| grade| calls)/, type: "grade_distribution" },
    { pattern: /grade (distribution|breakdown|split)/, type: "grade_distribution" },
    { pattern: /(a|b|c|d|f) (grade|call) (count|total)/, type: "grade_distribution" },

    // Streaks
    { pattern: /(hot |)streak/, type: "streak" },
    { pattern: /consistency/, type: "streak" },
    { pattern: /consecutive/, type: "streak" },
    { pattern: /in a row/, type: "streak" },

    // XP / Level — must come before leaderboard since 'level' and 'rank' overlap
    { pattern: /\bxp\b(?!.*used for|.*mean|.*stand for|.*work)/, type: "xp_level" },
    { pattern: /experience point/, type: "xp_level" },
    { pattern: /what (level|rank|title) (am|is|are|do)/, type: "xp_level" },
    { pattern: /(my|his|her|their|\w+'s) level/, type: "xp_level" },
    { pattern: /\blevel\b(?!.*leaderboard)(?!.*work)/, type: "xp_level" },
    { pattern: /how much xp/, type: "xp_level" },

    // Badges — only match when asking about having/earning badges, not "how do badges work"
    { pattern: /what badges (do|did|have|has)/, type: "badges" },
    { pattern: /(my|his|her|their) badge/, type: "badges" },
    { pattern: /badge(s?) (i|we|he|she|they) (have|earned|got|won)/, type: "badges" },
    { pattern: /what (has|have) \w+ earned/, type: "badges" },
    { pattern: /how many badge/, type: "badges" },

    // Leaderboard
    { pattern: /leaderboard(?!.*work|.*how)/, type: "leaderboard" },
    { pattern: /ranking/, type: "leaderboard" },
    { pattern: /who('s| is) (first|top|leading|winning|best|number one|#1)/, type: "leaderboard" },
    { pattern: /top performer/, type: "leaderboard" },
    { pattern: /where (do i|does \w+) (rank|stand|place)/, type: "leaderboard" },

    // Trends
    { pattern: /trend/, type: "trend" },
    { pattern: /improv(ing|ed|ement)/, type: "trend" },
    { pattern: /declin(ing|ed|e)/, type: "trend" },
    { pattern: /getting (better|worse)/, type: "trend" },
    { pattern: /week over week|week-over-week|wow/, type: "trend" },
    { pattern: /compared to (last|previous)/, type: "trend" },
    { pattern: /progress/, type: "trend" },

    // Outcomes
    { pattern: /appointment(s?) (set|scheduled|booked)/, type: "outcome" },
    { pattern: /how many appointment/, type: "outcome" },
    { pattern: /offer(s?) (made|sent|completed)/, type: "outcome" },
    { pattern: /conversion (rate|ratio|percentage)/, type: "outcome" },
    { pattern: /callback(s?) (scheduled|set)/, type: "outcome" },
    { pattern: /no.?show/, type: "outcome" },

    // Comparison
    { pattern: /compar(e|ing|ison)/, type: "comparison" },
    { pattern: /vs\.?|versus/, type: "comparison" },
    { pattern: /better than|worse than/, type: "comparison" },

  ];

  let matchedType: StatsIntent["type"] | null = null;
  for (const { pattern, type } of statsPatterns) {
    if (pattern.test(q)) {
      matchedType = type;
      break;
    }
  }

  if (!matchedType) return null;

  // Detect time period
  let period: StatsIntent["period"] = "week"; // default to weekly view
  if (/today|this morning|this afternoon|right now|so far today/.test(q)) {
    period = "today";
  } else if (/this week|weekly|past week|last 7 days/.test(q)) {
    period = "week";
  } else if (/this month|monthly|past month|last 30 days/.test(q)) {
    period = "month";
  } else if (/this year|year to date|ytd|annual/.test(q)) {
    period = "ytd";
  } else if (/all time|\bever\b|\boverall\b|lifetime/.test(q)) {
    period = "all";
  }

  // Detect target member
  let targetMemberId: number | undefined;
  let targetMemberName: string | undefined;

  // Check for "my"/"I" — means the current user
  if (/\b(my|i\b|i'|me\b)/.test(q) && currentUserTeamMemberId) {
    targetMemberId = currentUserTeamMemberId;
  }

  // Check for specific team member names
  for (const member of teamMembers) {
    const nameParts = member.name.toLowerCase().split(' ');
    const fullName = member.name.toLowerCase();
    // Also check possessive forms like "daniel's" or "daniel valdez's"
    const fullNamePossessive = fullName + "'s";
    const firstNamePossessive = nameParts[0] + "'s";
    if (q.includes(fullName) || q.includes(fullNamePossessive) || nameParts.some(part => part.length > 2 && (q.includes(part + " ") || q.includes(part + "'") || q.endsWith(part)))) {
      targetMemberId = member.id;
      targetMemberName = member.name;
      break;
    }
  }

  // "team" or "everyone" means no specific member
  if (/\b(team|everyone|all members|everybody)\b/.test(q)) {
    targetMemberId = undefined;
    targetMemberName = undefined;
  }

  return {
    type: matchedType,
    period,
    targetMemberId,
    targetMemberName,
  };
}

// ============ STATS COMPUTATION ============

/**
 * Compute stats based on the detected intent and return a formatted string
 * that the LLM can use to give a precise answer
 */
export async function computeStats(
  intent: StatsIntent,
  tenantId: number,
  visibleMemberIds: Set<number>,
  isAdmin: boolean,
  currentUserTeamMemberId?: number
): Promise<string> {
  // Check access: non-admins can only see their own + visible members
  if (intent.targetMemberId && !isAdmin && !visibleMemberIds.has(intent.targetMemberId)) {
    return `ACCESS RESTRICTED: You don't have permission to view this person's stats. You can only see your own stats and stats for people assigned to you.`;
  }

  try {
    switch (intent.type) {
      case "call_count":
        return await computeCallCount(intent, tenantId, isAdmin, visibleMemberIds);
      case "average_score":
        return await computeAverageScore(intent, tenantId, isAdmin, visibleMemberIds);
      case "grade_distribution":
        return await computeGradeDistribution(intent, tenantId, isAdmin, visibleMemberIds);
      case "streak":
        return await computeStreak(intent);
      case "xp_level":
        return await computeXpLevel(intent);
      case "badges":
        return await computeBadges(intent);
      case "leaderboard":
        return await computeLeaderboard(intent, tenantId);
      case "trend":
        return await computeTrend(intent, tenantId, isAdmin, visibleMemberIds);
      case "outcome":
        return await computeOutcome(intent, tenantId, isAdmin, visibleMemberIds);
      case "comparison":
        return await computeComparison(intent, tenantId, isAdmin, visibleMemberIds);
      case "duration":
        return await computeDuration(intent, tenantId, isAdmin, visibleMemberIds);
      default:
        return "";
    }
  } catch (err) {
    console.error("[CoachStats] Error computing stats:", err);
    return "";
  }
}

// --- Individual stat computers ---

async function computeCallCount(
  intent: StatsIntent, tenantId: number, isAdmin: boolean, visibleMemberIds: Set<number>
): Promise<string> {
  const stats = await getCallStats({
    dateRange: intent.period,
    viewableTeamMemberIds: isAdmin ? 'all' : Array.from(visibleMemberIds),
    tenantId,
  });

  if (intent.targetMemberId) {
    // Specific member stats
    const memberData = stats.teamMemberScores.find(m => m.memberId === intent.targetMemberId);
    const memberName = intent.targetMemberName || "This team member";
    if (memberData) {
      return `COMPUTED STATS — Call Count for ${memberName} (${formatPeriod(intent.period)}):
• Total graded calls: ${memberData.totalGraded}
• Grade breakdown: A: ${memberData.gradeDistribution.A}, B: ${memberData.gradeDistribution.B}, C: ${memberData.gradeDistribution.C}, D: ${memberData.gradeDistribution.D}, F: ${memberData.gradeDistribution.F}
Present these EXACT numbers in your response.`;
    }
    return `COMPUTED STATS: No call data found for ${memberName} in the ${formatPeriod(intent.period)} period.`;
  }

  // Team-wide stats
  return `COMPUTED STATS — Team Call Count (${formatPeriod(intent.period)}):
• Total calls: ${stats.totalCalls}
• Graded calls: ${stats.gradedCalls}
• Skipped (voicemail/no answer/etc): ${stats.skippedCalls}
• Pending grading: ${stats.pendingCalls}
• Calls today: ${stats.callsToday}
• Calls this week: ${stats.callsThisWeek}
• Graded today: ${stats.gradedToday}
Present these EXACT numbers in your response.`;
}

async function computeAverageScore(
  intent: StatsIntent, tenantId: number, isAdmin: boolean, visibleMemberIds: Set<number>
): Promise<string> {
  const stats = await getCallStats({
    dateRange: intent.period,
    viewableTeamMemberIds: isAdmin ? 'all' : Array.from(visibleMemberIds),
    tenantId,
  });

  if (intent.targetMemberId) {
    const memberData = stats.teamMemberScores.find(m => m.memberId === intent.targetMemberId);
    const memberName = intent.targetMemberName || "This team member";
    if (memberData) {
      return `COMPUTED STATS — Average Score for ${memberName} (${formatPeriod(intent.period)}):
• Average score: ${memberData.averageScore.toFixed(1)}%
• Based on ${memberData.totalGraded} graded calls
• Grade breakdown: A: ${memberData.gradeDistribution.A}, B: ${memberData.gradeDistribution.B}, C: ${memberData.gradeDistribution.C}, D: ${memberData.gradeDistribution.D}, F: ${memberData.gradeDistribution.F}
Present these EXACT numbers in your response.`;
    }
    return `COMPUTED STATS: No graded calls found for ${memberName} in the ${formatPeriod(intent.period)} period.`;
  }

  // Team average
  const memberBreakdown = stats.teamMemberScores
    .sort((a, b) => b.averageScore - a.averageScore)
    .map(m => `  - ${m.memberName}: ${m.averageScore.toFixed(1)}% (${m.totalGraded} calls)`)
    .join('\n');

  return `COMPUTED STATS — Team Average Score (${formatPeriod(intent.period)}):
• Team average: ${stats.averageScore.toFixed(1)}%
• Total graded calls: ${stats.gradedCalls}
• By member:
${memberBreakdown}
Present these EXACT numbers in your response.`;
}

async function computeGradeDistribution(
  intent: StatsIntent, tenantId: number, isAdmin: boolean, visibleMemberIds: Set<number>
): Promise<string> {
  const stats = await getCallStats({
    dateRange: intent.period,
    viewableTeamMemberIds: isAdmin ? 'all' : Array.from(visibleMemberIds),
    tenantId,
  });

  if (intent.targetMemberId) {
    const memberData = stats.teamMemberScores.find(m => m.memberId === intent.targetMemberId);
    const memberName = intent.targetMemberName || "This team member";
    if (memberData) {
      const total = memberData.totalGraded || 1;
      const d = memberData.gradeDistribution;
      return `COMPUTED STATS — Grade Distribution for ${memberName} (${formatPeriod(intent.period)}):
• A: ${d.A} (${((d.A / total) * 100).toFixed(0)}%)
• B: ${d.B} (${((d.B / total) * 100).toFixed(0)}%)
• C: ${d.C} (${((d.C / total) * 100).toFixed(0)}%)
• D: ${d.D} (${((d.D / total) * 100).toFixed(0)}%)
• F: ${d.F} (${((d.F / total) * 100).toFixed(0)}%)
• Total: ${memberData.totalGraded} graded calls
Present these EXACT numbers in your response.`;
    }
    return `COMPUTED STATS: No graded calls found for ${memberName}.`;
  }

  const total = stats.gradedCalls || 1;
  const d = stats.gradeDistribution;
  return `COMPUTED STATS — Team Grade Distribution (${formatPeriod(intent.period)}):
• A: ${d.A} (${((d.A / total) * 100).toFixed(0)}%)
• B: ${d.B} (${((d.B / total) * 100).toFixed(0)}%)
• C: ${d.C} (${((d.C / total) * 100).toFixed(0)}%)
• D: ${d.D} (${((d.D / total) * 100).toFixed(0)}%)
• F: ${d.F} (${((d.F / total) * 100).toFixed(0)}%)
• Total: ${stats.gradedCalls} graded calls
Present these EXACT numbers in your response.`;
}

async function computeStreak(intent: StatsIntent): Promise<string> {
  if (!intent.targetMemberId) {
    return `COMPUTED STATS: To check streaks, ask about a specific person (e.g., "What's my streak?" or "What's Chris's streak?").`;
  }

  const summary = await getGamificationSummary(intent.targetMemberId);
  const memberName = intent.targetMemberName || "You";

  return `COMPUTED STATS — Streaks for ${memberName}:
• Hot Streak (consecutive C+ calls): ${summary.streaks.hotStreakCurrent} current, ${summary.streaks.hotStreakBest} best ever
• Consistency Streak (consecutive days with graded calls): ${summary.streaks.consistencyStreakCurrent} current, ${summary.streaks.consistencyStreakBest} best ever
Present these EXACT numbers in your response.`;
}

async function computeXpLevel(intent: StatsIntent): Promise<string> {
  if (!intent.targetMemberId) {
    return `COMPUTED STATS: To check XP/level, ask about a specific person (e.g., "What's my level?" or "What level is Chris?").`;
  }

  const summary = await getGamificationSummary(intent.targetMemberId);
  const memberName = intent.targetMemberName || "You";

  return `COMPUTED STATS — XP & Level for ${memberName}:
• Level: ${summary.xp.level} — "${summary.xp.title}"
• Total XP: ${summary.xp.totalXp.toLocaleString()}
• Next level at: ${summary.xp.nextLevelXp.toLocaleString()} XP
• Progress to next level: ${summary.xp.progress.toFixed(0)}%
Present these EXACT numbers in your response.`;
}

async function computeBadges(intent: StatsIntent): Promise<string> {
  if (!intent.targetMemberId) {
    return `COMPUTED STATS: To check badges, ask about a specific person (e.g., "What badges do I have?" or "What badges has Chris earned?").`;
  }

  const summary = await getGamificationSummary(intent.targetMemberId);
  const memberName = intent.targetMemberName || "You";

  if (summary.badges.length === 0) {
    return `COMPUTED STATS — Badges for ${memberName}: No badges earned yet. Keep grinding!`;
  }

  const badgeList = summary.badges
    .map(b => `  - ${b.icon} ${b.name} (${b.tier}) — earned ${new Date(b.earnedAt).toLocaleDateString()}`)
    .join('\n');

  return `COMPUTED STATS — Badges for ${memberName}:
• Total badges earned: ${summary.badgeCount}
${badgeList}
Present these EXACT details in your response.`;
}

async function computeLeaderboard(intent: StatsIntent, tenantId: number): Promise<string> {
  const leaderboard = await getLeaderboardData(tenantId, intent.period);
  
  if (leaderboard.length === 0) {
    return `COMPUTED STATS: No leaderboard data available for ${formatPeriod(intent.period)}.`;
  }

  const sorted = [...leaderboard].sort((a, b) => b.averageScore - a.averageScore);
  const rankings = sorted.map((entry, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
    return `  ${medal} ${entry.teamMember.name} — ${entry.averageScore.toFixed(1)}% avg, ${entry.gradedCalls} calls, ${entry.appointmentsSet} appts`;
  }).join('\n');

  // Also get gamification leaderboard for XP
  const gamLeaderboard = await getGamificationLeaderboard(tenantId);
  const xpRankings = gamLeaderboard
    .sort((a, b) => b.totalXp - a.totalXp)
    .map((entry, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
      return `  ${medal} ${entry.name} — Level ${entry.level} "${entry.title}", ${entry.totalXp.toLocaleString()} XP, ${entry.badgeCount} badges`;
    }).join('\n');

  return `COMPUTED STATS — Leaderboard (${formatPeriod(intent.period)}):

By Score:
${rankings}

By XP:
${xpRankings}
Present these EXACT rankings in your response.`;
}

async function computeTrend(
  intent: StatsIntent, tenantId: number, isAdmin: boolean, visibleMemberIds: Set<number>
): Promise<string> {
  const stats = await getCallStats({
    dateRange: "all",
    viewableTeamMemberIds: isAdmin ? 'all' : Array.from(visibleMemberIds),
    tenantId,
  });

  if (intent.targetMemberId) {
    const memberTrend = stats.teamMemberTrends.find(t => t.memberId === intent.targetMemberId);
    const memberName = intent.targetMemberName || "This team member";
    if (memberTrend && memberTrend.weeklyScores.length >= 2) {
      const recent = memberTrend.weeklyScores.slice(-4);
      const trendLines = recent.map(w => 
        `  - Week of ${w.weekStart}: ${w.averageScore.toFixed(1)}% (${w.callCount} calls)`
      ).join('\n');
      
      const lastWeek = recent[recent.length - 1];
      const prevWeek = recent[recent.length - 2];
      const change = lastWeek.averageScore - prevWeek.averageScore;
      const direction = change > 2 ? "📈 IMPROVING" : change < -2 ? "📉 DECLINING" : "➡️ STABLE";

      return `COMPUTED STATS — Trend for ${memberName}:
• Direction: ${direction} (${change > 0 ? '+' : ''}${change.toFixed(1)}% week-over-week)
• Recent weeks:
${trendLines}
Present these EXACT numbers in your response.`;
    }
    return `COMPUTED STATS: Not enough weekly data to show a trend for ${memberName}. Need at least 2 weeks of data.`;
  }

  // Team trend
  if (stats.weeklyTrends.length >= 2) {
    const recent = stats.weeklyTrends.slice(-4);
    const trendLines = recent.map(w =>
      `  - Week of ${w.weekStart}: ${w.averageScore.toFixed(1)}% avg, ${w.gradedCalls} graded calls`
    ).join('\n');

    const lastWeek = recent[recent.length - 1];
    const prevWeek = recent[recent.length - 2];
    const change = lastWeek.averageScore - prevWeek.averageScore;
    const direction = change > 2 ? "📈 IMPROVING" : change < -2 ? "📉 DECLINING" : "➡️ STABLE";

    return `COMPUTED STATS — Team Trend:
• Direction: ${direction} (${change > 0 ? '+' : ''}${change.toFixed(1)}% week-over-week)
• Recent weeks:
${trendLines}
Present these EXACT numbers in your response.`;
  }
  return `COMPUTED STATS: Not enough weekly data to show a team trend yet.`;
}

async function computeOutcome(
  intent: StatsIntent, tenantId: number, isAdmin: boolean, visibleMemberIds: Set<number>
): Promise<string> {
  const stats = await getCallStats({
    dateRange: intent.period,
    viewableTeamMemberIds: isAdmin ? 'all' : Array.from(visibleMemberIds),
    tenantId,
  });

  const leaderboard = await getLeaderboardData(tenantId, intent.period);

  if (intent.targetMemberId) {
    const memberLb = leaderboard.find(l => l.teamMember.id === intent.targetMemberId);
    const memberName = intent.targetMemberName || "This team member";
    if (memberLb) {
      const convRate = memberLb.gradedCalls > 0 
        ? ((memberLb.appointmentsSet / memberLb.gradedCalls) * 100).toFixed(1) 
        : "0";
      return `COMPUTED STATS — Outcomes for ${memberName} (${formatPeriod(intent.period)}):
• Appointments set: ${memberLb.appointmentsSet}
• Offer calls completed: ${memberLb.offerCallsCompleted}
• Total graded calls: ${memberLb.gradedCalls}
• Appointment conversion rate: ${convRate}%
Present these EXACT numbers in your response.`;
    }
    return `COMPUTED STATS: No outcome data found for ${memberName}.`;
  }

  // Team outcomes
  const totalAppts = leaderboard.reduce((sum, l) => sum + l.appointmentsSet, 0);
  const totalOffers = leaderboard.reduce((sum, l) => sum + l.offerCallsCompleted, 0);
  const convRate = stats.gradedCalls > 0 
    ? ((totalAppts / stats.gradedCalls) * 100).toFixed(1) 
    : "0";

  const memberOutcomes = leaderboard
    .filter(l => l.appointmentsSet > 0 || l.offerCallsCompleted > 0)
    .sort((a, b) => b.appointmentsSet - a.appointmentsSet)
    .map(l => `  - ${l.teamMember.name}: ${l.appointmentsSet} appts, ${l.offerCallsCompleted} offers`)
    .join('\n');

  return `COMPUTED STATS — Team Outcomes (${formatPeriod(intent.period)}):
• Total appointments set: ${totalAppts}
• Total offer calls completed: ${totalOffers}
• Team appointment conversion rate: ${convRate}%
• By member:
${memberOutcomes || '  No outcomes recorded yet'}
Present these EXACT numbers in your response.`;
}

async function computeComparison(
  intent: StatsIntent, tenantId: number, isAdmin: boolean, visibleMemberIds: Set<number>
): Promise<string> {
  // For comparison, show all visible members side by side
  const stats = await getCallStats({
    dateRange: intent.period,
    viewableTeamMemberIds: isAdmin ? 'all' : Array.from(visibleMemberIds),
    tenantId,
  });

  const memberRows = stats.teamMemberScores
    .sort((a, b) => b.averageScore - a.averageScore)
    .map(m => `  - ${m.memberName}: ${m.averageScore.toFixed(1)}% avg, ${m.totalGraded} calls, A:${m.gradeDistribution.A} B:${m.gradeDistribution.B} C:${m.gradeDistribution.C} D:${m.gradeDistribution.D} F:${m.gradeDistribution.F}`)
    .join('\n');

  return `COMPUTED STATS — Team Comparison (${formatPeriod(intent.period)}):
${memberRows || '  No data available'}
Present these EXACT numbers in your response.`;
}

async function computeDuration(
  intent: StatsIntent, tenantId: number, isAdmin: boolean, visibleMemberIds: Set<number>
): Promise<string> {
  const stats = await getCallStats({
    dateRange: intent.period,
    viewableTeamMemberIds: isAdmin ? 'all' : Array.from(visibleMemberIds),
    tenantId,
  });

  const avgMinutes = Math.floor(stats.averageCallDuration / 60);
  const avgSeconds = Math.round(stats.averageCallDuration % 60);

  return `COMPUTED STATS — Call Duration (${formatPeriod(intent.period)}):
• Average call duration: ${avgMinutes}m ${avgSeconds}s
• Based on ${stats.totalCalls} total calls
Present these EXACT numbers in your response.`;
}

// ============ HELPERS ============

function formatPeriod(period: StatsIntent["period"]): string {
  switch (period) {
    case "today": return "Today";
    case "week": return "This Week";
    case "month": return "This Month";
    case "ytd": return "Year to Date";
    case "all": return "All Time";
    default: return period;
  }
}
