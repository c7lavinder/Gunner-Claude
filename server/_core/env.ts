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

  supabaseUrl: optional("SUPABASE_URL"),
  supabaseServiceKey: optional("SUPABASE_SERVICE_KEY"),

  stripeSecretKey: optional("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET"),

  googleClientId: required("GOOGLE_CLIENT_ID"),
  googleClientSecret: required("GOOGLE_CLIENT_SECRET"),

  ghlClientId: optional("GHL_CLIENT_ID"),
  ghlClientSecret: optional("GHL_CLIENT_SECRET"),

  resendApiKey: optional("RESEND_API_KEY"),
  resendFromEmail: optional("RESEND_FROM_EMAIL", "noreply@getgunner.ai"),

  loopsApiKey: optional("LOOPS_API_KEY"),

  sentryDsn: optional("SENTRY_DSN"),
  posthogApiKey: optional("POSTHOG_API_KEY"),
  langsmithApiKey: optional("LANGCHAIN_API_KEY"),

  turnstileSecretKey: optional("TURNSTILE_SECRET_KEY"),

  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(optional("PORT", "3000"), 10),
};
