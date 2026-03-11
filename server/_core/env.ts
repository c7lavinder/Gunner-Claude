function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const ENV = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  openaiApiKey: required("OPENAI_API_KEY"),

  // Supabase is required — recording storage will fail silently without it
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceKey: required("SUPABASE_SERVICE_KEY"),

  stripeSecretKey: optional("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET"),

  googleClientId: required("GOOGLE_CLIENT_ID"),
  googleClientSecret: required("GOOGLE_CLIENT_SECRET"),

  ghlClientId: optional("GHL_CLIENT_ID"),
  ghlClientSecret: optional("GHL_CLIENT_SECRET"),
  ghlWebhookSecret: optional("GHL_WEBHOOK_SECRET"),

  resendApiKey: optional("RESEND_API_KEY"),
  resendFromEmail: optional("RESEND_FROM_EMAIL", "noreply@getgunner.ai"),

  // TODO: implement Loops drip sequences — enroll users on signup via POST /api/v1/contacts/upsert
  loopsApiKey: optional("LOOPS_API_KEY"),

  sentryDsn: optional("SENTRY_DSN"),

  // PostHog server-side analytics (frontend uses VITE_POSTHOG_API_KEY build var)
  posthogApiKey: optional("POSTHOG_API_KEY"),

  // TODO: switch llm.ts to @langchain/openai SDK for automatic LangSmith tracing
  // Until then, LANGCHAIN_API_KEY has no effect — raw fetch bypasses the SDK
  langsmithApiKey: optional("LANGCHAIN_API_KEY"),

  turnstileSecretKey: optional("TURNSTILE_SECRET_KEY"),

  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(optional("PORT", "3000"), 10),
};
