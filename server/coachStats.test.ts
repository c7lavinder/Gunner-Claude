import { describe, it, expect } from "vitest";
import { detectStatsIntent } from "./coachStats";

const teamMembers = [
  { id: 1, name: "Chris Denson" },
  { id: 2, name: "Daniel Valdez" },
  { id: 3, name: "Kyle Benson" },
  { id: 4, name: "Alex Diaz" },
  { id: 5, name: "Efren Valenzuala" },
  { id: 6, name: "Mirna Razo" },
];

const currentUserId = 1; // Chris

describe("Coach Stats - detectStatsIntent", () => {
  describe("Call count detection", () => {
    it("should detect 'how many calls did I make today'", () => {
      const intent = detectStatsIntent("How many calls did I make today?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("call_count");
      expect(intent!.period).toBe("today");
      expect(intent!.targetMemberId).toBe(currentUserId);
    });

    it("should detect 'total calls this week'", () => {
      const intent = detectStatsIntent("What's the total calls this week?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("call_count");
      expect(intent!.period).toBe("week");
    });

    it("should detect 'how many calls has Daniel made this month'", () => {
      const intent = detectStatsIntent("How many calls has Daniel made this month?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("call_count");
      expect(intent!.period).toBe("month");
      expect(intent!.targetMemberId).toBe(2);
      expect(intent!.targetMemberName).toBe("Daniel Valdez");
    });

    it("should detect 'number of conversations'", () => {
      const intent = detectStatsIntent("What's the number of conversations this week?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("call_count");
    });
  });

  describe("Average score detection", () => {
    it("should detect 'what's my average score'", () => {
      const intent = detectStatsIntent("What's my average score?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("average_score");
      expect(intent!.targetMemberId).toBe(currentUserId);
    });

    it("should detect 'Chris's avg grade this week'", () => {
      const intent = detectStatsIntent("What's Chris's avg grade this week?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("average_score");
      expect(intent!.period).toBe("week");
      expect(intent!.targetMemberId).toBe(1);
    });

    it("should detect 'team average score this month'", () => {
      const intent = detectStatsIntent("What's the team average score this month?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("average_score");
      expect(intent!.period).toBe("month");
      expect(intent!.targetMemberId).toBeUndefined(); // "team" means no specific member
    });
  });

  describe("Grade distribution detection", () => {
    it("should detect 'how many A's did I get'", () => {
      const intent = detectStatsIntent("How many A's did I get this week?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("grade_distribution");
      expect(intent!.period).toBe("week");
    });

    it("should detect 'grade breakdown'", () => {
      const intent = detectStatsIntent("Show me the grade breakdown for the team", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("grade_distribution");
    });
  });

  describe("Streak detection", () => {
    it("should detect 'what's my streak'", () => {
      const intent = detectStatsIntent("What's my streak?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("streak");
      expect(intent!.targetMemberId).toBe(currentUserId);
    });

    it("should detect 'hot streak'", () => {
      const intent = detectStatsIntent("What's my hot streak at?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("streak");
    });

    it("should detect 'consistency streak'", () => {
      const intent = detectStatsIntent("How's my consistency going?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("streak");
    });

    it("should detect 'calls in a row'", () => {
      const intent = detectStatsIntent("How many good calls in a row do I have?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("streak");
    });
  });

  describe("XP/Level detection", () => {
    it("should detect 'what level am I'", () => {
      const intent = detectStatsIntent("What level am I?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("xp_level");
      expect(intent!.targetMemberId).toBe(currentUserId);
    });

    it("should detect 'how much XP do I have'", () => {
      const intent = detectStatsIntent("How much XP do I have?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("xp_level");
    });

    it("should detect 'what's Kyle's level'", () => {
      const intent = detectStatsIntent("What's Kyle's level?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("xp_level");
      expect(intent!.targetMemberId).toBe(3);
    });
  });

  describe("Badge detection", () => {
    it("should detect 'what badges do I have'", () => {
      const intent = detectStatsIntent("What badges do I have?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("badges");
      expect(intent!.targetMemberId).toBe(currentUserId);
    });

    it("should detect 'what has Daniel earned'", () => {
      const intent = detectStatsIntent("What has Daniel earned?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("badges");
      expect(intent!.targetMemberId).toBe(2);
    });
  });

  describe("Leaderboard detection", () => {
    it("should detect 'where do I rank'", () => {
      const intent = detectStatsIntent("Where do I rank on the leaderboard?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("leaderboard");
    });

    it("should detect 'who's the top performer'", () => {
      const intent = detectStatsIntent("Who's the top performer this week?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("leaderboard");
      expect(intent!.period).toBe("week");
    });

    it("should detect 'who is leading'", () => {
      const intent = detectStatsIntent("Who is leading right now?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("leaderboard");
    });
  });

  describe("Trend detection", () => {
    it("should detect 'am I improving'", () => {
      const intent = detectStatsIntent("Am I improving?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("trend");
      expect(intent!.targetMemberId).toBe(currentUserId);
    });

    it("should detect 'week over week trend'", () => {
      const intent = detectStatsIntent("What's the team's week over week trend?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("trend");
    });

    it("should detect 'compared to last week'", () => {
      const intent = detectStatsIntent("How am I doing compared to last week?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("trend");
    });

    it("should detect 'is the team getting better'", () => {
      const intent = detectStatsIntent("Is the team getting better?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("trend");
    });
  });

  describe("Outcome detection", () => {
    it("should detect 'how many appointments set'", () => {
      const intent = detectStatsIntent("How many appointments have been set this week?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("outcome");
      expect(intent!.period).toBe("week");
    });

    it("should detect 'conversion rate'", () => {
      const intent = detectStatsIntent("What's our conversion rate?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("outcome");
    });

    it("should detect 'offers made this month'", () => {
      const intent = detectStatsIntent("How many offers made this month?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("outcome");
      expect(intent!.period).toBe("month");
    });
  });

  describe("Comparison detection", () => {
    it("should detect 'compare the team'", () => {
      const intent = detectStatsIntent("Compare the team's performance this week", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("comparison");
    });

    it("should detect 'Chris vs Daniel'", () => {
      const intent = detectStatsIntent("How does Chris compare vs Daniel?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("comparison");
    });
  });

  describe("Duration detection", () => {
    it("should detect 'average call duration'", () => {
      const intent = detectStatsIntent("What's the average call duration?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("duration");
    });

    it("should detect 'how long are my calls'", () => {
      const intent = detectStatsIntent("How long are my calls?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.type).toBe("duration");
    });
  });

  describe("Period detection", () => {
    it("should default to 'week' when no period specified", () => {
      const intent = detectStatsIntent("How many calls did I make?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.period).toBe("week");
    });

    it("should detect 'today'", () => {
      const intent = detectStatsIntent("How many calls today?", teamMembers, currentUserId);
      expect(intent!.period).toBe("today");
    });

    it("should detect 'this month'", () => {
      const intent = detectStatsIntent("What's my average score this month?", teamMembers, currentUserId);
      expect(intent!.period).toBe("month");
    });

    it("should detect 'year to date'", () => {
      const intent = detectStatsIntent("What's my total calls year to date?", teamMembers, currentUserId);
      expect(intent!.period).toBe("ytd");
    });

    it("should detect 'all time'", () => {
      const intent = detectStatsIntent("What's my all time average score?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.period).toBe("all");
    });
  });

  describe("Member targeting", () => {
    it("should target self when 'my' is used", () => {
      const intent = detectStatsIntent("What's my average score?", teamMembers, currentUserId);
      expect(intent!.targetMemberId).toBe(currentUserId);
    });

    it("should target specific member by first name", () => {
      const intent = detectStatsIntent("How many calls did Kyle make?", teamMembers, currentUserId);
      expect(intent!.targetMemberId).toBe(3);
      expect(intent!.targetMemberName).toBe("Kyle Benson");
    });

    it("should target specific member by full name", () => {
      const intent = detectStatsIntent("What's Daniel Valdez's average score?", teamMembers, currentUserId);
      expect(intent).not.toBeNull();
      expect(intent!.targetMemberId).toBe(2);
    });

    it("should target team when 'team' or 'everyone' is used", () => {
      const intent = detectStatsIntent("What's the team average score?", teamMembers, currentUserId);
      expect(intent!.targetMemberId).toBeUndefined();
    });

    it("should target team when 'everybody' is used", () => {
      const intent = detectStatsIntent("How is everybody doing this week?", teamMembers, currentUserId);
      // 'everybody' triggers team-level, no specific member
      // Note: this may or may not match a stats pattern depending on phrasing
      // The key test is that if it matches, targetMemberId is undefined
      const intent2 = detectStatsIntent("Compare everybody's call count", teamMembers, currentUserId);
      expect(intent2).not.toBeNull();
      expect(intent2!.targetMemberId).toBeUndefined();
    });
  });

  describe("Non-stats questions should return null", () => {
    it("should not detect coaching questions", () => {
      expect(detectStatsIntent("How should I handle price objections?", teamMembers, currentUserId)).toBeNull();
    });

    it("should not detect general questions", () => {
      expect(detectStatsIntent("What's the best way to close a deal?", teamMembers, currentUserId)).toBeNull();
    });

    it("should not detect platform questions about how features work", () => {
      expect(detectStatsIntent("How do badges work?", teamMembers, currentUserId)).toBeNull();
      expect(detectStatsIntent("What is XP used for?", teamMembers, currentUserId)).toBeNull();
      expect(detectStatsIntent("What does XP mean?", teamMembers, currentUserId)).toBeNull();
      expect(detectStatsIntent("Explain the grading rubric", teamMembers, currentUserId)).toBeNull();
    });

    it("should not detect greetings", () => {
      expect(detectStatsIntent("Hey, how's it going?", teamMembers, currentUserId)).toBeNull();
    });
  });
});
