import { describe, it, expect } from "vitest";
import { dailyKpiEntries } from "../drizzle/schema";

describe("dailyKpiEntries schema", () => {
  it("date field maps to entryDate column in DB", () => {
    // The Drizzle schema field 'date' should map to the actual DB column 'entryDate'
    const dateColumn = dailyKpiEntries.date;
    expect(dateColumn.name).toBe("entryDate");
  });

  it("source field maps to kpi_source column in DB", () => {
    // The Drizzle schema field 'source' should map to the actual DB column 'kpi_source'
    const sourceColumn = dailyKpiEntries.source;
    expect(sourceColumn.name).toBe("kpi_source");
  });

  it("ghlReferenceId field exists in schema", () => {
    // The ghlReferenceId field should exist for linking to GHL records
    expect(dailyKpiEntries.ghlReferenceId).toBeDefined();
    expect(dailyKpiEntries.ghlReferenceId.name).toBe("ghlReferenceId");
  });

  it("has all required fields", () => {
    expect(dailyKpiEntries.id).toBeDefined();
    expect(dailyKpiEntries.tenantId).toBeDefined();
    expect(dailyKpiEntries.userId).toBeDefined();
    expect(dailyKpiEntries.date).toBeDefined();
    expect(dailyKpiEntries.kpiType).toBeDefined();
    expect(dailyKpiEntries.source).toBeDefined();
    expect(dailyKpiEntries.createdAt).toBeDefined();
  });
});
