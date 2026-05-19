import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2,
  Crop, Sun, Contrast, Loader2, RotateCcwSquare,
} from "lucide-react";
import { commands } from "@/ipc";
import { useThumbStore } from "@/stores/thumbStore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  path: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Mode = "transform" | "crop" | "adjust";

interface CropSelection {
  x: number; y: number; w: number; h: number;
}

export function ImageEditorDialog({ path, name, open, onOpenChange }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [mode, setMode] = useState<Mode>("transform");

  // Original file dimensions — needed to map crop display coords → file coords
  const [origDims, setOrigDims] = useState<[number, number] | null>(null);

  // Crop state
  const [cropSel, setCropSel] = useState<CropSelection | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);

  // Adjust state
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);

  const removeThumb = useThumbStore(s => s.removeThumb);
  const { toast } = useToast();

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setCropSel(null);
    const res = await commands.loadImagePreview(path);
    setLoading(false);
    if (res.ok) setPreviewUrl(res.value);
    else toast({ title: "Failed to load image", variant: "destructive" });
  }, [path, toast]);

  useEffect(() => {
    if (open) {
      setMode("transform");
      setBrightness(0);
      setContrast(0);
      setCropSel(null);
      setOrigDims(null);
      loadPreview();
      // Fetch true file dimensions for correct crop coordinate mapping
      commands.getMediaDimensions(path).then(res => {
        if (res.ok && (res.value[0] > 0 || res.value[1] > 0)) {
          setOrigDims(res.value);
        }
      });
    } else {
      setPreviewUrl(null);
      setOrigDims(null);
    }
  }, [open, loadPreview, path]);

  const applyOp = async (op: Parameters<typeof commands.editImage>[1]) => {
    setApplying(true);
    const res = await commands.editImage(path, op);
    setApplying(false);
    if (res.ok) {
      removeThumb(path);
      await loadPreview();
    } else {
      toast({ title: "Edit failed", description: res.error.message, variant: "destructive" });
    }
  };

  // ── Crop drag handlers ───────────────────────────────────────────────────

  const getCropCoords = useCallback((e: React.MouseEvent) => {
    const container = cropContainerRef.current;
    const img = imgRef.current;
    if (!container || !img) return null;
    const rect = img.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    return { x, y };
  }, []);

  const handleCropMouseDown = (e: React.MouseEvent) => {
    if (mode !== "crop") return;
    e.preventDefault();
    const coords = getCropCoords(e);
    if (!coords) return;
    setDragStart(coords);
    setCropSel(null);
  };

  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (mode !== "crop" || !dragStart) return;
    const coords = getCropCoords(e);
    if (!coords) return;
    setCropSel({
      x: Math.min(dragStart.x, coords.x),
      y: Math.min(dragStart.y, coords.y),
      w: Math.abs(coords.x - dragStart.x),
      h: Math.abs(coords.y - dragStart.y),
    });
  };

  const handleCropMouseUp = () => setDragStart(null);

  const applyCrop = async () => {
    if (!cropSel || !imgRef.current) return;
    const img = imgRef.current;
    const rect = img.getBoundingClientRect();
    // Use true file dimensions so the crop maps correctly even when the
    // preview is a downscaled JPEG (max 1400px from load_image_preview).
    const fileW = origDims ? origDims[0] : img.naturalWidth;
    const fileH = origDims ? origDims[1] : img.naturalHeight;
    const scaleX = fileW / rect.width;
    const scaleY = fileH / rect.height;
    await applyOp({
      op: "crop",
      x: Math.round(cropSel.x * scaleX),
      y: Math.round(cropSel.y * scaleY),
      width: Math.round(cropSel.w * scaleX),
      height: Math.round(cropSel.h * scaleY),
    });
    setCropSel(null);
  };

  const applyAdjust = async () => {
    if (brightness !== 0) await applyOp({ op: "brightness", value: brightness });
    if (contrast !== 0) await applyOp({ op: "contrast", value: contrast / 10 });
    setBrightness(0);
    setContrast(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden" style={{ maxHeight: "90vh" }}>
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-sm font-semibold truncate">{name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {/* Sidebar */}
          <div className="w-52 border-r flex flex-col shrink-0 bg-muted/20">
            <ModeTab label="Transform" icon={<RotateCw className="h-4 w-4" />} active={mode === "transform"} onClick={() => setMode("transform")} />
            <ModeTab label="Crop" icon={<Crop className="h-4 w-4" />} active={mode === "crop"} onClick={() => { setMode("crop"); setCropSel(null); }} />
            <ModeTab label="Adjust" icon={<Sun className="h-4 w-4" />} active={mode === "adjust"} onClick={() => setMode("adjust")} />

            <Separator className="my-2" />

            {/* Transform controls */}
            {mode === "transform" && (
              <div className="px-3 space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Rotate</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <IconBtn label="90° CCW" onClick={() => applyOp({ op: "rotate", degrees: 270 })} disabled={applying}>
                    <RotateCcw className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="90° CW" onClick={() => applyOp({ op: "rotate", degrees: 90 })} disabled={applying}>
                    <RotateCw className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="180°" onClick={() => applyOp({ op: "rotate", degrees: 180 })} disabled={applying} className="col-span-2">
                    <RotateCcwSquare className="h-4 w-4" />
                    <span className="text-xs ml-1">180°</span>
                  </IconBtn>
                </div>

                <Separator className="my-2" />

                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Flip</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <IconBtn label="Flip H" onClick={() => applyOp({ op: "flipHorizontal" })} disabled={applying}>
                    <FlipHorizontal2 className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="Flip V" onClick={() => applyOp({ op: "flipVertical" })} disabled={applying}>
                    <FlipVertical2 className="h-4 w-4" />
                  </IconBtn>
                </div>
              </div>
            )}

            {/* Crop controls */}
            {mode === "crop" && (
              <div className="px-3 space-y-3">
                <p className="text-xs text-muted-foreground">Drag on the image to select the crop area.</p>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!cropSel || cropSel.w < 4 || cropSel.h < 4 || applying}
                  onClick={applyCrop}
                >
                  Apply Crop
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setCropSel(null)}
                  disabled={!cropSel}
                >
                  Clear
                </Button>
              </div>
            )}

            {/* Adjust controls */}
            {mode === "adjust" && (
              <div className="px-3 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                      <Sun className="h-3 w-3" /> Brightness
                    </p>
                    <span className="text-xs text-muted-foreground">{brightness > 0 ? `+${brightness}` : brightness}</span>
                  </div>
                  <Slider value={[brightness]} min={-100} max={100} step={5} onValueChange={([v]) => setBrightness(v)} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                      <Contrast className="h-3 w-3" /> Contrast
                    </p>
                    <span className="text-xs text-muted-foreground">{contrast > 0 ? `+${contrast}` : contrast}</span>
                  </div>
                  <Slider value={[contrast]} min={-50} max={50} step={5} onValueChange={([v]) => setContrast(v)} />
                </div>
                <Button
                  size="sm"
                  className="w-full mt-2"
                  disabled={(brightness === 0 && contrast === 0) || applying}
                  onClick={applyAdjust}
                >
                  Apply Adjustments
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setBrightness(0); setContrast(0); }}
                  disabled={brightness === 0 && contrast === 0}
                >
                  Reset
                </Button>
              </div>
            )}
          </div>

          {/* Preview area */}
          <div className="flex-1 flex items-center justify-center bg-black/60 overflow-hidden relative select-none">
            {(loading || applying) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            )}

            {previewUrl && (
              <div
                ref={cropContainerRef}
                className={cn("relative inline-block", mode === "crop" && "cursor-crosshair")}
                style={{ maxWidth: "100%", maxHeight: "100%" }}
                onMouseDown={handleCropMouseDown}
                onMouseMove={handleCropMouseMove}
                onMouseUp={handleCropMouseUp}
                onMouseLeave={handleCropMouseUp}
              >
                <img
                  ref={imgRef}
                  src={previewUrl}
                  alt={name}
                  draggable={false}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "calc(90vh - 120px)",
                    objectFit: "contain",
                    display: "block",
                    filter: mode === "adjust"
                      ? `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 50})`
                      : undefined,
                  }}
                />

                {/* Crop overlay */}
                {mode === "crop" && cropSel && cropSel.w > 2 && cropSel.h > 2 && (
                  <>
                    {/* Dimmed areas */}
                    <div className="absolute inset-0 bg-black/50 pointer-events-none" />
                    {/* Clear crop rectangle */}
                    <div
                      className="absolute border-2 border-white/90 pointer-events-none shadow-lg"
                      style={{
                        left: cropSel.x,
                        top: cropSel.y,
                        width: cropSel.w,
                        height: cropSel.h,
                        boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                        background: "transparent",
                      }}
                    >
                      {/* Corner handles */}
                      {[
                        { top: -3, left: -3 }, { top: -3, right: -3 },
                        { bottom: -3, left: -3 }, { bottom: -3, right: -3 },
                      ].map((style, i) => (
                        <div
                          key={i}
                          className="absolute w-2.5 h-2.5 bg-white rounded-sm"
                          style={style as React.CSSProperties}
                        />
                      ))}
                      {/* Rule-of-thirds grid lines */}
                      <div className="absolute inset-0 opacity-40">
                        <div className="absolute border-white/50" style={{ left: "33%", top: 0, bottom: 0, borderLeftWidth: 1 }} />
                        <div className="absolute border-white/50" style={{ left: "66%", top: 0, bottom: 0, borderLeftWidth: 1 }} />
                        <div className="absolute border-white/50" style={{ top: "33%", left: 0, right: 0, borderTopWidth: 1 }} />
                        <div className="absolute border-white/50" style={{ top: "66%", left: 0, right: 0, borderTopWidth: 1 }} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModeTab({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left",
        active
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function IconBtn({ label, onClick, disabled, children, className }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("h-9 flex items-center justify-center gap-1", className)}
    >
      {children}
    </Button>
  );
}
