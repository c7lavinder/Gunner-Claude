import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

/**
 * Parse a PDF file and extract text content
 */
export async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParser = new PDFParse({ data: buffer });
    const textResult = await pdfParser.getText();
    
    // Get combined text from all pages
    return textResult.text.trim();
  } catch (error) {
    console.error("[DocumentParser] Error parsing PDF:", error);
    throw new Error("Failed to parse PDF file");
  }
}

/**
 * Parse a DOCX file and extract text content
 */
export async function parseDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  } catch (error) {
    console.error("[DocumentParser] Error parsing DOCX:", error);
    throw new Error("Failed to parse DOCX file");
  }
}

/**
 * Parse a document based on its MIME type
 */
export async function parseDocument(buffer: Buffer, mimeType: string, filename?: string): Promise<string> {
  // Determine file type from MIME type or filename extension
  const isPDF = mimeType === "application/pdf" || filename?.toLowerCase().endsWith(".pdf");
  const isDOCX = mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
                 filename?.toLowerCase().endsWith(".docx");
  const isDOC = mimeType === "application/msword" || filename?.toLowerCase().endsWith(".doc");
  const isText = mimeType.startsWith("text/") || filename?.toLowerCase().endsWith(".txt") || filename?.toLowerCase().endsWith(".md");

  if (isPDF) {
    return await parsePDF(buffer);
  } else if (isDOCX) {
    return await parseDOCX(buffer);
  } else if (isDOC) {
    // .doc files (old Word format) - mammoth can handle some of these
    try {
      return await parseDOCX(buffer);
    } catch {
      throw new Error("Old .doc format not fully supported. Please convert to .docx");
    }
  } else if (isText) {
    return buffer.toString("utf-8").trim();
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

/**
 * Get supported file types for upload
 */
export function getSupportedFileTypes(): string[] {
  return [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
    "text/markdown",
  ];
}

/**
 * Get supported file extensions for upload
 */
export function getSupportedExtensions(): string[] {
  return [".pdf", ".docx", ".doc", ".txt", ".md"];
}
