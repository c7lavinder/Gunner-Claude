import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

// Helper to get impersonation data from localStorage
const getImpersonationUserId = (): string | null => {
  try {
    // Check simple key first (used by settings page)
    const simpleId = localStorage.getItem('impersonateUserId');
    if (simpleId) return simpleId;
    
    // Check structured data (used by impersonation banner)
    const data = localStorage.getItem('gunner_impersonation');
    if (data) {
      const parsed = JSON.parse(data);
      return parsed.targetUserId?.toString() || null;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
};

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        const impersonateUserId = getImpersonationUserId();
        const headers: Record<string, string> = {
          ...(init?.headers as Record<string, string> || {}),
        };
        
        // Add impersonation header if active
        if (impersonateUserId) {
          headers['X-Impersonate-User-Id'] = impersonateUserId;
        }
        
        const response = await globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
          credentials: "include",
        });

        // Guard against non-JSON responses (e.g. 502 HTML error pages from proxy)
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok && !contentType.includes('application/json')) {
          // Return a synthetic JSON error response so tRPC doesn't crash parsing HTML
          const errorBody = JSON.stringify({
            error: {
              message: `Server error (${response.status}). Please try again.`,
              code: -32603,
              data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: response.status },
            },
          });
          return new Response(errorBody, {
            status: response.status,
            statusText: response.statusText,
            headers: { 'content-type': 'application/json' },
          });
        }

        return response;
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
