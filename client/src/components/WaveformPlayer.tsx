import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from "lucide-react";

interface WaveformPlayerProps {
  url: string;
  duration?: number; // in seconds, from the call metadata
}

export interface WaveformPlayerRef {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

const WaveformPlayer = forwardRef<WaveformPlayerRef, WaveformPlayerProps>(
  function WaveformPlayer({ url, duration: callDuration }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(callDuration || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Expose imperative methods via ref
  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      if (!wavesurferRef.current || !isReady) return;
      const dur = wavesurferRef.current.getDuration();
      if (dur > 0) {
        wavesurferRef.current.seekTo(Math.max(0, Math.min(seconds / dur, 1)));
      }
    },
    play: () => {
      wavesurferRef.current?.play();
    },
    pause: () => {
      wavesurferRef.current?.pause();
    },
    getCurrentTime: () => {
      return wavesurferRef.current?.getCurrentTime() || 0;
    },
    getDuration: () => {
      return wavesurferRef.current?.getDuration() || 0;
    },
  }), [isReady]);

  useEffect(() => {
    if (!containerRef.current || !url) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "rgba(139, 26, 26, 0.25)",
      progressColor: "#8B1A1A",
      cursorColor: "#c41e3a",
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1.5,
      barRadius: 2,
      height: 56,
      normalize: true,
      backend: "WebAudio",
      url: url,
    });

    wavesurferRef.current = ws;

    ws.on("ready", () => {
      setIsReady(true);
      setIsLoading(false);
      setDuration(ws.getDuration());
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("timeupdate", (time: number) => setCurrentTime(time));
    ws.on("error", (err: Error) => {
      console.error("[WaveformPlayer] Error:", err);
      setError("Unable to load audio");
      setIsLoading(false);
    });

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [url]);

  const togglePlay = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const toggleMute = useCallback(() => {
    if (!wavesurferRef.current) return;
    const newMuted = !isMuted;
    wavesurferRef.current.setMuted(newMuted);
    setIsMuted(newMuted);
  }, [isMuted]);

  const skip = useCallback((seconds: number) => {
    if (!wavesurferRef.current) return;
    const newTime = Math.max(0, Math.min(wavesurferRef.current.getCurrentTime() + seconds, duration));
    wavesurferRef.current.seekTo(newTime / duration);
  }, [duration]);

  const cyclePlaybackRate = useCallback(() => {
    if (!wavesurferRef.current) return;
    const rates = [1, 1.25, 1.5, 2, 0.75];
    const currentIdx = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIdx + 1) % rates.length];
    wavesurferRef.current.setPlaybackRate(nextRate);
    setPlaybackRate(nextRate);
  }, [playbackRate]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div
        className="rounded-xl p-4 flex items-center gap-3"
        style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}
      >
        <VolumeX className="h-5 w-5 shrink-0" style={{ color: "var(--g-text-tertiary)" }} />
        <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>{error}</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--g-bg-card)",
        border: "1px solid var(--g-border-subtle)",
        boxShadow: "var(--g-shadow-card)",
      }}
    >
      {/* Waveform */}
      <div className="px-4 pt-4 pb-2 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="g-shimmer rounded-full"
                    style={{
                      width: 2,
                      height: 12 + Math.random() * 32,
                      animationDelay: `${i * 50}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          className="w-full transition-opacity duration-300"
          style={{ opacity: isReady ? 1 : 0.3 }}
        />
      </div>

      {/* Controls */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderTop: "1px solid var(--g-border-subtle)" }}
      >
        {/* Skip back */}
        <button
          onClick={() => skip(-10)}
          disabled={!isReady}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-105 disabled:opacity-30"
          style={{ background: "var(--g-bg-inset)", color: "var(--g-text-secondary)" }}
          title="Skip back 10s"
        >
          <SkipBack className="h-3.5 w-3.5" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          disabled={!isReady}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 disabled:opacity-30"
          style={{
            background: "var(--g-accent)",
            color: "#fff",
            boxShadow: isPlaying ? "0 0 16px var(--g-accent-glow)" : "var(--g-shadow-sm)",
          }}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>

        {/* Skip forward */}
        <button
          onClick={() => skip(10)}
          disabled={!isReady}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-105 disabled:opacity-30"
          style={{ background: "var(--g-bg-inset)", color: "var(--g-text-secondary)" }}
          title="Skip forward 10s"
        >
          <SkipForward className="h-3.5 w-3.5" />
        </button>

        {/* Time display */}
        <div className="flex items-center gap-1.5 font-mono text-xs" style={{ color: "var(--g-text-secondary)" }}>
          <span style={{ color: "var(--g-text-primary)", fontWeight: 600 }}>{formatTime(currentTime)}</span>
          <span style={{ color: "var(--g-text-tertiary)" }}>/</span>
          <span>{formatTime(duration)}</span>
        </div>

        <div className="flex-1" />

        {/* Playback rate */}
        <button
          onClick={cyclePlaybackRate}
          disabled={!isReady}
          className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all duration-200 hover:scale-105 disabled:opacity-30"
          style={{
            background: playbackRate !== 1 ? "var(--g-accent-soft)" : "var(--g-bg-inset)",
            color: playbackRate !== 1 ? "var(--g-accent-text)" : "var(--g-text-tertiary)",
            border: playbackRate !== 1 ? "1px solid var(--g-accent-medium)" : "1px solid var(--g-border-subtle)",
          }}
          title="Change playback speed"
        >
          {playbackRate}x
        </button>

        {/* Volume */}
        <button
          onClick={toggleMute}
          disabled={!isReady}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-105 disabled:opacity-30"
          style={{ background: "var(--g-bg-inset)", color: isMuted ? "var(--g-grade-f)" : "var(--g-text-secondary)" }}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
});

export default WaveformPlayer;
