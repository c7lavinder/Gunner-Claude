# Real Estate API Field Inventory

Comprehensive comparison of property data fields returned by PropertyRadar, RealEstateAPI, RentCast, and BatchData APIs. This document identifies every available field across all four vendors to inform Gunner Property model expansion decisions.

---

## Part 1: Field Universe by Vendor

### PropertyRadar API
**Endpoint**: GET /v1/properties/{RadarID}  
**Documentation**: https://developers.propertyradar.com/  
**Cost**: Per-call pricing (included in subscription tiers)  
**Response Format**: 12+ predefined fieldsets + custom field selection  

**Complete Field Set**:

```
Core Identifiers:
  RadarID (string) — unique property ID
  APN (string) — Assessor's Parcel Number
  County (string)
  PropertyURL (string) — link to PropertyRadar listing

Address:
  Address (string)
  City (string)
  State (string)
  ZIP / ZipFive (string)
  Subdivision (string)
  Lot (string)

Building Characteristics:
  PType / PropertyType (string) — House, Land, Multi-Family, etc.
  AdvancedPropertyType (string) — more granular type
  Beds (integer)
  Baths (integer)
  SqFt (integer)
  YearBuilt (integer)
  LotSize (string)
  Stories (integer)
  Units (integer)
  Pool (boolean)

Valuation & Financial:
  AVM — Automated Valuation Model (decimal)
  AssessedValue (decimal)
  EstimatedValue (decimal)
  EstimatedTaxRate (decimal)
  AnnualTaxes (decimal)
  AvailableEquity (decimal)
  EquityPercent (decimal)
  TotalLoanBalance (decimal)

Ownership:
  Owner (string) — primary owner name
  Owner2 (string) — secondary owner
  OwnerFirstName (string)
  OwnerLastName (string)
  OwnerSpouseFirstName (string)
  OwnerAddress (string) — mailing address
  OwnerCity (string)
  OwnerState (string)
  OwnerZipFive (string)
  OwnerPhone (string) — skip-traced contact
  OwnerEmail (string) — skip-traced contact
  isSameMailingOrExempt (boolean)
  OwnerExempt (boolean)

Primary Contact (skip-traced):
  PrimaryFirstName (string)
  PrimaryLastName (string)
  PrimaryPhone1 (string)
  PrimaryEmail1 (string)
  PhoneAvailability (boolean)
  EmailAvailability (boolean)

Secondary Contact:
  SecondaryFirstName (string)
  SecondaryLastName (string)

Loan Details:
  NumberLoans (integer)
  FirstLenderOriginal (string)
  FirstAmount (decimal)
  FirstDate (date)
  FirstPurpose (string)
  FirstRate (decimal)
  DOTPosition (string)

Listing Status:
  isListedForSale (boolean)
  ListingPrice (decimal)
  DaysOnMarket (integer)
  ListName (string)

Transaction History:
  LastTransferValue (decimal)
  LastTransferRecDate (date)
  LastTransferSeller (string)
  LastTransferType (string)
  PreviousSaleDate (date)
  OriginalSaleDate (date)
  SaleAmount (decimal)
  SaleDateRelative (string)
  SalePlace (string)
  SaleTime (string)

Foreclosure & Distress:
  inForeclosure (boolean)
  ForeclosureRecDate (date)
  ForeclosureStage (string)
  DefaultAmount (decimal)
  DefaultAsOf (date)
  PostReason (string)
  DistressScore (numeric) — proprietary risk score

Occupancy & Vacancy:
  isSiteVacant (boolean)
  isMailVacant (boolean)

Media:
  PhotoURL1 (string)
```

**Bundled vs. Extra Cost**: All listed fields included in standard API tier. Skip-tracing (phone/email) may have incremental cost depending on subscription.

**Source**: [PropertyRadar Help Center - Zapier Integration](https://help.propertyradar.com/en/articles/3526061-data-available-for-zapier-and-webhooks-integrations)

---

### RealEstateAPI.com
**Endpoint**: GET /property-detail (with address or APN)  
**Documentation**: https://developer.realestateapi.com/reference/property-detail-api-1  
**Cost**: Per-call; comps endpoint may have additional cost  
**Response Format**: JSON; 200+ fields available  

**Complete Field Set** (based on documentation):

```
Address & Location:
  address (string)
  street (string)
  house_number (string)
  unit (string)
  city (string)
  state (string)
  zip (string)
  county (string)
  apn (string) — Assessor's Parcel Number
  fips (string) — FIPS code
  latitude (decimal)
  longitude (decimal)

Property Identification:
  property_id (string) — internal ID
  land_use_code (string)
  land_use_type (string)
  zoning (string)
  zoning_description (string)
  legal_description (string)
  subdivision_name (string)

Physical Characteristics:
  bedrooms (integer)
  bathrooms (integer)
  rooms (integer)
  square_feet (integer)
  lot_size (integer)
  lot_size_unit (string)
  year_built (integer)
  property_type (string)
  structure_style (string)
  number_of_stories (integer)
  roof_cover (string)
  roof_frame (string)
  foundation (string)
  basement (boolean)
  basement_area_finished (integer)
  basement_area_unfinished (integer)
  garage (boolean)
  garage_type (string)
  garage_capacity (integer)
  pool (boolean)
  pool_area (integer)
  porch (boolean)
  patio (boolean)
  deck (boolean)
  heating (string)
  cooling (string)
  water_source (string)
  water_source_description (string)
  sewer_type (string)
  sewer_description (string)
  electric_service (string)
  gas_service (boolean)

Ownership & Occupancy:
  owner_name (string)
  owner_first_name (string)
  owner_last_name (string)
  owner_mailing_address (string)
  owner_city (string)
  owner_state (string)
  owner_zip (string)
  owner_occupied (boolean)
  absentee_owner (boolean)
  occupancy_status (string)
  vacancy_flag (boolean)
  site_vacant (boolean)
  mail_vacant (boolean)

Tax Information:
  assessed_value (decimal)
  assessment_date (date)
  assessment_year (integer)
  tax_amount (decimal)
  tax_rate (decimal)
  tax_exemption (string)
  tax_exemption_description (string)

Mortgage & Liens:
  mortgage_amount (decimal)
  mortgage_date (date)
  mortgage_lender_name (string)
  mortgage_type (string) — fixed/ARM
  interest_rate (decimal)
  loan_term_months (integer)
  lien_count (integer)
  lien_amount (decimal)

MLS & Listing:
  mls_id (string)
  mls_status (string)
  list_price (decimal)
  list_date (date)
  days_on_market (integer)
  agent_name (string)
  agent_phone (string)
  list_office (string)

Sale History:
  last_sale_price (decimal)
  last_sale_date (date)
  prior_sale_prices (array) — historical
  deed_type (string)
  sale_type (string)

Comps (if requested):
  comparable_sales (array of objects):
    — address
    — sale_price
    — sale_date
    — distance_miles
    — property_type
    — beds/baths/sqft

Additional:
  county_records_updated (date)
```

**Bundled vs. Extra Cost**: Base property detail is standard; comps endpoint returns array of comparable sales (may be separate charge). Full schema has 200+ fields; not all may be populated per property.

**Source**: [RealEstateAPI Developer Portal](https://developer.realestateapi.com/reference/property-detail-api-1)

---

### RentCast API
**Endpoints**:  
1. GET /properties (Property Records)  
2. GET /avm (Automated Valuation Model)  
3. GET /rental-estimate (Rental Valuation)  
4. GET /market-data (Market Analytics)  

**Documentation**: https://developers.rentcast.io/reference/  
**Cost**: Tiered by endpoint; bundle plans available  
**Response Format**: Separate schemas per endpoint  

**Property Records Endpoint** (https://developers.rentcast.io/reference/property-records):

```
Address & Location:
  address (string)
  city (string)
  state (string)
  zipCode (string)
  county (string)
  latitude (decimal)
  longitude (decimal)
  fips (string)

Physical Characteristics:
  bedrooms (integer)
  bathrooms (integer)
  squareFootage (integer)
  lotSize (integer)
  yearBuilt (integer)
  propertyType (string)

Historical:
  lastSaleDate (date)
  lastSalePrice (decimal)
  daysOnMarket (integer)
  pricePerSquareFoot (decimal)

Additional (from Property Data Schema):
  owner_name (string)
  owner_address (string)
  assessed_value (decimal)
  parcel_number (string)
```

**AVM Endpoint** (https://developers.rentcast.io/reference/property-valuation):

```
Valuation Output:
  value (decimal) — estimated market value
  valueLow (decimal) — low estimate
  valueHigh (decimal) — high estimate
  valueRange (object):
    — min (decimal)
    — max (decimal)
  confidence_score (decimal) — 0-100

Subject Property Details:
  subjectProperty (object):
    — address
    — coordinates
    — attributes
    — beds
    — baths
    — sqft
    — yearBuilt
    — propertyType
```

**Rental Estimate Endpoint**:

```
Rental Valuation:
  rentEstimate (decimal) — monthly rental value
  rentLow (decimal)
  rentHigh (decimal)
  rentRange (object):
    — min
    — max
  confidence_score (decimal)
```

**Market Data Endpoint**:

```
Market Analytics:
  medianPrice (decimal)
  medianRent (decimal)
  averageDaysOnMarket (integer)
  pricePerSquareFoot (decimal)
  priceToRent (decimal)
  population (integer)
  area_name (string)
```

**Bundled vs. Extra Cost**: Each endpoint is separately billable. Bundle plans discount multi-endpoint access. Property Records is foundation; AVM, rental estimates, and market data are add-ons.

**Source**: [RentCast API Reference](https://developers.rentcast.io/reference/)

---

### BatchData API
**Endpoints**:  
1. POST /property/lookup/all-attributes  
2. GET /property/search (filtering)  
3. POST /owner/profile (owner enrichment)  
4. GET /skip-trace (phone/email appending)  

**Documentation**: https://developer.batchdata.com/  
**Cost**: Per-call; $0.30/property for all-attributes endpoint (bundled)  
**Response Format**: Massive JSON response; 700+ attributes  

**Property Lookup All-Attributes Response**:

```
Address:
  address
  street_address
  city
  state
  zip_code
  county
  fips_code
  latitude
  longitude
  msa
  cbsa

Property Identification:
  parcel_number
  parcel_number_alternate
  parcel_number_previous
  parcel_number_formatted

Core Property Details:
  property_type
  units
  structure_type
  construction_type
  bedrooms
  bathrooms
  rooms
  square_feet
  lot_size
  lot_size_unit
  year_built
  year_remodeled
  roof_cover
  roof_frame
  foundation
  basement
  basement_finished_percent
  stories
  fireplace
  fireplace_number
  garage
  garage_type
  garage_capacity
  pool
  pool_area
  deck
  patio
  porch
  spa
  solar
  basement_area_finished
  basement_area_unfinished

Ownership:
  owner_name
  owner_first_name
  owner_last_name
  owner_middle_name
  owner_suffix
  owner_occupied
  owner_type (individual/corporate/trust/etc)
  absentee_owner
  mailing_address
  mailing_city
  mailing_state
  mailing_zip
  same_as_property_address
  ownership_length_years

Contact Information (Skip-Trace):
  owner_phone_number
  owner_email
  owner_phone_type
  second_owner_name
  second_owner_phone
  second_owner_email

Mortgage & Lien Information:
  mortgage_amount (primary)
  mortgage_date (primary)
  mortgage_lender (primary)
  mortgage_type (primary) — fixed/ARM
  mortgage_rate (primary)
  mortgage_term (primary)
  mortgage_position (primary)
  second_mortgage_amount
  second_mortgage_date
  second_mortgage_lender
  lien_count
  lien_types (array)
  lien_amounts (array)
  judgment_count
  judgment_amounts (array)

Tax Information:
  assessed_value
  assessed_value_land
  assessed_value_building
  assessed_value_total
  assessment_year
  tax_amount
  tax_amount_year
  tax_rate
  tax_code_area
  tax_exemption
  tax_exemption_type
  tax_delinquent_flag
  tax_delinquent_year
  tax_delinquent_amount

Valuation:
  market_value (AVM estimate)
  value_range_low
  value_range_high
  price_per_square_foot
  land_value_estimate
  improvement_value_estimate
  market_value_year

Sale/Transfer History:
  last_sale_price
  last_sale_date
  last_sale_deed_type
  last_sale_document_id
  second_sale_price
  second_sale_date
  prior_sale_prices (array, 20+ year history)
  prior_sale_dates (array)
  transfer_history_count
  deed_recorded_date

Foreclosure & Distress:
  foreclosure_status
  foreclosure_stage
  notice_of_default_date
  lis_pendens_date
  lis_pendens_amount
  lis_pendens_plaintiff
  foreclosure_judgment_date
  foreclosure_judgment_amount
  bank_owned
  pre_foreclosure
  foreclosure_auction_date
  foreclosure_opening_bid

Rental Information:
  rental_estimate_monthly
  rental_estimate_annual
  rental_low
  rental_high
  rental_confidence_score
  rental_estimate_bedrooms
  rental_estimate_bathrooms

Utilities:
  water_source
  water_source_description
  sewer_type
  sewer_type_description
  electric_service
  electric_service_type
  gas_service
  gas_service_type

Zoning & Legal:
  zoning_code
  zoning_description
  land_use_code
  land_use_description
  legal_description
  legal_unit
  legal_block
  legal_lot
  subdivisioning_status
  subdivision_name
  plat_book
  plat_page

Building & Permits:
  construction_type_code
  construction_quality
  stories
  exterior_walls
  interior_walls
  ceiling_height
  floor_count
  unit_count
  permit_count (lifetime)
  recent_permits (array)
  demolition_flag
  vacant_status
  vacant_status_year

Additional Data:
  homestead_exemption
  corporate_owned
  commercial_building
  historical_property
  hazard_zone_type
  hazard_zone_description
  flood_zone
  flood_zone_level
  earthquake_zone
  wildfire_risk_zone
  school_district
  school_district_name
  elementary_school
  middle_school
  high_school
  census_block
  census_block_group
  census_tract
  congressional_district
  state_legislative_district
  county_legislative_district
  municipality_code
  neighborhood_code
  latitude_longitude_accuracy
  data_last_updated
  record_number
```

**Bundled vs. Extra Cost**: All-attributes endpoint at $0.30/property includes all 700+ fields in one call. Related endpoints (owner profile, skip-trace) available separately. No additional fees for specific fields.

**Source**: [BatchData Developer Portal](https://developer.batchdata.com/)

---

## Part 2: Unified Field Catalog

Master matrix showing which vendors return each data point. ✅ indicates the vendor returns this field.

| Category | Field | PropertyRadar | RealEstateAPI | RentCast | BatchData | Gunner Property Column? | Notes |
|----------|-------|---------------|---------------|----------|-----------|----------------------|-------|
| **Address & Location** | | | | | | | |
| | Street Address | ✅ | ✅ | ✅ | ✅ | ✅ (address) | All vendors return |
| | City | ✅ | ✅ | ✅ | ✅ | ✅ (city) | All vendors return |
| | State | ✅ | ✅ | ✅ | ✅ | ✅ (state) | All vendors return |
| | ZIP / ZIP5 | ✅ | ✅ | ✅ | ✅ | ✅ (zip) | All vendors return |
| | County | ✅ | ✅ | ✅ | ✅ | ❌ | Useful for county records |
| | Latitude | ❌ | ✅ | ✅ | ✅ | ❌ | Geo-fence targeting, routing |
| | Longitude | ❌ | ✅ | ✅ | ✅ | ❌ | Geo-fence targeting, routing |
| | FIPS Code | ❌ | ✅ | ✅ | ✅ | ❌ | Federal ID, rare direct use |
| | APN (Assessor's Parcel Number) | ✅ | ✅ | ❌ | ✅ | ❌ | Unique property ID; public record standard |
| | Subdivision | ✅ | ✅ | ❌ | ✅ | ❌ | Defines community boundaries |
| | Legal Description | ❌ | ❌ | ❌ | ✅ | ❌ | Formal deed language, rarely needed |
| **Property Specs** | | | | | | | |
| | Bedrooms | ✅ | ✅ | ✅ | ✅ | ✅ (beds) | All vendors return |
| | Bathrooms | ✅ | ✅ | ✅ | ✅ | ✅ (baths) | All vendors return |
| | Square Feet (Living) | ✅ | ✅ | ✅ | ✅ | ✅ (sqft) | All vendors return |
| | Lot Size | ✅ | ✅ | ✅ | ✅ | ✅ (lotSize) | All vendors return |
| | Year Built | ✅ | ✅ | ✅ | ✅ | ✅ (yearBuilt) | All vendors return |
| | Property Type | ✅ | ✅ | ✅ | ✅ | ✅ (propertyType) | All vendors return |
| | Stories | ✅ | ✅ | ❌ | ✅ | ❌ | Structural complexity indicator |
| | Units (Multi-Family) | ✅ | ❌ | ❌ | ✅ | ❌ | Critical for multi-unit properties |
| | Rooms | ❌ | ✅ | ❌ | ✅ | ❌ | Rooms total (not just bed/bath) |
| | Pool | ✅ | ✅ | ❌ | ✅ | ❌ | Amenity; affects value |
| | Garage / Garage Type | ❌ | ✅ | ❌ | ✅ | ❌ | Parking capacity, type (attached/detached) |
| | Garage Capacity | ❌ | ✅ | ❌ | ✅ | ❌ | Parking spaces |
| | Basement | ❌ | ✅ | ❌ | ✅ | ❌ | Basement finish % relevant |
| | Basement Finished % | ❌ | ✅ | ❌ | ✅ | ❌ | Living area vs. total |
| | Roof Type / Cover | ❌ | ✅ | ❌ | ✅ | ❌ | Repair estimate driver |
| | Roof Frame | ❌ | ✅ | ❌ | ✅ | ❌ | Structural detail |
| | Foundation Type | ❌ | ✅ | ❌ | ✅ | ❌ | Foundational issues risk |
| | Heating System | ❌ | ✅ | ❌ | ✅ | ❌ | HVAC condition/cost |
| | Cooling System | ❌ | ✅ | ❌ | ✅ | ❌ | HVAC condition/cost |
| | Exterior Walls | ❌ | ❌ | ❌ | ✅ | ❌ | Material (brick, vinyl, wood) |
| | Interior Walls | ❌ | ❌ | ❌ | ✅ | ❌ | Drywall condition hints |
| | Ceiling Height | ❌ | ❌ | ❌ | ✅ | ❌ | Livability factor |
| | Deck / Patio | ❌ | ✅ | ❌ | ✅ | ❌ | Outdoor improvements |
| | Porch | ❌ | ✅ | ❌ | ✅ | ❌ | Entry/curb appeal |
| | Solar Panels | ❌ | ❌ | ❌ | ✅ | ❌ | Energy efficiency; resale factor |
| | Fireplace | ❌ | ✅ | ❌ | ✅ | ❌ | Luxury/appeal factor |
| | Spa / Hot Tub | ❌ | ❌ | ❌ | ✅ | ❌ | Luxury amenity |
| **Ownership** | | | | | | | |
| | Owner Name (Primary) | ✅ | ✅ | ✅ | ✅ | ❌ | Critical for outreach |
| | Owner First Name | ✅ | ✅ | ❌ | ✅ | ❌ | Personalization |
| | Owner Last Name | ✅ | ✅ | ❌ | ✅ | ❌ | Personalization |
| | Owner Address (Mailing) | ✅ | ✅ | ❌ | ✅ | ❌ | Absentee detection |
| | Owner City (Mailing) | ✅ | ✅ | ❌ | ✅ | ❌ | Absentee detection |
| | Owner State (Mailing) | ✅ | ✅ | ❌ | ✅ | ❌ | Absentee detection |
| | Owner ZIP (Mailing) | ✅ | ✅ | ❌ | ✅ | ❌ | Absentee detection |
| | Same as Property Address | ✅ | ✅ | ❌ | ✅ | ❌ | Owner-occupied signal |
| | Owner Phone (Skip-Trace) | ✅ | ❌ | ❌ | ✅ | ❌ | Direct contact; critical |
| | Owner Email (Skip-Trace) | ✅ | ❌ | ❌ | ✅ | ❌ | Direct contact; critical |
| | Phone Availability Flag | ✅ | ❌ | ❌ | ❌ | ❌ | Confidence score |
| | Email Availability Flag | ✅ | ❌ | ❌ | ❌ | ❌ | Confidence score |
| | Second Owner Name | ✅ | ❌ | ❌ | ✅ | ❌ | Joint ownership |
| | Second Owner Phone | ❌ | ❌ | ❌ | ✅ | ❌ | Alt contact |
| | Second Owner Email | ❌ | ❌ | ❌ | ✅ | ❌ | Alt contact |
| | Owner Type | ❌ | ❌ | ❌ | ✅ | ❌ | Individual / Corp / Trust |
| | Absentee Owner | ✅ | ✅ | ❌ | ✅ | ❌ | Likelihood to sell signal |
| | Ownership Length (Years) | ❌ | ❌ | ❌ | ✅ | ❌ | Equity likely; long hold → motivated |
| | Homestead Exemption | ❌ | ❌ | ❌ | ✅ | ❌ | Owner-occupied marker |
| | Corporate Owned | ❌ | ❌ | ❌ | ✅ | ❌ | Institutional owner |
| **Mortgage & Financing** | | | | | | | |
| | Mortgage Amount (Primary) | ✅ | ✅ | ❌ | ✅ | ❌ | Equity calculation |
| | Mortgage Date (Primary) | ✅ | ✅ | ❌ | ✅ | ❌ | Loan age; refinance likelihood |
| | Mortgage Lender Name | ✅ | ✅ | ❌ | ✅ | ❌ | Lender contact |
| | Mortgage Type | ✅ | ✅ | ❌ | ✅ | ❌ | Fixed vs ARM; refinance signal |
| | Interest Rate | ✅ | ✅ | ❌ | ✅ | ❌ | Refi motivation (if <3%) |
| | Loan Term (Months) | ❌ | ✅ | ❌ | ✅ | ❌ | Monthly payment estimate |
| | Mortgage Position | ✅ | ❌ | ❌ | ✅ | ❌ | 1st/2nd/3rd position; lien priority |
| | Total Loan Balance | ✅ | ❌ | ❌ | ✅ | ❌ | Current mortgage payoff |
| | Number of Loans | ✅ | ❌ | ❌ | ✅ | ❌ | Complexity; cash-out refi signal |
| | Second Mortgage Amount | ❌ | ❌ | ❌ | ✅ | ❌ | HELOC / piggyback |
| | Second Mortgage Date | ❌ | ❌ | ❌ | ✅ | ❌ | Cash-out refi signal |
| | Second Mortgage Lender | ❌ | ❌ | ❌ | ✅ | ❌ | HELOC contact |
| **Liens & Judgments** | | | | | | | |
| | Lien Count | ✅ | ✅ | ❌ | ✅ | ❌ | Complexity; title issues risk |
| | Lien Amount | ❌ | ✅ | ❌ | ✅ | ❌ | Total encumbrance |
| | Lien Types | ❌ | ❌ | ❌ | ✅ | ❌ | Tax/judgment/mechanics/etc. |
| | Judgment Count | ❌ | ❌ | ❌ | ✅ | ❌ | Legal disputes |
| | Judgment Amounts | ❌ | ❌ | ❌ | ✅ | ❌ | Liability |
| **Tax Information** | | | | | | | |
| | Assessed Value | ✅ | ✅ | ❌ | ✅ | ✅ (taxAssessment) | All major vendors return |
| | Assessment Date | ❌ | ✅ | ❌ | ✅ | ❌ | Freshness indicator |
| | Assessment Year | ❌ | ✅ | ❌ | ✅ | ❌ | Age of valuation |
| | Annual Tax Amount | ✅ | ✅ | ❌ | ✅ | ✅ (annualTax) | All major vendors return |
| | Tax Rate | ❌ | ✅ | ❌ | ✅ | ❌ | Per-jurisdiction rate |
| | Tax Code Area | ❌ | ❌ | ❌ | ✅ | ❌ | Jurisdiction-specific |
| | Tax Exemption | ❌ | ✅ | ❌ | ✅ | ❌ | Special designation |
| | Tax Exemption Type | ❌ | ✅ | ❌ | ✅ | ❌ | Veteran / Ag / Historic |
| | Tax Delinquent Flag | ❌ | ❌ | ❌ | ✅ | ❌ | Distress signal; title risk |
| | Tax Delinquent Year | ❌ | ❌ | ❌ | ✅ | ❌ | When delinquency started |
| | Tax Delinquent Amount | ❌ | ❌ | ❌ | ✅ | ❌ | Payoff needed for clear title |
| **Valuation Estimates** | | | | | | | |
| | AVM (Automated Valuation Model) | ✅ | ❌ | ✅ | ✅ | ✅ (zestimate) | Most vendors return |
| | AVM Low / High Range | ❌ | ❌ | ✅ | ✅ | ❌ | Confidence band |
| | Assessed Value | ✅ | ✅ | ❌ | ✅ | ✅ (taxAssessment) | County tax assessment |
| | Market Value (AVM) | ❌ | ❌ | ❌ | ✅ | ❌ | Alternative valuation |
| | Price Per Square Foot | ❌ | ✅ | ✅ | ✅ | ❌ | Market multiple |
| | Land Value Estimate | ❌ | ❌ | ❌ | ✅ | ❌ | Land-only value |
| | Improvement Value Estimate | ❌ | ❌ | ❌ | ✅ | ❌ | Structure-only value |
| **Rental Estimates** | | | | | | | |
| | Monthly Rental Estimate | ❌ | ❌ | ✅ | ✅ | ✅ (rentalEstimate) | RentCast & BatchData |
| | Annual Rental Estimate | ❌ | ❌ | ✅ | ✅ | ❌ | Annualized income |
| | Rental Low / High Range | ❌ | ❌ | ✅ | ✅ | ❌ | Confidence band |
| | Rental Confidence Score | ❌ | ❌ | ✅ | ✅ | ❌ | Reliability of estimate |
| **Sale History** | | | | | | | |
| | Last Sale Price | ✅ | ✅ | ✅ | ✅ | ❌ | Recent comp; market signal |
| | Last Sale Date | ✅ | ✅ | ✅ | ✅ | ✅ (deedDate) | When property last sold |
| | Second Sale Price | ❌ | ❌ | ❌ | ✅ | ❌ | Historical comp |
| | Second Sale Date | ❌ | ❌ | ❌ | ✅ | ❌ | Historical timeline |
| | Prior Sale Prices (20yr history) | ❌ | ✅ | ❌ | ✅ | ❌ | Full appreciation curve |
| | Transfer History Count | ❌ | ❌ | ❌ | ✅ | ❌ | Flip frequency indicator |
| | Sale Deed Type | ❌ | ✅ | ❌ | ✅ | ❌ | Warranty / Quit Claim / etc. |
| | Sale Type | ❌ | ✅ | ❌ | ✅ | ❌ | Regular / Foreclosure / Distressed |
| | Sale Amount Relative (e.g., "Below Market") | ✅ | ❌ | ❌ | ❌ | ❌ | Motivation marker |
| | Sale Date Relative | ✅ | ❌ | ❌ | ❌ | ❌ | Timeframe label |
| | Sales Price Trend | ✅ | ❌ | ❌ | ✅ | ❌ | Up / Down / Stable |
| **Listing Status** | | | | | | | |
| | Listed for Sale | ✅ | ✅ | ❌ | ❌ | ❌ | Current MLS listing |
| | List Price | ✅ | ✅ | ❌ | ❌ | ❌ | Agent's asking price |
| | List Date | ❌ | ✅ | ❌ | ❌ | ❌ | When listed |
| | Days on Market | ✅ | ✅ | ✅ | ❌ | ❌ | How long unsold |
| | MLS ID | ❌ | ✅ | ❌ | ❌ | ❌ | MLS unique ID |
| | MLS Status | ❌ | ✅ | ❌ | ❌ | ❌ | Active / Pending / Sold |
| | Agent Name | ❌ | ✅ | ❌ | ❌ | ❌ | Listing agent contact |
| | Agent Phone | ❌ | ✅ | ❌ | ❌ | ❌ | Agent contact |
| | List Office | ❌ | ✅ | ❌ | ❌ | ❌ | Brokerage |
| **Foreclosure & Distress** | | | | | | | |
| | Foreclosure Status | ✅ | ❌ | ❌ | ✅ | ❌ | Is property in foreclosure |
| | Foreclosure Stage | ✅ | ❌ | ❌ | ✅ | ❌ | Pre-forecast / Auction / REO |
| | In Foreclosure (Boolean) | ✅ | ❌ | ❌ | ✅ | ❌ | Distress signal |
| | Notice of Default Date | ❌ | ❌ | ❌ | ✅ | ❌ | First legal notice |
| | Lis Pendens Date | ❌ | ✅ | ❌ | ✅ | ❌ | Lawsuit filed |
| | Lis Pendens Amount | ❌ | ✅ | ❌ | ✅ | ❌ | Plaintiff's claim |
| | Lis Pendens Plaintiff | ❌ | ❌ | ❌ | ✅ | ❌ | Foreclosing entity |
| | Foreclosure Judgment Date | ❌ | ❌ | ❌ | ✅ | ❌ | Court decision date |
| | Foreclosure Judgment Amount | ❌ | ❌ | ❌ | ✅ | ❌ | Court judgment |
| | Bank Owned (REO) | ❌ | ❌ | ❌ | ✅ | ❌ | Lender-owned property |
| | Pre-Foreclosure | ❌ | ❌ | ❌ | ✅ | ❌ | Before formal process |
| | Foreclosure Auction Date | ❌ | ❌ | ❌ | ✅ | ❌ | When sold at auction |
| | Foreclosure Opening Bid | ❌ | ❌ | ❌ | ✅ | ❌ | Lender's minimum bid |
| | Default Amount | ✅ | ❌ | ❌ | ❌ | ❌ | Past-due balance |
| | Default As Of (Date) | ✅ | ❌ | ❌ | ❌ | ❌ | Default status date |
| | Distress Score | ✅ | ❌ | ❌ | ❌ | ❌ | Proprietary risk ranking |
| **Utilities & Services** | | | | | | | |
| | Water Source | ❌ | ✅ | ❌ | ✅ | ✅ (waterType) | City / Well / Other |
| | Water Source Description | ❌ | ✅ | ❌ | ✅ | ✅ (waterNotes) | Additional context |
| | Sewer Type | ❌ | ✅ | ❌ | ✅ | ✅ (sewerType) | City / Septic / Other |
| | Sewer Description | ❌ | ✅ | ❌ | ✅ | ✅ (sewerNotes) | Additional context |
| | Electric Service | ❌ | ✅ | ❌ | ✅ | ✅ (electricType) | Public / Private / Other |
| | Electric Service Type | ❌ | ✅ | ❌ | ✅ | ✅ (electricNotes) | Additional detail |
| | Gas Service | ❌ | ✅ | ❌ | ✅ | ❌ | Available (boolean) |
| | Gas Service Type | ❌ | ✅ | ❌ | ✅ | ❌ | Public / Private |
| **Zoning & Legal** | | | | | | | |
| | Zoning Code | ❌ | ✅ | ❌ | ✅ | ❌ | Zoning classification |
| | Zoning Description | ❌ | ✅ | ❌ | ✅ | ❌ | Residential / Commercial / Mixed |
| | Land Use Code | ❌ | ✅ | ❌ | ✅ | ❌ | County code |
| | Land Use Description | ❌ | ✅ | ❌ | ✅ | ❌ | Use classification |
| | Legal Description | ❌ | ✅ | ❌ | ✅ | ❌ | Deed language |
| | Legal Unit | ❌ | ❌ | ❌ | ✅ | ❌ | Condo / lot unit |
| | Legal Block | ❌ | ❌ | ❌ | ✅ | ❌ | Lot block number |
| | Legal Lot | ❌ | ❌ | ❌ | ✅ | ❌ | Lot number |
| | Subdivision Name | ✅ | ✅ | ❌ | ✅ | ❌ | Community name |
| | Plat Book | ❌ | ❌ | ❌ | ✅ | ❌ | Plat reference |
| | Plat Page | ❌ | ❌ | ❌ | ✅ | ❌ | Plat reference |
| **Permits & Demolition** | | | | | | | |
| | Permit Count (Lifetime) | ❌ | ❌ | ❌ | ✅ | ❌ | Building activity level |
| | Recent Permits (Array) | ❌ | ❌ | ❌ | ✅ | ❌ | Recent improvements |
| | Demolition Flag | ❌ | ❌ | ❌ | ✅ | ❌ | Property demolished |
| **Vacancy & Condition** | | | | | | | |
| | Vacant (Site) | ✅ | ✅ | ❌ | ✅ | ❌ | Unoccupied (observable) |
| | Vacant (Mail) | ✅ | ✅ | ❌ | ✅ | ❌ | Mail return flag |
| | Vacant Status | ❌ | ❌ | ❌ | ✅ | ❌ | Detailed vacancy type |
| | Vacant Status Year | ❌ | ❌ | ❌ | ✅ | ❌ | How long vacant |
| **Environmental & Hazard** | | | | | | | |
| | Flood Zone | ❌ | ❌ | ❌ | ✅ | ✅ (floodZone) | FEMA flood risk |
| | Flood Zone Level | ❌ | ❌ | ❌ | ✅ | ❌ | A / AE / X / etc. |
| | Earthquake Zone | ❌ | ❌ | ❌ | ✅ | ❌ | Seismic risk |
| | Wildfire Risk Zone | ❌ | ❌ | ❌ | ✅ | ❌ | Fire hazard area |
| | Hazard Zone Type | ❌ | ❌ | ❌ | ✅ | ❌ | General hazard |
| | Hazard Zone Description | ❌ | ❌ | ❌ | ✅ | ❌ | Details |
| **Education & Demographics** | | | | | | | |
| | School District | ❌ | ❌ | ❌ | ✅ | ❌ | District name / code |
| | Elementary School | ❌ | ❌ | ❌ | ✅ | ❌ | School name |
| | Middle School | ❌ | ❌ | ❌ | ✅ | ❌ | School name |
| | High School | ❌ | ❌ | ❌ | ✅ | ❌ | School name |
| | Census Block | ❌ | ❌ | ❌ | ✅ | ❌ | Census geography |
| | Census Block Group | ❌ | ❌ | ❌ | ✅ | ❌ | Census geography |
| | Census Tract | ❌ | ❌ | ❌ | ✅ | ❌ | Census geography |
| | Population | ❌ | ❌ | ✅ | ❌ | ❌ | Market size (market data) |
| **Political & Civic** | | | | | | | |
| | Congressional District | ❌ | ❌ | ❌ | ✅ | ❌ | Federal representative |
| | State Legislative District | ❌ | ❌ | ❌ | ✅ | ❌ | State rep |
| | County Legislative District | ❌ | ❌ | ❌ | ✅ | ❌ | County rep |
| | Municipality Code | ❌ | ❌ | ❌ | ✅ | ❌ | City code |
| **Neighborhood & Quality** | | | | | | | |
| | Neighborhood Code | ❌ | ❌ | ❌ | ✅ | ❌ | Area classification |
| | Area Name | ❌ | ❌ | ✅ | ❌ | ❌ | Market / submarket name |
| **Comparable Sales** | | | | | | | |
| | Comp Sales Array | ❌ | ✅ | ❌ | ❌ | ❌ | Recent similar sales |
| **Market Data** | | | | | | | |
| | Median Price (Market) | ❌ | ❌ | ✅ | ❌ | ❌ | Area median |
| | Median Rent (Market) | ❌ | ❌ | ✅ | ❌ | ❌ | Area median |
| | Avg Days on Market (Market) | ❌ | ❌ | ✅ | ❌ | ❌ | Market velocity |
| | Price Per Sq Ft (Market) | ❌ | ❌ | ✅ | ❌ | ❌ | Market multiple |
| | Price to Rent Ratio | ❌ | ❌ | ✅ | ❌ | ❌ | Investment indicator |
| **Miscellaneous** | | | | | | | |
| | Property URL / Link | ✅ | ❌ | ❌ | ❌ | ❌ | PropertyRadar listing link |
| | Photo URL | ✅ | ❌ | ❌ | ❌ | ❌ | Thumbnail image |
| | Data Last Updated | ❌ | ❌ | ❌ | ✅ | ❌ | Freshness indicator |
| | Latitude/Longitude Accuracy | ❌ | ❌ | ❌ | ✅ | ❌ | Geo precision |
| | Record Number | ❌ | ❌ | ❌ | ✅ | ❌ | Internal ID |
| | Commercial Building | ❌ | ❌ | ❌ | ✅ | ❌ | Is commercial use |
| | Historical Property | ❌ | ❌ | ❌ | ✅ | ❌ | Historic designation |
| | Construction Type Code | ❌ | ❌ | ❌ | ✅ | ❌ | Materials code |
| | Construction Quality | ❌ | ❌ | ❌ | ✅ | ❌ | Quality grade |

---

## Part 3: Missing Fields — What Gunner Should Add

Based on the API field universe and Gunner's current Property model, here are fields that are returned "for free" by at least one vendor and warrant adding to the Property model:

### Tier 1: Add Immediately (High Wholesale Value, Multiple Vendors)

| Field | Column Name | Type | Why It's Worth Adding | Vendors |
|-------|---|---|---|---|
| County | `county` | String | Links to county records, tax lookup, jurisdiction-specific rules | PR, REAPI, RC, BD |
| Latitude | `latitude` | Decimal(10,8) | Geo-fencing, route planning, neighborhood clustering | REAPI, RC, BD |
| Longitude | `longitude` | Decimal(10,8) | Geo-fencing, route planning, neighborhood clustering | REAPI, RC, BD |
| APN (Assessor's Parcel Number) | `apn` | String | Golden standard for property ID; public records lookup | PR, REAPI, BD |
| Ownership Length (Years) | `ownershipLengthYears` | Int | Equity signal: long hold → likely motivated seller | BD |
| Absentee Owner | `absenteeOwner` | Boolean | Critical distress signal; 2-3x more likely to sell | PR, REAPI, BD |
| Owner Phone | `ownerPhone` | String (encrypted) | Direct skip-trace contact; circumvent GHL dependency | PR, BD |
| Owner Email | `ownerEmail` | String (encrypted) | Direct skip-trace contact; circumvent GHL dependency | PR, BD |
| Mortgage Amount (Primary) | `mortgageAmount` | Decimal(12,2) | Equity calculation (value - mortgage = equity) | PR, REAPI, BD |
| Mortgage Date | `mortgageDate` | Date | Refi likelihood; ARM reset calendar | PR, REAPI, BD |
| Mortgage Type | `mortgageType` | String | ARM at low rate + rising rates = refi signal | PR, REAPI, BD |
| Interest Rate | `mortgageRate` | Decimal(5,2) | Refi motivation (low rate = less likely to sell) | PR, REAPI, BD |
| Lien Count | `lienCount` | Int | Title complexity; high count = attorney required | PR, REAPI, BD |
| Lien Amount | `lienAmount` | Decimal(12,2) | Total encumbrance competing with 1st mortgage | REAPI, BD |
| Tax Delinquent Flag | `taxDelinquent` | Boolean | Major distress signal; title cleanup required | BD |
| Tax Delinquent Amount | `taxDelinquentAmount` | Decimal(12,2) | Payoff needed before acquisition | BD |
| Foreclosure Status | `foreclosureStatus` | String | Distress signal; auction date data | PR, BD |
| Notice of Default Date | `nod Date` | Date | Legal timeline marker; auction ~3-4 months later | BD |
| Lis Pendens Date | `lisPendensDate` | Date | When lawsuit filed; auction timeline | REAPI, BD |
| Bank Owned (REO) | `bankOwned` | Boolean | Lender-motivated; institutional seller | BD |
| Pre-Foreclosure | `preForeclosure` | Boolean | Early-stage distress; best negotiating window | BD |
| Basement Finished % | `basementFinishedPercent` | Int | Living area driver; repair cost factor | REAPI, BD |
| Stories | `stories` | Int | Structural complexity; rehab scope | PR, REAPI, BD |
| Units (Multi-Family) | `units` | Int | Deal structure (wholesale vs. hold vs. flip) | PR, BD |
| Last Sale Price | `lastSalePrice` | Decimal(12,2) | Market comp; appreciation/depreciation curve | PR, REAPI, RC, BD |
| Transfer History Count | `transferCount` | Int | Flip frequency; if >5 in 10yr = flipper target | BD |
| Data Last Updated | `dataLastUpdated` | DateTime | Freshness of enrichment; when to re-pull | BD |

### Tier 2: Add Soon (Useful Single-Vendor, Free Bundling)

| Field | Column Name | Type | Why It's Worth Adding | Vendors |
|---|---|---|---|---|
| FIPS Code | `fips` | String | Federal ID; market/regional rollups | REAPI, RC, BD |
| Subdivision | `subdivision` | String | Community identity; HOA lookup | PR, REAPI, BD |
| Roof Type | `roofType` | String | Major repair driver; inspection priority | REAPI, BD |
| Foundation Type | `foundationType` | String | Structural concerns (cracked foundation = $$$) | REAPI, BD |
| Garage Type | `garageType` | String | Detached vs. attached; repair cost | REAPI, BD |
| Garage Capacity | `garageCapacity` | Int | Parking; marketability | REAPI, BD |
| Heating System | `heatingSystem` | String | HVAC condition; rehab line item | REAPI, BD |
| Cooling System | `coolingSystem` | String | HVAC condition; rehab line item | REAPI, BD |
| Exterior Walls | `exteriorWalls` | String | Siding material; durability / maintenance cost | BD |
| Deck / Patio | `hasDeck` | Boolean | Outdoor improvement; curb appeal | REAPI, BD |
| Porch | `hasPorch` | Boolean | Entry curb appeal | REAPI, BD |
| Solar Panels | `hasSolar` | Boolean | Green feature; energy bill reducer | BD |
| Fireplace | `hasFireplace` | Boolean | Luxury; buyer appeal | REAPI, BD |
| Lien Types Array | `lienTypes` | JSON | Tax vs. judgment vs. mechanics; priority | BD |
| Judgment Count | `judgmentCount` | Int | Legal disputes; title cloud | BD |
| Vacant Status | `vacantStatus` | String | Long-term vacancy = maintenance cost | BD |
| Zoning Code | `zoningCode` | String | Single-family vs. multi; repurpose potential | REAPI, BD |
| Land Use Code | `landUseCode` | String | County code; zoning match confirmation | REAPI, BD |
| Second Mortgage Amount | `secondMortgageAmount` | Decimal(12,2) | HELOC extraction; cash-out refi signal | BD |
| Second Owner Phone | `secondOwnerPhone` | String (encrypted) | Alt contact; joint ownership | BD |
| Owner Type | `ownerType` | String | Individual / Corp / Trust; negotiation style | BD |
| School District | `schoolDistrict` | String | Buyer appeal; family market | BD |
| Flood Zone | `floodZone` | String | Insurance/habitability; buyer filter (already added) | BD |
| Earthquake Zone | `earthquakeZone` | String | Insurance cost; structural risk | BD |
| Wildfire Risk | `wildfireRisk` | Boolean | Insurance / buyer acceptance | BD |

### Tier 3: Skip (Low-Leverage or Too Vendor-Specific)

| Field | Reason | Vendors |
|---|---|---|
| Legal Unit / Block / Lot | Too granular; condo-specific; rare wholesale need | BD |
| Plat Book / Plat Page | Deed reference; low daily use | BD |
| Census Block / Tract | Demographics stored in JSON; not actionable alone | BD |
| Congressional / Legislative Districts | Political targeting out of scope; ultra-rare | BD |
| Municipality Code | Overlaps with city/county | BD |
| Neighborhood Code | Fuzzy; overlaps with custom_fields | BD |
| Construction Type Code | Overlaps with propertyType (already exists) | BD |
| Recent Permits Array | Requires document parsing; nice-to-have | BD |
| Comparable Sales Array | External comps; use MLS/comp services instead | REAPI |
| Market Data (median price, DOM, etc.) | Market-level, not property-level; use separate endpoint | RC |
| Basement Unfinished % | Derivative of total; lower priority | REAPI, BD |
| Interior Walls | Too granular; not actionable | BD |
| Ceiling Height | Luxury factor; low impact on wholesale | BD |
| Spa / Hot Tub | Luxury amenity; too niche | BD |
| Parking Type | Redundant with garage_type | BD |
| Phone Availability Flag / Email Availability Flag | Low predictive value; just use boolean on fields | PR |
| Foreclosure Opening Bid | Auction data; changes post-listing; stale | BD |
| Foreclosure Judgment Amount | Court record; lower priority | BD |

---

## Part 4: Overlap & Redundancy Analysis

### Unified Core (All 4 Vendors Return)
These fields are so universal that a single "trusted" source suffices:
- Address, City, State, ZIP
- Bedrooms, Bathrooms, Square Feet, Lot Size, Year Built
- Property Type
- Last Sale Price, Last Sale Date
- Owner Name
- Assessed Value, Annual Tax

**Recommendation**: Primary source = **BatchData** (700 attributes, most comprehensive). Fallback = **PropertyRadar** (skip-trace + foreclosure). **RealEstateAPI** and **RentCast** fill gaps (comps, market data, AVM variants).

---

### Unique Value by Vendor

| Vendor | Unique Strengths | Best For | Cost |
|---|---|---|---|
| **PropertyRadar** | Skip-trace (phone/email); distress scoring; foreclosure timeline; tax data; lender info | Distressed/foreclosure deals; cold outreach | Subscription tier (~$500-2000/mo) |
| **RealEstateAPI** | Comps array; liens detail; lien types; mortgage specifics (rate, term, type); 200+ fields | Valuation, title clarity, financing analysis | Per-call; ~$0.50-1.00 per property |
| **RentCast** | Market-level analytics; AVM with confidence score; rental estimates; area comps | Market analysis, rental deal valuation, AVM confidence | Per-call; varies by endpoint |
| **BatchData** | 700 attributes; most complete deed/mortgage history; owner type; ownership length; lien + judgment detail; permits; environmental | Comprehensive enrichment; data dumps for AI analysis | **$0.30/property (all-attributes)** — best value |

---

### Redundancy Matrix

**Fields Returned by 3+ Vendors** (choose cheapest source):
- Address, City, State, ZIP: **BatchData** ($0.30)
- Beds, Baths, SqFt, Lot Size, Year Built: **BatchData** ($0.30)
- Owner Name: **BatchData** ($0.30)
- Assessed Value, Annual Tax: **BatchData** ($0.30)
- Last Sale Price/Date: **BatchData** ($0.30)
- Mortgage Amount/Lender: **BatchData** ($0.30)
- Absentee Owner: **BatchData** ($0.30)
- AVM: **RentCast** (if accuracy > RealEstateAPI's) or **BatchData**

**Fields Returned by Only 1 Vendor** (forced commitment):
- Skip-trace phone/email: **PropertyRadar only** → buy subscription or accept missing data
- Comps array: **RealEstateAPI only** → $0.50-1.00 per property if comps needed
- Foreclosure timeline (NOD, lis pendens dates): **BatchData only** → $0.30 bundled
- Market-level price/rent/DOM: **RentCast only** → separate API call

---

### Cost-Benefit: Which Vendors to Retain

**Proposal**:
1. **Primary**: **BatchData** ($0.30/property, all-attributes) — 700 fields cover 80% of use cases
2. **Secondary**: **PropertyRadar** (subscription) — skip-trace + distress scoring; complement BatchData
3. **Tertiary**: **RealEstateAPI** (per-call, ~$0.50-1.00) — comps + lien detail on demand
4. **Skip** (for now): **RentCast** — market data useful but lower priority; comps are market-agnostic

**Savings**: Drop RentCast ($0.05-0.15/property in typical bundles). Invest savings in PropertyRadar subscription (distress deals are 10x ROI).

---

## Sources

- [PropertyRadar API Quickstart](https://developers.propertyradar.com/)
- [PropertyRadar Zapier Data Fields](https://help.propertyradar.com/en/articles/3526061-data-available-for-zapier-and-webhooks-integrations)
- [RealEstateAPI Property Detail](https://developer.realestateapi.com/reference/property-detail-api-1)
- [RentCast Developer Reference](https://developers.rentcast.io/reference/)
- [RentCast Property Data Schema](https://developers.rentcast.io/reference/property-data-schema)
- [RentCast Property Valuation](https://developers.rentcast.io/reference/property-valuation)
- [BatchData Developer Portal](https://developer.batchdata.com/)
- [BatchData Property Lookup All-Attributes](https://developer.batchdata.com/docs/batchdata/batchdata-v1/operations/create-a-property-lookup-all-attribute)
- [BatchData Blog - Real Estate API Examples](https://batchdata.io/blog/real-estate-api-documentation-examples)
- [Cleveroad - Real Estate APIs Comparison](https://www.cleverroad.com/blog/real-estate-apis/)
- [APILeague - Best Real Estate APIs](https://apileague.com/articles/best-real-estate-api/)

