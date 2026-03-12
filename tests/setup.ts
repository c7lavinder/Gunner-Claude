/**
 * Server test setup — provides mock env vars so modules that import
 * server/_core/env.ts and server/_core/db.ts can load without a real database.
 */
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.OPENAI_API_KEY = "sk-test";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "test-key";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
