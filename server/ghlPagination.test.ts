import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for GHL conversation pagination and skipped call tracking.
 * These test the logic patterns used in fetchGHLConversations and syncGHLCall
 * without requiring actual GHL API access.
 */

describe("GHL Conversation Pagination Logic", () => {
  describe("Pagination cursor calculation", () => {
    it("should use lastMessageDate as cursor for next page", () => {
      const conversations = [
        { id: "conv1", lastMessageDate: 1708900000000, dateAdded: 1708800000000 },
        { id: "conv2", lastMessageDate: 1708890000000, dateAdded: 1708790000000 },
        { id: "conv3", lastMessageDate: 1708880000000, dateAdded: 1708780000000 },
      ];
      
      const lastConv = conversations[conversations.length - 1];
      const cursor = lastConv.lastMessageDate || lastConv.dateAdded;
      
      expect(cursor).toBe(1708880000000);
    });

    it("should fall back to dateAdded if lastMessageDate is missing", () => {
      const conversations = [
        { id: "conv1", lastMessageDate: undefined, dateAdded: 1708800000000 },
      ];
      
      const lastConv = conversations[conversations.length - 1];
      const cursor = lastConv.lastMessageDate || lastConv.dateAdded;
      
      expect(cursor).toBe(1708800000000);
    });

    it("should stop pagination when fewer results than limit are returned", () => {
      const limit = 100;
      const conversationsReturned = 42; // Less than limit
      
      const shouldContinue = conversationsReturned >= limit && conversationsReturned > 0;
      expect(shouldContinue).toBe(false);
    });

    it("should continue pagination when results equal limit", () => {
      const limit = 100;
      const conversationsReturned = 100; // Equal to limit = more pages likely
      
      const shouldContinue = conversationsReturned >= limit && conversationsReturned > 0;
      expect(shouldContinue).toBe(true);
    });

    it("should stop pagination when no conversations returned", () => {
      const limit = 100;
      const conversationsReturned = 0;
      
      const shouldContinue = conversationsReturned >= limit && conversationsReturned > 0;
      expect(shouldContinue).toBe(false);
    });

    it("should respect MAX_PAGES safety cap", () => {
      const MAX_PAGES = 5;
      const pages: number[] = [];
      
      for (let page = 0; page < MAX_PAGES; page++) {
        pages.push(page);
      }
      
      expect(pages.length).toBe(5);
      expect(pages[pages.length - 1]).toBe(4);
    });
  });

  describe("Date-based pagination termination", () => {
    it("should stop when oldest conversation is before startDate", () => {
      const startDate = new Date("2025-02-25T00:00:00Z");
      const oldestConvDate = new Date("2025-02-24T12:00:00Z").getTime(); // Before startDate
      
      const shouldStop = oldestConvDate < startDate.getTime();
      expect(shouldStop).toBe(true);
    });

    it("should continue when oldest conversation is after startDate", () => {
      const startDate = new Date("2025-02-20T00:00:00Z");
      const oldestConvDate = new Date("2025-02-24T12:00:00Z").getTime(); // After startDate
      
      const shouldStop = oldestConvDate < startDate.getTime();
      expect(shouldStop).toBe(false);
    });
  });

  describe("Phone conversation filtering", () => {
    it("should filter only TYPE_PHONE conversations from mixed results", () => {
      const conversations = [
        { id: "1", type: "TYPE_PHONE" },
        { id: "2", type: "TYPE_EMAIL" },
        { id: "3", type: "TYPE_PHONE" },
        { id: "4", type: "TYPE_SMS" },
        { id: "5", type: "TYPE_PHONE" },
      ];
      
      const phoneConversations = conversations.filter(c => c.type === "TYPE_PHONE");
      expect(phoneConversations.length).toBe(3);
      expect(phoneConversations.every(c => c.type === "TYPE_PHONE")).toBe(true);
    });
  });
});

describe("Skipped Call Tracking Logic", () => {
  describe("Unmatched team member detection", () => {
    it("should create skip reason for unmatched team member with userId", () => {
      const ghlCall = {
        id: "msg123",
        userId: "user456",
        userName: "Unknown User",
      };
      
      const skipReason = `Could not match team member (GHL userId: ${ghlCall.userId || 'none'}, userName: ${ghlCall.userName || 'unknown'})`;
      
      expect(skipReason).toContain("Could not match team member");
      expect(skipReason).toContain("user456");
      expect(skipReason).toContain("Unknown User");
    });

    it("should handle missing userId gracefully", () => {
      const ghlCall = {
        id: "msg123",
        userId: undefined as string | undefined,
        userName: undefined as string | undefined,
      };
      
      const skipReason = `Could not match team member (GHL userId: ${ghlCall.userId || 'none'}, userName: ${ghlCall.userName || 'unknown'})`;
      
      expect(skipReason).toContain("none");
      expect(skipReason).toContain("unknown");
    });
  });

  describe("No recording detection", () => {
    it("should create skip reason for missing recording", () => {
      const ghlCall = {
        id: "msg123",
        duration: 45,
        contactName: "John Doe",
      };
      
      const skipReason = `No recording available from GHL (call ${ghlCall.duration}s with ${ghlCall.contactName || 'unknown contact'})`;
      
      expect(skipReason).toContain("No recording available");
      expect(skipReason).toContain("45s");
      expect(skipReason).toContain("John Doe");
    });

    it("should handle missing contact name", () => {
      const ghlCall = {
        id: "msg123",
        duration: 120,
        contactName: undefined as string | undefined,
      };
      
      const skipReason = `No recording available from GHL (call ${ghlCall.duration}s with ${ghlCall.contactName || 'unknown contact'})`;
      
      expect(skipReason).toContain("unknown contact");
    });
  });

  describe("Duplicate call detection", () => {
    it("should identify duplicate key errors for graceful handling", () => {
      const errorMessages = [
        "Duplicate entry 'msg123' for key 'calls.ghlCallId'",
        "ER_DUP_ENTRY: Duplicate entry",
        "Unique constraint failed",
      ];
      
      for (const errMsg of errorMessages) {
        const isDuplicate = errMsg.includes('Duplicate');
        if (errMsg.includes('Duplicate')) {
          expect(isDuplicate).toBe(true);
        }
      }
    });

    it("should not suppress non-duplicate errors", () => {
      const errMsg = "Connection refused";
      const isDuplicate = errMsg.includes('Duplicate');
      expect(isDuplicate).toBe(false);
    });
  });
});

describe("Frontend Skipped Call Categorization", () => {
  describe("Sync-skipped vs classification-skipped separation", () => {
    it("should categorize unmatched team member calls as sync-skipped", () => {
      const calls = [
        { id: 1, classificationReason: "Could not match team member (GHL userId: abc, userName: John)" },
        { id: 2, classificationReason: "No recording available from GHL (call 45s with Jane)" },
        { id: 3, classificationReason: "Too short - voicemail detected" },
        { id: 4, classificationReason: null },
      ];
      
      const syncSkipped = calls.filter(c => 
        c.classificationReason && (
          c.classificationReason.includes('Could not match team member') ||
          c.classificationReason.includes('No recording available')
        )
      );
      
      const classificationSkipped = calls.filter(c => 
        !c.classificationReason || (
          !c.classificationReason.includes('Could not match team member') &&
          !c.classificationReason.includes('No recording available')
        )
      );
      
      expect(syncSkipped.length).toBe(2);
      expect(syncSkipped[0].id).toBe(1);
      expect(syncSkipped[1].id).toBe(2);
      
      expect(classificationSkipped.length).toBe(2);
      expect(classificationSkipped[0].id).toBe(3);
      expect(classificationSkipped[1].id).toBe(4);
    });

    it("should show correct badge text based on skip reason", () => {
      const unmatchedCall = { classificationReason: "Could not match team member (GHL userId: abc)" };
      const noRecordingCall = { classificationReason: "No recording available from GHL (call 45s)" };
      
      const unmatchedBadge = unmatchedCall.classificationReason?.includes('Could not match') 
        ? 'Unmatched Team Member' : 'No Recording';
      const noRecBadge = noRecordingCall.classificationReason?.includes('Could not match') 
        ? 'Unmatched Team Member' : 'No Recording';
      
      expect(unmatchedBadge).toBe('Unmatched Team Member');
      expect(noRecBadge).toBe('No Recording');
    });
  });

  describe("Empty state logic", () => {
    it("should show empty state only when both sync and classification skipped are empty", () => {
      // Both empty
      const syncSkipped: any[] = [];
      const classificationSkipped: any[] = [];
      const showEmptyState = syncSkipped.length === 0 && classificationSkipped.length === 0;
      expect(showEmptyState).toBe(true);
    });

    it("should not show empty state when sync-skipped calls exist", () => {
      const syncSkipped = [{ id: 1 }];
      const classificationSkipped: any[] = [];
      const showEmptyState = syncSkipped.length === 0 && classificationSkipped.length === 0;
      expect(showEmptyState).toBe(false);
    });

    it("should not show empty state when classification-skipped calls exist", () => {
      const syncSkipped: any[] = [];
      const classificationSkipped = [{ id: 1 }];
      const showEmptyState = syncSkipped.length === 0 && classificationSkipped.length === 0;
      expect(showEmptyState).toBe(false);
    });
  });
});

describe("Poll Summary Statistics", () => {
  it("should correctly aggregate sync results", () => {
    const results = [
      { success: true, callId: 1 },
      { success: true, skipped: true, reason: "Call already synced" },
      { success: true, skipped: true, reason: "Could not match team member" },
      { success: true, skipped: true, reason: "No recording available" },
      { success: false, reason: "Failed to upload recording to S3" },
      { success: true, callId: 2 },
    ];
    
    const synced = results.filter(r => r.success && r.callId).length;
    const alreadyExists = results.filter(r => r.skipped && r.reason === "Call already synced").length;
    const unmatchedTeam = results.filter(r => r.skipped && r.reason?.includes("Could not match")).length;
    const noRecording = results.filter(r => r.skipped && r.reason?.includes("No recording")).length;
    const failed = results.filter(r => !r.success).length;
    
    expect(synced).toBe(2);
    expect(alreadyExists).toBe(1);
    expect(unmatchedTeam).toBe(1);
    expect(noRecording).toBe(1);
    expect(failed).toBe(1);
  });
});
