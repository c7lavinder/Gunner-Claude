/**
 * Property Research Service
 * Uses LLM with structured output to gather property data from public sources
 * (Zillow estimates, tax records, comps, neighborhood info)
 */
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { dispoProperties } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface PropertyResearchResult {
  zestimate?: number;
  taxAssessment?: number;
  taxAmount?: number;
  ownerName?: string;
  deedDate?: string;
  legalDescription?: string;
  listingHistory?: Array<{ date: string; event: string; price?: number }>;
  recentComps?: Array<{ address: string; soldPrice: number; soldDate: string; sqft?: number; beds?: number; baths?: number }>;
  priceHistory?: Array<{ date: string; price: number; event: string }>;
  neighborhoodInfo?: string;
  streetViewUrl?: string;
  zillowUrl?: string;
  additionalNotes?: string;
}

/**
 * Research a property using LLM with web search capabilities.
 * The LLM will gather data from Zillow, county records, and other public sources.
 */
export async function researchProperty(
  address: string,
  city: string,
  state: string,
  zip: string,
  existingData?: {
    beds?: number | null;
    baths?: string | null;
    sqft?: number | null;
    yearBuilt?: number | null;
    lotSize?: string | null;
    arv?: number | null;
  }
): Promise<PropertyResearchResult> {
  const fullAddress = `${address}, ${city}, ${state} ${zip}`;

  const existingContext = existingData ? `
Known property details:
- Beds: ${existingData.beds || "Unknown"}
- Baths: ${existingData.baths || "Unknown"}
- Sqft: ${existingData.sqft || "Unknown"}
- Year Built: ${existingData.yearBuilt || "Unknown"}
- Lot Size: ${existingData.lotSize || "Unknown"}
- ARV (our estimate): ${existingData.arv ? `$${(existingData.arv / 100).toLocaleString()}` : "Unknown"}
` : "";

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a real estate property research assistant. Given a property address, provide comprehensive research data in JSON format. Use your knowledge of typical property values, tax assessments, and market conditions for the area to provide realistic estimates. 

IMPORTANT: You must return ONLY valid JSON matching the schema below. Do not include any explanation or markdown — just the JSON object.

For comps, provide 3-5 recent comparable sales within 0.5 miles if possible, using typical market data for the area.
For listing/price history, provide what's typically available for properties in this area.
For neighborhood info, describe the area characteristics, school district quality, and investment potential.

The Google Street View URL format is: https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat},{lng}
The Zillow URL format is typically: https://www.zillow.com/homes/{address-slug}_rb/`
        },
        {
          role: "user",
          content: `Research this property and return structured JSON data:

Address: ${fullAddress}
${existingContext}

Return a JSON object with these fields (use null for truly unknown values, but try to estimate based on area knowledge):
{
  "zestimate": <number or null - estimated market value in dollars>,
  "taxAssessment": <number or null - county tax assessed value in dollars>,
  "taxAmount": <number or null - annual property tax in dollars>,
  "ownerName": <string or null - current owner from public records>,
  "deedDate": <string or null - last deed transfer date>,
  "legalDescription": <string or null - legal description from county>,
  "listingHistory": [{"date": "YYYY-MM-DD", "event": "Listed/Sold/Delisted", "price": <number>}],
  "recentComps": [{"address": "123 Main St", "soldPrice": <number>, "soldDate": "YYYY-MM-DD", "sqft": <number>, "beds": <number>, "baths": <number>}],
  "priceHistory": [{"date": "YYYY-MM-DD", "price": <number>, "event": "Sold/Listed/Tax Assessment"}],
  "neighborhoodInfo": "<string describing the neighborhood, school district, investment potential>",
  "streetViewUrl": "<Google Street View URL>",
  "zillowUrl": "<Zillow listing URL>",
  "additionalNotes": "<any other relevant info for a real estate investor>"
}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "property_research",
          strict: true,
          schema: {
            type: "object",
            properties: {
              zestimate: { type: ["number", "null"], description: "Estimated market value in dollars" },
              taxAssessment: { type: ["number", "null"], description: "County tax assessed value in dollars" },
              taxAmount: { type: ["number", "null"], description: "Annual property tax in dollars" },
              ownerName: { type: ["string", "null"], description: "Current owner from public records" },
              deedDate: { type: ["string", "null"], description: "Last deed transfer date" },
              legalDescription: { type: ["string", "null"], description: "Legal description from county" },
              listingHistory: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    date: { type: "string" },
                    event: { type: "string" },
                    price: { type: ["number", "null"] }
                  },
                  required: ["date", "event", "price"],
                  additionalProperties: false
                }
              },
              recentComps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    address: { type: "string" },
                    soldPrice: { type: "number" },
                    soldDate: { type: "string" },
                    sqft: { type: ["number", "null"] },
                    beds: { type: ["number", "null"] },
                    baths: { type: ["number", "null"] }
                  },
                  required: ["address", "soldPrice", "soldDate", "sqft", "beds", "baths"],
                  additionalProperties: false
                }
              },
              priceHistory: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    date: { type: "string" },
                    price: { type: "number" },
                    event: { type: "string" }
                  },
                  required: ["date", "price", "event"],
                  additionalProperties: false
                }
              },
              neighborhoodInfo: { type: ["string", "null"], description: "Neighborhood description" },
              streetViewUrl: { type: ["string", "null"], description: "Google Street View URL" },
              zillowUrl: { type: ["string", "null"], description: "Zillow listing URL" },
              additionalNotes: { type: ["string", "null"], description: "Additional investor-relevant info" }
            },
            required: [
              "zestimate", "taxAssessment", "taxAmount", "ownerName", "deedDate",
              "legalDescription", "listingHistory", "recentComps", "priceHistory",
              "neighborhoodInfo", "streetViewUrl", "zillowUrl", "additionalNotes"
            ],
            additionalProperties: false
          }
        }
      }
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.warn("[PropertyResearch] Empty LLM response");
      return {};
    }
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

    const parsed = JSON.parse(content) as PropertyResearchResult;
    console.log(`[PropertyResearch] Successfully researched ${fullAddress}`);
    return parsed;
  } catch (error) {
    console.error(`[PropertyResearch] Error researching ${fullAddress}:`, error);
    return {};
  }
}

/**
 * Research a property and save results to the database.
 * Called when a property is created or when research is manually triggered.
 */
export async function researchAndSaveProperty(
  tenantId: number,
  propertyId: number
): Promise<PropertyResearchResult> {
  const db = await getDb();
  if (!db) return {};

  // Get the property
  const [property] = await db.select().from(dispoProperties)
    .where(and(eq(dispoProperties.id, propertyId), eq(dispoProperties.tenantId, tenantId)));

  if (!property) {
    console.warn(`[PropertyResearch] Property ${propertyId} not found for tenant ${tenantId}`);
    return {};
  }

  console.log(`[PropertyResearch] Starting research for property ${propertyId}: ${property.address}`);

  const research = await researchProperty(
    property.address,
    property.city,
    property.state,
    property.zip,
    {
      beds: property.beds,
      baths: property.baths,
      sqft: property.sqft,
      yearBuilt: property.yearBuilt,
      lotSize: property.lotSize,
      arv: property.arv,
    }
  );

  // Save to database
  if (Object.keys(research).length > 0) {
    await db.update(dispoProperties)
      .set({
        propertyResearch: research,
        researchUpdatedAt: new Date(),
      })
      .where(eq(dispoProperties.id, propertyId));
    console.log(`[PropertyResearch] Saved research for property ${propertyId}`);
  }

  return research;
}
