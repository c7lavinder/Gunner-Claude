import { getDb } from "./db";
import { tenants } from "../drizzle/schema";
import { generateTeamInsights, saveGeneratedInsights, clearAiGeneratedInsights } from "./insights";

/**
 * Weekly Insights Refresh
 * 
 * Runs every Monday morning at 6:00 AM CT (server time).
 * For each active tenant:
 *   1. Clears old AI-generated issues, wins, skills, and agenda items
 *   2. Generates fresh insights from the past 7 days of graded calls
 *   3. Saves the new insights (limited to 2-3 per category per team role)
 */

const MONDAY_CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour
const TARGET_HOUR_UTC = 12; // 6 AM CT = 12:00 UTC (CST is UTC-6)
const TARGET_DAY = 1; // Monday

let lastRunDate: string | null = null;

async function runWeeklyRefresh(): Promise<{ tenantsProcessed: number; errors: number }> {
  console.log("[WeeklyInsights] Starting weekly insights refresh for all tenants...");
  
  const db = await getDb();
  if (!db) {
    console.error("[WeeklyInsights] Database not available");
    return { tenantsProcessed: 0, errors: 0 };
  }

  // Get all active tenants
  const allTenants = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  
  let processed = 0;
  let errors = 0;

  for (const tenant of allTenants) {
    try {
      console.log(`[WeeklyInsights] Processing tenant ${tenant.id} (${tenant.name})...`);
      
      // Clear old AI-generated insights for this tenant
      await clearAiGeneratedInsights(tenant.id);
      
      // Generate fresh insights from past week's calls
      const insights = await generateTeamInsights(tenant.id);
      
      // Save new insights
      await saveGeneratedInsights(insights, tenant.id);
      
      const total = insights.issues.length + insights.wins.length + insights.skills.length + insights.agenda.length;
      console.log(`[WeeklyInsights] Tenant ${tenant.id}: Generated ${total} insights (${insights.issues.length} issues, ${insights.wins.length} wins, ${insights.skills.length} skills, ${insights.agenda.length} agenda)`);
      
      processed++;
    } catch (error) {
      console.error(`[WeeklyInsights] Error processing tenant ${tenant.id}:`, error);
      errors++;
    }
  }

  console.log(`[WeeklyInsights] Weekly refresh complete: ${processed} tenants processed, ${errors} errors`);
  return { tenantsProcessed: processed, errors };
}

function checkAndRunWeeklyRefresh() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sunday, 1=Monday
  const hour = now.getUTCHours();
  const dateKey = now.toISOString().split("T")[0]; // YYYY-MM-DD

  // Only run on Monday, after the target hour, and only once per day
  if (dayOfWeek === TARGET_DAY && hour >= TARGET_HOUR_UTC && lastRunDate !== dateKey) {
    lastRunDate = dateKey;
    console.log(`[WeeklyInsights] Monday detected (${dateKey}), triggering weekly refresh...`);
    runWeeklyRefresh().catch(err => {
      console.error("[WeeklyInsights] Weekly refresh failed:", err);
    });
  }
}

/**
 * Start the weekly insights refresh scheduler.
 * Checks every hour if it's Monday morning and runs the refresh once per Monday.
 */
export function startWeeklyInsightsRefresh() {
  console.log("[WeeklyInsights] Scheduler started. Will refresh insights every Monday at ~6:00 AM CT.");
  
  // Check immediately on startup (in case server restarts on a Monday)
  checkAndRunWeeklyRefresh();
  
  // Then check every hour
  setInterval(checkAndRunWeeklyRefresh, MONDAY_CHECK_INTERVAL);
}

/**
 * Manually trigger a weekly refresh for a specific tenant (for admin use)
 */
export { runWeeklyRefresh };
