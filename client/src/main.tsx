import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import * as Sentry from "@sentry/react";
import posthog from "posthog-js";
import { trpc } from "./lib/trpc";
import superjson from "superjson";
import { ThemeProvider } from "next-themes";
import { App } from "./App";
import { AuthProvider } from "./hooks/useAuth";
import "./index.css";

let sentryReady = false;
try {
  const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
    });
    sentryReady = true;
  }
} catch {
  console.warn("[sentry] Failed to initialize — skipping");
}

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_API_KEY as string | undefined;
if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: "https://app.posthog.com",
    capture_pageview: false, // we'll do manual page_view tracking
    autocapture: false,
  });
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(url, options) {
        const headers = new Headers(options?.headers);
        const token = localStorage.getItem("auth_token");
        if (token && !headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        return fetch(url, { ...options, headers, credentials: "include" });
      },
    }),
  ],
});

function FallbackUI() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h2>
      <p style={{ color: "#888" }}>An unexpected error occurred. Try refreshing the page.</p>
      <button onClick={() => window.location.reload()} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}>
        Refresh
      </button>
    </div>
  );
}

const AppTree = (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </ThemeProvider>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {sentryReady ? (
      <Sentry.ErrorBoundary fallback={<FallbackUI />}>
        {AppTree}
      </Sentry.ErrorBoundary>
    ) : (
      AppTree
    )}
  </StrictMode>
);
