import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTeamTrainingItems, createTeamTrainingItem, deleteTeamTrainingItem, createTeamMember } from "./db";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { teamMembers, userStreaks, userXp, xpTransactions, badgeProgress, performanceMetrics } from "../drizzle/schema";
import { inArray } from "drizzle-orm";

describe("Team Training Role-Based Filtering", () => {
  let leadManagerMemberId: number;
  let acquisitionManagerMemberId: number;
  let leadGeneratorMemberId: number;
  let skillItemId: number;
  let issueItemId: number;
  let winItemId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test team members with different roles
    const leadManager = await createTeamMember({
      tenantId: 1,
      name: "Test Lead Manager",
      email: "test-lm@example.com",
      teamRole: "lead_manager",
      isActive: true,
    });
    leadManagerMemberId = leadManager!.id;

    const acquisitionManager = await createTeamMember({
      tenantId: 1,
      name: "Test Acquisition Manager",
      email: "test-am@example.com",
      teamRole: "acquisition_manager",
      isActive: true,
    });
    acquisitionManagerMemberId = acquisitionManager!.id;

    const leadGenerator = await createTeamMember({
      tenantId: 1,
      name: "Test Lead Generator",
      email: "test-lg@example.com",
      teamRole: "lead_generator",
      isActive: true,
    });
    leadGeneratorMemberId = leadGenerator!.id;

    // Create training items for each role
    const skillItem = await createTeamTrainingItem({
      tenantId: 1,
      itemType: "skill",
      title: "Lead Manager Skill",
      description: "Test skill for lead managers",
      status: "active",
      isAiGenerated: "false",
      teamMemberId: leadManagerMemberId,
      teamMemberName: "Test Lead Manager",
      teamRole: "lead_manager",
    });
    skillItemId = skillItem!.id;

    const issueItem = await createTeamTrainingItem({
      tenantId: 1,
      itemType: "issue",
      title: "Acquisition Manager Issue",
      description: "Test issue for acquisition managers",
      status: "active",
      isAiGenerated: "false",
      teamMemberId: acquisitionManagerMemberId,
      teamMemberName: "Test Acquisition Manager",
      teamRole: "acquisition_manager",
    });
    issueItemId = issueItem!.id;

    const winItem = await createTeamTrainingItem({
      tenantId: 1,
      itemType: "win",
      title: "Lead Generator Win",
      description: "Test win for lead generators",
      status: "active",
      isAiGenerated: "false",
      teamMemberId: leadGeneratorMemberId,
      teamMemberName: "Test Lead Generator",
      teamRole: "lead_generator",
    });
    winItemId = winItem!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    // Clean up test training items
    if (skillItemId) await deleteTeamTrainingItem(skillItemId);
    if (issueItemId) await deleteTeamTrainingItem(issueItemId);
    if (winItemId) await deleteTeamTrainingItem(winItemId);

    // Clean up test team members and their dependent data
    const testMemberIds = [leadManagerMemberId, acquisitionManagerMemberId, leadGeneratorMemberId].filter(Boolean);
    if (testMemberIds.length > 0 && db) {
      // Delete dependent records first
      await db.delete(userStreaks).where(inArray(userStreaks.teamMemberId, testMemberIds));
      await db.delete(userXp).where(inArray(userXp.teamMemberId, testMemberIds));
      await db.delete(xpTransactions).where(inArray(xpTransactions.teamMemberId, testMemberIds));
      await db.delete(badgeProgress).where(inArray(badgeProgress.teamMemberId, testMemberIds));
      await db.delete(performanceMetrics).where(inArray(performanceMetrics.teamMemberId, testMemberIds));
      // Delete team members
      await db.delete(teamMembers).where(inArray(teamMembers.id, testMemberIds));
      console.log(`[Test Cleanup] Deleted ${testMemberIds.length} test team members and their dependent data`);
    }
  });

  it("should filter training items by lead_manager role", async () => {
    const items = await getTeamTrainingItems({
      tenantId: 1,
      status: "active",
      teamRole: "lead_manager",
    });

    // Should only return items associated with lead managers
    const leadManagerItems = items.filter(
      (item) => item.teamMemberId === leadManagerMemberId
    );
    expect(leadManagerItems.length).toBeGreaterThan(0);

    // Should not return items from other roles
    const otherRoleItems = items.filter(
      (item) =>
        item.teamMemberId === acquisitionManagerMemberId ||
        item.teamMemberId === leadGeneratorMemberId
    );
    expect(otherRoleItems.length).toBe(0);
  });

  it("should filter training items by acquisition_manager role", async () => {
    const items = await getTeamTrainingItems({
      tenantId: 1,
      status: "active",
      teamRole: "acquisition_manager",
    });

    // Should only return items associated with acquisition managers
    const acquisitionManagerItems = items.filter(
      (item) => item.teamMemberId === acquisitionManagerMemberId
    );
    expect(acquisitionManagerItems.length).toBeGreaterThan(0);

    // Should not return items from other roles
    const otherRoleItems = items.filter(
      (item) =>
        item.teamMemberId === leadManagerMemberId ||
        item.teamMemberId === leadGeneratorMemberId
    );
    expect(otherRoleItems.length).toBe(0);
  });

  it("should filter training items by lead_generator role", async () => {
    const items = await getTeamTrainingItems({
      tenantId: 1,
      status: "active",
      teamRole: "lead_generator",
    });

    // Should only return items associated with lead generators
    const leadGeneratorItems = items.filter(
      (item) => item.teamMemberId === leadGeneratorMemberId
    );
    expect(leadGeneratorItems.length).toBeGreaterThan(0);

    // Should not return items from other roles
    const otherRoleItems = items.filter(
      (item) =>
        item.teamMemberId === leadManagerMemberId ||
        item.teamMemberId === acquisitionManagerMemberId
    );
    expect(otherRoleItems.length).toBe(0);
  });

  it("should return all items when no role filter is provided", async () => {
    const items = await getTeamTrainingItems({
      tenantId: 1,
      status: "active",
    });

    // Should return items from all roles
    const allTestItems = items.filter(
      (item) =>
        item.teamMemberId === leadManagerMemberId ||
        item.teamMemberId === acquisitionManagerMemberId ||
        item.teamMemberId === leadGeneratorMemberId
    );
    expect(allTestItems.length).toBeGreaterThanOrEqual(3);
  });

  it("should filter by both itemType and teamRole", async () => {
    const items = await getTeamTrainingItems({
      tenantId: 1,
      itemType: "skill",
      status: "active",
      teamRole: "lead_manager",
    });

    // Should only return skill items for lead managers
    const filteredItems = items.filter(
      (item) =>
        item.itemType === "skill" && item.teamMemberId === leadManagerMemberId
    );
    expect(filteredItems.length).toBeGreaterThan(0);

    // Should not return other item types or other roles
    const otherItems = items.filter(
      (item) =>
        item.itemType !== "skill" ||
        (item.teamMemberId !== leadManagerMemberId &&
          item.teamMemberId !== null)
    );
    expect(otherItems.length).toBe(0);
  });
});
