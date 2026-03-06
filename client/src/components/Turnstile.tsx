import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: TurnstileOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileOptions {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
}

interface TurnstileProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
  className?: string;
}

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

export default function Turnstile({
  onVerify,
  onExpire,
  onError,
  theme = "auto",
  size = "normal",
  className,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const scriptLoadedRef = useRef(false);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: onVerify,
      "expired-callback": onExpire,
      "error-callback": onError,
      theme,
      size,
    });
  }, [onVerify, onExpire, onError, theme, size]);

  useEffect(() => {
    // If Turnstile script is already loaded, render immediately
    if (window.turnstile) {
      renderWidget();
      return;
    }

    // Check if script tag already exists
    if (!scriptLoadedRef.current && !document.querySelector('script[src*="turnstile"]')) {
      scriptLoadedRef.current = true;

      // Set up callback for when script loads
      window.onTurnstileLoad = () => {
        renderWidget();
      };

      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else {
      // Script is loading, wait for it
      const checkInterval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(checkInterval);
          renderWidget();
        }
      }, 100);

      return () => clearInterval(checkInterval);
    }
  }, [renderWidget]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          // Widget may already be removed
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) {
    return null; // Don't render if no site key configured
  }

  return <div ref={containerRef} className={className} />;
}

export { TURNSTILE_SITE_KEY };
