import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseDocument, getSupportedFileTypes, getSupportedExtensions } from "./documentParser";

describe("documentParser", () => {
  describe("getSupportedFileTypes", () => {
    it("should return all supported MIME types", () => {
      const types = getSupportedFileTypes();
      expect(types).toContain("application/pdf");
      expect(types).toContain("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      expect(types).toContain("application/msword");
      expect(types).toContain("text/plain");
      expect(types).toContain("text/markdown");
    });
  });

  describe("getSupportedExtensions", () => {
    it("should return all supported file extensions", () => {
      const extensions = getSupportedExtensions();
      expect(extensions).toContain(".pdf");
      expect(extensions).toContain(".docx");
      expect(extensions).toContain(".doc");
      expect(extensions).toContain(".txt");
      expect(extensions).toContain(".md");
    });
  });

  describe("parseDocument", () => {
    it("should parse plain text files", async () => {
      const textContent = "Hello, this is a test document.\nIt has multiple lines.";
      const buffer = Buffer.from(textContent, "utf-8");
      
      const result = await parseDocument(buffer, "text/plain", "test.txt");
      expect(result).toBe(textContent);
    });

    it("should parse markdown files", async () => {
      const mdContent = "# Title\n\nThis is **bold** text.";
      const buffer = Buffer.from(mdContent, "utf-8");
      
      const result = await parseDocument(buffer, "text/markdown", "test.md");
      expect(result).toBe(mdContent);
    });

    it("should trim whitespace from text files", async () => {
      const textContent = "  \n  Hello World  \n  ";
      const buffer = Buffer.from(textContent, "utf-8");
      
      const result = await parseDocument(buffer, "text/plain", "test.txt");
      expect(result).toBe("Hello World");
    });

    it("should detect file type from extension when MIME type is generic", async () => {
      const textContent = "Test content";
      const buffer = Buffer.from(textContent, "utf-8");
      
      // Using a generic MIME type but with .txt extension
      const result = await parseDocument(buffer, "application/octet-stream", "document.txt");
      expect(result).toBe(textContent);
    });

    it("should throw error for unsupported file types", async () => {
      const buffer = Buffer.from("test", "utf-8");
      
      await expect(parseDocument(buffer, "application/unknown", "test.xyz"))
        .rejects.toThrow("Unsupported file type");
    });

    // Note: PDF and DOCX parsing tests would require actual binary files
    // or mocking the pdf-parse and mammoth libraries
    describe("PDF parsing", () => {
      it("should identify PDF files by MIME type", async () => {
        // This test verifies the type detection logic
        // Actual PDF parsing would require a real PDF file
        const buffer = Buffer.from("not a real pdf", "utf-8");
        
        // This should attempt to parse as PDF and fail gracefully
        await expect(parseDocument(buffer, "application/pdf", "test.pdf"))
          .rejects.toThrow();
      });
    });

    describe("DOCX parsing", () => {
      it("should identify DOCX files by MIME type", async () => {
        // This test verifies the type detection logic
        // Actual DOCX parsing would require a real DOCX file
        const buffer = Buffer.from("not a real docx", "utf-8");
        
        // This should attempt to parse as DOCX and fail gracefully
        await expect(parseDocument(buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "test.docx"))
          .rejects.toThrow();
      });
    });
  });
});
