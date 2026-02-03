import { useEffect, useState } from "react";

export function LoadingScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [isFiring, setIsFiring] = useState(false);

  useEffect(() => {
    // Trigger the firing animation after a short delay
    const fireTimer = setTimeout(() => {
      setIsFiring(true);
    }, 300);

    // Hide the loading screen after animation completes
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
    }, 2000);

    return () => {
      clearTimeout(fireTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <div className="flex flex-col items-center gap-6">
        {/* Logo container with animation */}
        <div className="relative">
          {/* Cannon logo */}
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/ORoxztkyoTJEjMxT.png"
            alt="Gunner"
            className={`h-32 w-32 object-contain transition-transform duration-300 ${
              isFiring ? "animate-cannon-recoil" : ""
            }`}
          />
          
          {/* Muzzle flash effect */}
          {isFiring && (
            <div className="absolute -right-4 top-0 animate-muzzle-flash">
              <div className="h-8 w-8 rounded-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 blur-sm opacity-80" />
            </div>
          )}
          
          {/* AI projectile */}
          {isFiring && (
            <div className="absolute -right-2 top-2 animate-projectile-fly">
              <span className="text-lg font-bold text-[#722F37] drop-shadow-lg">AI</span>
            </div>
          )}
        </div>

        {/* GUNNER text */}
        <div className={`transition-all duration-500 ${isFiring ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <h1 className="text-4xl font-black tracking-wider text-gray-900 dark:text-white">
            <span className="text-[#722F37]">GUNNER</span>
          </h1>
        </div>

        {/* Loading indicator */}
        <div className="flex items-center gap-2 mt-4">
          <div className="flex gap-1">
            <div className="h-2 w-2 rounded-full bg-[#722F37] animate-bounce [animation-delay:-0.3s]" />
            <div className="h-2 w-2 rounded-full bg-[#722F37] animate-bounce [animation-delay:-0.15s]" />
            <div className="h-2 w-2 rounded-full bg-[#722F37] animate-bounce" />
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">Loading...</span>
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
