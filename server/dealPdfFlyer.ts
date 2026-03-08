/**
 * Deal PDF Flyer Generator
 * 
 * Generates a branded one-page PDF flyer for a property deal.
 * Clean, professional design with property photos, financials, and details.
 * Uploads to S3 and returns the URL.
 */

import { jsPDF } from "jspdf";
import { storagePut } from "./storage";
import type { PropertyData, BrandData } from "./dealDistribution";

// ─── Color Palette ───

const COLORS = {
  // Dark premium palette matching Gunner brand
  primary: [30, 64, 175] as [number, number, number],     // Deep blue
  primaryLight: [59, 130, 246] as [number, number, number], // Lighter blue
  dark: [15, 23, 42] as [number, number, number],          // Near black
  darkGray: [30, 41, 59] as [number, number, number],      // Dark slate
  medGray: [100, 116, 139] as [number, number, number],    // Slate gray
  lightGray: [226, 232, 240] as [number, number, number],  // Light slate
  white: [255, 255, 255] as [number, number, number],
  accent: [234, 179, 8] as [number, number, number],       // Gold accent
  green: [34, 197, 94] as [number, number, number],        // Success green
  bgLight: [248, 250, 252] as [number, number, number],    // Off-white bg
};

// ─── Helper: Format cents to dollars ───

function centsToDollars(cents: number | null): string {
  if (!cents) return "N/A";
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ─── Helper: Wrap text into lines ───

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth);
}

// ─── Generate PDF Flyer ───

export async function generateDealPdfFlyer(
  property: PropertyData,
  brand: BrandData,
  tenantId: number,
): Promise<{ pdfBuffer: Buffer; pdfUrl: string; pdfFileKey: string }> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter", // 215.9 x 279.4mm
  });

  const pageW = 215.9;
  const pageH = 279.4;
  const margin = 12;
  const contentW = pageW - margin * 2;
  let y = 0;

  // ─── Header Bar ───
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageW, 32, "F");

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.white);
  doc.text(brand.companyName || "Investment Opportunity", margin, 14);

  // Tagline
  if (brand.tagline) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.lightGray);
    doc.text(brand.tagline, margin, 22);
  }

  // "DEAL SHEET" badge on right
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(pageW - margin - 40, 8, 40, 16, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.white);
  doc.text("DEAL SHEET", pageW - margin - 20, 18, { align: "center" });

  y = 38;

  // ─── Address Banner ───
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, y, pageW, 22, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.white);
  doc.text(property.address, margin, y + 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${property.city}, ${property.state} ${property.zip}`, margin, y + 18);

  // Market badge on right
  if (property.market) {
    doc.setFillColor(...COLORS.primaryLight);
    const marketText = property.market;
    const marketW = doc.getTextWidth(marketText) + 8;
    doc.roundedRect(pageW - margin - marketW, y + 5, marketW, 12, 2, 2, "F");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.white);
    doc.text(marketText, pageW - margin - marketW / 2, y + 13, { align: "center" });
  }

  y += 28;

  // ─── Key Financials Row ───
  const askingPrice = property.dispoAskingPrice || property.askingPrice;
  const financials: Array<{ label: string; value: string; highlight?: boolean }> = [];

  if (askingPrice) financials.push({ label: "ASKING PRICE", value: centsToDollars(askingPrice), highlight: true });
  if (property.arv) financials.push({ label: "ARV", value: centsToDollars(property.arv) });
  if (property.estRepairs) financials.push({ label: "EST. REPAIRS", value: centsToDollars(property.estRepairs) });
  if (askingPrice && property.arv) {
    const spread = property.arv - askingPrice;
    financials.push({ label: "SPREAD", value: centsToDollars(spread) });
  }

  if (financials.length > 0) {
    doc.setFillColor(...COLORS.bgLight);
    doc.rect(margin, y, contentW, 28, "F");
    doc.setDrawColor(...COLORS.lightGray);
    doc.rect(margin, y, contentW, 28, "S");

    const colW = contentW / financials.length;
    financials.forEach((fin, i) => {
      const cx = margin + colW * i + colW / 2;

      // Divider line between columns
      if (i > 0) {
        doc.setDrawColor(...COLORS.lightGray);
        doc.line(margin + colW * i, y + 4, margin + colW * i, y + 24);
      }

      // Label
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.medGray);
      doc.text(fin.label, cx, y + 9, { align: "center" });

      // Value
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fin.highlight ? 16 : 14);
      doc.setTextColor(...(fin.highlight ? COLORS.primary : COLORS.dark));
      doc.text(fin.value, cx, y + 21, { align: "center" });
    });

    y += 34;
  }

  // ─── Two Column Layout: Details + Additional Financials ───
  const leftColX = margin;
  const leftColW = contentW * 0.55;
  const rightColX = margin + leftColW + 6;
  const rightColW = contentW * 0.45 - 6;

  // Left Column: Property Details
  doc.setFillColor(...COLORS.dark);
  doc.roundedRect(leftColX, y, leftColW, 8, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.white);
  doc.text("PROPERTY DETAILS", leftColX + 4, y + 5.5);

  let leftY = y + 14;

  const detailRows: Array<{ label: string; value: string }> = [];
  if (property.propertyType) detailRows.push({ label: "Type", value: property.propertyType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) });
  if (property.beds) detailRows.push({ label: "Bedrooms", value: String(property.beds) });
  if (property.baths) detailRows.push({ label: "Bathrooms", value: String(property.baths) });
  if (property.sqft) detailRows.push({ label: "Sq Ft", value: property.sqft.toLocaleString() });
  if (property.yearBuilt) detailRows.push({ label: "Year Built", value: String(property.yearBuilt) });
  if (property.lotSize) detailRows.push({ label: "Lot Size", value: property.lotSize });
  if (property.occupancyStatus) detailRows.push({ label: "Occupancy", value: property.occupancyStatus.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) });
  if (property.projectType) detailRows.push({ label: "Project Type", value: property.projectType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) });

  detailRows.forEach((row, i) => {
    const rowY = leftY + i * 8;
    // Alternating row bg
    if (i % 2 === 0) {
      doc.setFillColor(...COLORS.bgLight);
      doc.rect(leftColX, rowY - 2, leftColW, 8, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.medGray);
    doc.text(row.label, leftColX + 4, rowY + 3);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.dark);
    doc.text(row.value, leftColX + leftColW - 4, rowY + 3, { align: "right" });
  });

  // Right Column: Investment Analysis
  doc.setFillColor(...COLORS.dark);
  doc.roundedRect(rightColX, y, rightColW, 8, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.white);
  doc.text("INVESTMENT ANALYSIS", rightColX + 4, y + 5.5);

  let rightY = y + 14;

  const investRows: Array<{ label: string; value: string; color?: [number, number, number] }> = [];
  if (property.contractPrice) investRows.push({ label: "Contract Price", value: centsToDollars(property.contractPrice) });
  if (askingPrice) investRows.push({ label: "Asking Price", value: centsToDollars(askingPrice), color: COLORS.primary });
  if (property.arv) investRows.push({ label: "ARV", value: centsToDollars(property.arv) });
  if (property.estRepairs) investRows.push({ label: "Est. Repairs", value: centsToDollars(property.estRepairs) });
  if (property.assignmentFee) investRows.push({ label: "Assignment Fee", value: centsToDollars(property.assignmentFee), color: COLORS.green });
  if (askingPrice && property.arv) {
    const spread = property.arv - askingPrice;
    const spreadPct = ((spread / property.arv) * 100).toFixed(0);
    investRows.push({ label: "Spread", value: `${centsToDollars(spread)} (${spreadPct}%)`, color: COLORS.green });
  }
  if (askingPrice && property.arv && property.estRepairs) {
    // Calculate potential ROI: (ARV - asking - repairs) / asking * 100
    const profit = property.arv - askingPrice - property.estRepairs;
    const roi = ((profit / askingPrice) * 100).toFixed(0);
    investRows.push({ label: "Potential ROI", value: `${roi}%`, color: profit > 0 ? COLORS.green : COLORS.medGray });
  }

  investRows.forEach((row, i) => {
    const rowY = rightY + i * 8;
    if (i % 2 === 0) {
      doc.setFillColor(...COLORS.bgLight);
      doc.rect(rightColX, rowY - 2, rightColW, 8, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.medGray);
    doc.text(row.label, rightColX + 4, rowY + 3);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(row.color || COLORS.dark));
    doc.text(row.value, rightColX + rightColW - 4, rowY + 3, { align: "right" });
  });

  const maxRows = Math.max(detailRows.length, investRows.length);
  y += 14 + maxRows * 8 + 8;

  // ─── Description Section ───
  if (property.description) {
    doc.setFillColor(...COLORS.dark);
    doc.roundedRect(margin, y, contentW, 8, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.white);
    doc.text("PROPERTY DESCRIPTION", margin + 4, y + 5.5);
    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.darkGray);
    const descLines = wrapText(doc, property.description, contentW - 8);
    const maxDescLines = Math.min(descLines.length, 6); // Cap at 6 lines
    descLines.slice(0, maxDescLines).forEach((line, i) => {
      doc.text(line, margin + 4, y + i * 5);
    });
    y += maxDescLines * 5 + 6;
  }

  // ─── Notes Section ───
  if (property.notes) {
    doc.setFillColor(...COLORS.bgLight);
    doc.roundedRect(margin, y, contentW, 8, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.text("ADDITIONAL NOTES", margin + 4, y + 5.5);
    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.darkGray);
    const noteLines = wrapText(doc, property.notes, contentW - 8);
    const maxNoteLines = Math.min(noteLines.length, 4);
    noteLines.slice(0, maxNoteLines).forEach((line, i) => {
      doc.text(line, margin + 4, y + i * 4.5);
    });
    y += maxNoteLines * 4.5 + 6;
  }

  // ─── Media Link ───
  if (property.mediaLink) {
    doc.setFillColor(...COLORS.primary);
    doc.roundedRect(margin, y, contentW, 12, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.white);
    doc.text("VIEW PHOTOS & MEDIA", margin + contentW / 2, y + 8, { align: "center" });
    // Add link
    doc.link(margin, y, contentW, 12, { url: property.mediaLink });
    y += 18;
  }

  // ─── Footer ───
  const footerY = pageH - 16;
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, footerY, pageW, 16, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.medGray);
  doc.text(
    `${brand.companyName || ""}${brand.websiteUrl ? "  |  " + brand.websiteUrl : ""}`,
    margin,
    footerY + 7,
  );
  doc.text(
    "This deal sheet is for informational purposes only. All figures are estimates.",
    margin,
    footerY + 12,
  );

  // Date on right
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  doc.setTextColor(...COLORS.lightGray);
  doc.text(dateStr, pageW - margin, footerY + 7, { align: "right" });

  // ─── Output ───
  const pdfOutput = doc.output("arraybuffer");
  const pdfBuffer = Buffer.from(pdfOutput);

  // Upload to S3
  const sanitizedAddress = property.address.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50);
  const timestamp = Date.now();
  const fileKey = `deal-flyers/${tenantId}/${sanitizedAddress}_${timestamp}.pdf`;

  const { url, key } = await storagePut(fileKey, pdfBuffer, "application/pdf");

  return { pdfBuffer, pdfUrl: url, pdfFileKey: key };
}
