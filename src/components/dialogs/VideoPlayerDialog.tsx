import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX, X, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoPlayerDialogProps {
  path: string | null;
  onClose: () => void;
}

function makeVideoUrl(filePath: string): string {
  // Encode each path segment so spaces/special chars are safe in the URL.
  // Slashes (path separators) are preserved as-is.
  const parts = filePath.split("/");
  return "mediafile://localhost" + parts.map(encodeURIComponent).join("/");
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayerDialog({ path, onClose }: VideoPlayerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filename = path?.split("/").pop() ?? "";

  // Reset state when a new video is opened
  useEffect(() => {
    if (path) {
      setProgress(0);
      setDuration(0);
      setPaused(false);
      setMuted(true);
      setShowControls(true);
    }
  }, [path]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!path) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === " " || e.key === "k") { e.preventDefault(); togglePlay(); }
      if (e.key === "m") { setMuted(m => !m); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path, onClose]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setPaused(false);
    } else {
      videoRef.current.pause();
      setPaused(true);
    }
  };

  const toggleMute = () => {
    setMuted(m => {
      if (videoRef.current) videoRef.current.muted = !m;
      return !m;
    });
  };

  const scheduleHideControls = () => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    setShowControls(true);
    controlsTimer.current = setTimeout(() => setShowControls(false), 2500);
  };

  if (!path) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onMouseMove={scheduleHideControls}
    >
      <div className="relative w-full max-w-5xl mx-4 select-none">
        {/* Video element */}
        <video
          ref={videoRef}
          key={path}
          src={makeVideoUrl(path)}
          autoPlay
          muted={muted}
          className="w-full max-h-[82vh] object-contain rounded-lg"
          onClick={togglePlay}
          onTimeUpdate={() => {
            if (videoRef.current) setProgress(videoRef.current.currentTime);
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) setDuration(videoRef.current.duration);
          }}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onEnded={() => setPaused(true)}
        />

        {/* Top bar: filename + close */}
        <div className={cn(
          "absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3",
          "bg-gradient-to-b from-black/70 to-transparent rounded-t-lg",
          "transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0"
        )}>
          <span className="text-white text-sm font-medium truncate max-w-[80%] drop-shadow">
            {filename}
          </span>
          <button
            className="text-white/70 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Bottom controls */}
        <div className={cn(
          "absolute bottom-0 left-0 right-0 px-4 py-3",
          "bg-gradient-to-t from-black/80 to-transparent rounded-b-lg",
          "transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0"
        )}>
          {/* Seek bar */}
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={progress}
            onChange={(e) => {
              const t = parseFloat(e.target.value);
              if (videoRef.current) videoRef.current.currentTime = t;
              setProgress(t);
            }}
            className="w-full h-1 mb-2 accent-white cursor-pointer"
          />

          <div className="flex items-center gap-3">
            {/* Play / pause */}
            <button
              className="text-white hover:text-white/70 transition-colors"
              onClick={togglePlay}
            >
              {paused
                ? <Play className="h-5 w-5 fill-white" />
                : <Pause className="h-5 w-5 fill-white" />
              }
            </button>

            {/* Timecode */}
            <span className="text-white text-xs font-mono tabular-nums">
              {formatTime(progress)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            {/* Mute toggle — default is muted */}
            <button
              className="text-white hover:text-white/70 transition-colors"
              onClick={toggleMute}
              title={muted ? "Unmute (m)" : "Mute (m)"}
            >
              {muted
                ? <VolumeX className="h-5 w-5" />
                : <Volume2 className="h-5 w-5" />
              }
            </button>
          </div>
        </div>

        {/* Big play/pause indicator on click */}
        {paused && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm">
              <Play className="h-8 w-8 text-white fill-white ml-1" />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
