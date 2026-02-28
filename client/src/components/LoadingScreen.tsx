import { useEffect, useState } from "react";

export function LoadingScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [isFiring, setIsFiring] = useState(false);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const fireTimer = setTimeout(() => {
      setIsFiring(true);
    }, 300);

    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 1600);

    const hideTimer = setTimeout(() => {
      setIsVisible(false);
    }, 2000);

    return () => {
      clearTimeout(fireTimer);
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-400 ${
        isFading ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "linear-gradient(135deg, #08080c 0%, #0f0f15 50%, #08080c 100%)" }}
    >
      {/* Subtle gradient orb behind logo */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-20 blur-[100px]"
        style={{ background: "radial-gradient(circle, #8B1A1A 0%, transparent 70%)" }}
      />

      <div className="flex flex-col items-center gap-6 relative z-10">
        {/* Logo container with animation */}
        <div className="relative">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663328210645/nusXfQu5XBTMz3NUCR6brb/branding/gunner-logo.png"
            alt="Gunner"
            className={`h-28 w-28 object-contain transition-transform duration-300 ${
              isFiring ? "animate-cannon-recoil" : ""
            }`}
            style={{ filter: "brightness(1.1)" }}
          />

          {/* Muzzle flash effect */}
          {isFiring && (
            <div className="absolute -right-4 top-0 animate-muzzle-flash">
              <div className="h-8 w-8 rounded-full bg-gradient-to-r from-amber-400 via-red-500 to-red-700 blur-sm opacity-90" />
            </div>
          )}

          {/* AI projectile */}
          {isFiring && (
            <div className="absolute -right-2 top-2 animate-projectile-fly">
              <span className="text-lg font-bold text-red-400 drop-shadow-[0_0_12px_rgba(239,68,68,0.6)]">AI</span>
            </div>
          )}
        </div>

        {/* GUNNER text */}
        <div className={`transition-all duration-500 ${isFiring ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <h1 className="text-4xl font-black tracking-[0.2em]" style={{ fontFamily: "'Satoshi', sans-serif" }}>
            <span className="bg-gradient-to-r from-white via-white/90 to-white/70 bg-clip-text text-transparent">
              GUNNER
            </span>
          </h1>
        </div>

        {/* Loading indicator */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500/80 animate-bounce [animation-delay:-0.3s]" />
            <div className="h-1.5 w-1.5 rounded-full bg-red-500/80 animate-bounce [animation-delay:-0.15s]" />
            <div className="h-1.5 w-1.5 rounded-full bg-red-500/80 animate-bounce" />
          </div>
        </div>
      </div>

      {/* Custom animations */}
      <style>{`
        @keyframes cannon-recoil {
          0% { transform: translateX(0) rotate(0); }
          15% { transform: translateX(-8px) rotate(-3deg); }
          30% { transform: translateX(4px) rotate(1deg); }
          50% { transform: translateX(-2px) rotate(-0.5deg); }
          100% { transform: translateX(0) rotate(0); }
        }
        
        @keyframes muzzle-flash {
          0% { opacity: 0; transform: scale(0.5); }
          20% { opacity: 1; transform: scale(1.5); }
          100% { opacity: 0; transform: scale(0.8); }
        }
        
        @keyframes projectile-fly {
          0% { 
            opacity: 1; 
            transform: translate(0, 0) scale(1); 
          }
          50% { 
            opacity: 1; 
            transform: translate(80px, -40px) scale(1.2); 
          }
          100% { 
            opacity: 0; 
            transform: translate(160px, 0) scale(0.8); 
          }
        }
        
        .animate-cannon-recoil {
          animation: cannon-recoil 0.5s ease-out;
        }
        
        .animate-muzzle-flash {
          animation: muzzle-flash 0.3s ease-out forwards;
        }
        
        .animate-projectile-fly {
          animation: projectile-fly 0.8s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
