import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock the DB module
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// Mock the schema
vi.mock("../drizzle/schema", () => ({
  userInstructions: {
    id: "id",
    userId: "userId",
    instruction: "instruction",
    category: "category",
    isActive: "isActive",
    updatedAt: "updatedAt",
    createdAt: "createdAt",
  },
}));

import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";

const mockedLLM = vi.mocked(invokeLLM);
const mockedGetDb = vi.mocked(getDb);

describe("userInstructions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectInstruction", () => {
    it("should detect a pipeline preference instruction", async () => {
      mockedLLM.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              isInstruction: true,
              instruction: "Always use Sales Process pipeline",
              category: "pipeline",
              confirmation: "Got it — I'll default to the Sales Process pipeline for all stage moves unless you specify otherwise.",
            }),
          },
        }],
      } as any);

      const { detectInstruction } = await import("./userInstructions");
      const result = await detectInstruction("for me always use sale process pipeline unless I tell you differently");

      expect(result).not.toBeNull();
      expect(result!.isInstruction).toBe(true);
      expect(result!.category).toBe("pipeline");
      expect(result!.instruction).toContain("Sales Process");
      expect(result!.confirmation).toBeTruthy();
    });

    it("should detect a tone preference instruction", async () => {
      mockedLLM.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              isInstruction: true,
              instruction: "Use professional tone in all responses",
              category: "tone",
              confirmation: "Got it — I'll use a professional tone going forward.",
            }),
          },
        }],
      } as any);

      const { detectInstruction } = await import("./userInstructions");
      const result = await detectInstruction("use a professional tone when talking to me");

      expect(result).not.toBeNull();
      expect(result!.isInstruction).toBe(true);
      expect(result!.category).toBe("tone");
    });

    it("should detect a format preference instruction", async () => {
      mockedLLM.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              isInstruction: true,
              instruction: "Always reply in bullet points",
              category: "format",
              confirmation: "Got it — I'll use bullet points in my responses.",
            }),
          },
        }],
      } as any);

      const { detectInstruction } = await import("./userInstructions");
      const result = await detectInstruction("always reply to me in bullet points");

      expect(result).not.toBeNull();
      expect(result!.isInstruction).toBe(true);
      expect(result!.category).toBe("format");
    });

    it("should NOT detect a CRM action as an instruction", async () => {
      mockedLLM.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              isInstruction: false,
              instruction: "",
              category: "",
              confirmation: "",
            }),
          },
        }],
      } as any);

      const { detectInstruction } = await import("./userInstructions");
      const result = await detectInstruction("move suzanne burgess to made offer");

      expect(result).toBeNull();
    });

    it("should NOT detect a coaching question as an instruction", async () => {
      mockedLLM.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              isInstruction: false,
              instruction: "",
              category: "",
              confirmation: "",
            }),
          },
        }],
      } as any);

      const { detectInstruction } = await import("./userInstructions");
      const result = await detectInstruction("how is Marcus doing this week?");

      expect(result).toBeNull();
    });

    it("should handle LLM returning non-string content", async () => {
      mockedLLM.mockResolvedValue({
        choices: [{
          message: {
            content: null,
          },
        }],
      } as any);

      const { detectInstruction } = await import("./userInstructions");
      const result = await detectInstruction("always use bullet points");

      expect(result).toBeNull();
    });
  });

  describe("buildInstructionContext", () => {
    it("should return empty string when no instructions exist", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      mockedGetDb.mockResolvedValue(mockDb as any);

      const { buildInstructionContext } = await import("./userInstructions");
      const result = await buildInstructionContext(123);

      expect(result).toBe("");
    });

    it("should build context from active instructions", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { id: 1, instruction: "Always use Sales Process pipeline", category: "pipeline", isActive: "true" },
          { id: 2, instruction: "Use bullet points in responses", category: "format", isActive: "true" },
        ]),
      };
      mockedGetDb.mockResolvedValue(mockDb as any);

      const { buildInstructionContext } = await import("./userInstructions");
      const result = await buildInstructionContext(123);

      expect(result).toContain("USER'S PERSONAL INSTRUCTIONS");
      expect(result).toContain("Always use Sales Process pipeline");
      expect(result).toContain("Use bullet points in responses");
    });

    it("should return empty string when db is not available", async () => {
      mockedGetDb.mockResolvedValue(null as any);

      const { buildInstructionContext } = await import("./userInstructions");
      const result = await buildInstructionContext(123);

      expect(result).toBe("");
    });
  });

  describe("getDefaultPipeline", () => {
    it("should extract pipeline name from instruction", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { id: 1, instruction: "Always use Sales Process pipeline", category: "pipeline", isActive: "true" },
        ]),
      };
      mockedGetDb.mockResolvedValue(mockDb as any);

      const { getDefaultPipeline } = await import("./userInstructions");
      const result = await getDefaultPipeline(123);

      expect(result).toBe("Sales Process");
    });

    it("should return null when no pipeline preference exists", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { id: 1, instruction: "Use bullet points", category: "format", isActive: "true" },
        ]),
      };
      mockedGetDb.mockResolvedValue(mockDb as any);

      const { getDefaultPipeline } = await import("./userInstructions");
      const result = await getDefaultPipeline(123);

      expect(result).toBeNull();
    });

    it("should handle 'default to' phrasing", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { id: 1, instruction: "Default to Acquisition pipeline", category: "pipeline", isActive: "true" },
        ]),
      };
      mockedGetDb.mockResolvedValue(mockDb as any);

      const { getDefaultPipeline } = await import("./userInstructions");
      const result = await getDefaultPipeline(123);

      expect(result).toBe("Acquisition");
    });
  });
});
