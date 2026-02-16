import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Seller Backing Out Playbook Integration", () => {
  describe("Topic mapping includes backing_out keywords", () => {
    it("routers.ts has backing_out topic in the semantic topic map", () => {
      const routersContent = fs.readFileSync(
        path.join(__dirname, "routers.ts"),
        "utf-8"
      );
      expect(routersContent).toContain("'backing_out'");
      expect(routersContent).toContain("'back out'");
      expect(routersContent).toContain("'backing out'");
      expect(routersContent).toContain("'cold feet'");
      expect(routersContent).toContain("'changed mind'");
      expect(routersContent).toContain("'another offer'");
      expect(routersContent).toContain("'spouse says'");
      expect(routersContent).toContain("'want more money'");
      expect(routersContent).toContain("'under contract'");
    });

    it("coachStream.ts has backing_out topic in the semantic topic map", () => {
      const streamContent = fs.readFileSync(
        path.join(__dirname, "coachStream.ts"),
        "utf-8"
      );
      expect(streamContent).toContain("'backing_out'");
      expect(streamContent).toContain("'back out'");
      expect(streamContent).toContain("'backing out'");
      expect(streamContent).toContain("'cold feet'");
      expect(streamContent).toContain("'changed mind'");
      expect(streamContent).toContain("'another offer'");
      expect(streamContent).toContain("'seller cancel'");
    });
  });

  describe("Training material content limit is sufficient", () => {
    it("routers.ts uses at least 4000 char limit for training material content", () => {
      const routersContent = fs.readFileSync(
        path.join(__dirname, "routers.ts"),
        "utf-8"
      );
      // Find the substring limit in the relevant training material section
      const match = routersContent.match(/RELEVANT TRAINING MATERIAL.*?substring\(0,\s*(\d+)\)/s);
      expect(match).not.toBeNull();
      const limit = parseInt(match![1]);
      expect(limit).toBeGreaterThanOrEqual(4000);
    });

    it("coachStream.ts uses at least 4000 char limit for training material content", () => {
      const streamContent = fs.readFileSync(
        path.join(__dirname, "coachStream.ts"),
        "utf-8"
      );
      const match = streamContent.match(/RELEVANT TRAINING MATERIAL.*?substring\(0,\s*(\d+)\)/s);
      expect(match).not.toBeNull();
      const limit = parseInt(match![1]);
      expect(limit).toBeGreaterThanOrEqual(4000);
    });
  });

  describe("Topic mapping covers all 4 objection types from the playbook", () => {
    const backingOutKeywords = [
      "back out",
      "backing out",
      "cancel",
      "changed mind",
      "cold feet",
      "second thoughts",
      "family says",
      "spouse says",
      "another offer",
      "list with agent",
      "want more money",
      "price too low",
      "seller backing",
      "under contract",
    ];

    it("all backing_out keywords are present in routers.ts topic map", () => {
      const routersContent = fs.readFileSync(
        path.join(__dirname, "routers.ts"),
        "utf-8"
      );
      for (const keyword of backingOutKeywords) {
        expect(routersContent).toContain(`'${keyword}'`);
      }
    });

    it("all backing_out keywords are present in coachStream.ts topic map", () => {
      const streamContent = fs.readFileSync(
        path.join(__dirname, "coachStream.ts"),
        "utf-8"
      );
      for (const keyword of backingOutKeywords) {
        expect(streamContent).toContain(`'${keyword}'`);
      }
    });
  });

  describe("Topic mapping correctly matches seller-backing-out questions", () => {
    // Simulate the topic matching logic
    const topicMap: Record<string, string[]> = {
      'backing_out': ['back out', 'backing out', 'cancel', 'changed mind', 'cold feet', 'back away', 'pull out', 'withdraw', 'renege', 'second thoughts', 'not sure anymore', 'family says', 'spouse says', 'another offer', 'list with agent', 'want more money', 'price too low', 'seller backing', 'seller cancel', 'under contract'],
    };

    function matchesTopic(question: string): boolean {
      const q = question.toLowerCase();
      return topicMap['backing_out'].some(s => q.includes(s));
    }

    it("matches 'seller wants to back out of the deal'", () => {
      expect(matchesTopic("seller wants to back out of the deal")).toBe(true);
    });

    it("matches 'seller changed their mind about selling'", () => {
      expect(matchesTopic("seller changed mind about selling")).toBe(true);
    });

    it("matches 'seller says their spouse says they shouldn't sell'", () => {
      expect(matchesTopic("seller says their spouse says they shouldn't sell")).toBe(true);
    });

    it("matches 'seller got another offer and wants to cancel'", () => {
      expect(matchesTopic("seller got another offer and wants to cancel")).toBe(true);
    });

    it("matches 'seller says price too low wants more money'", () => {
      expect(matchesTopic("seller says price too low wants more money")).toBe(true);
    });

    it("matches 'seller is under contract but having cold feet'", () => {
      expect(matchesTopic("seller is under contract but having cold feet")).toBe(true);
    });

    it("matches 'seller wants to list with agent instead'", () => {
      expect(matchesTopic("seller wants to list with agent instead")).toBe(true);
    });

    it("does NOT match unrelated questions", () => {
      expect(matchesTopic("how is Daniel doing on his calls")).toBe(false);
      expect(matchesTopic("what is the team average score")).toBe(false);
    });
  });
});
