import { useThumbnail } from "@/hooks/useThumbnail";
import { Film, Image as ImageIcon, FileDigit, AlertCircle, Play, Check, FolderInput, Copy, ExternalLink, Trash2, Library } from "lucide-react";
import { MediaKind } from "@/ipc";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useDrag, DragPreviewImage } from "react-dnd";
import { ToastAction } from "@/components/ui/toast";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useLibraries } from "@/hooks/useLibraries";
import { commands } from "@/ipc";
import { useSelectionStore } from "@/stores/selectionStore";
import { useUiStore } from "@/stores/uiStore";
import { useToast } from "@/hooks/use-toast";
import { useThumbStore } from "@/stores/thumbStore";

interface ThumbnailProps {
  path: string;
  name: string;
  kind: MediaKind;
  size: number;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  selectedPaths: string[];
  allPaths: string[];
  duration?: number;
}

export function Thumbnail({ path, name, kind, size, isSelected, onClick, selectedPaths, allPaths, duration }: ThumbnailProps) {
  const { url, failed } = useThumbnail(path, size);
  const [loaded, setLoaded] = useState(false);
  const { libraries } = useLibraries();
  const { selectAll, toggle } = useSelectionStore();
  const { lastUsedLibraryId, setLastUsedLibraryId } = useUiStore();
  const { toast } = useToast();
  const thumbUrls = useThumbStore(s => s.urls);

  const ext = name.split(".").pop()?.toLowerCase();
  const isRaw = kind === "raw";
  const isGif = ext === "gif";
  const isHeic = ext === "heic" || ext === "heif";

  const actionPaths = isSelected && selectedPaths.length > 1 ? selectedPaths : [path];

  // Build custom drag preview (stack of first 3 thumbnails + badge)
  const previewPaths = isSelected ? selectedPaths.slice(0, 3) : [path];
  const overflowCount = isSelected ? Math.max(0, selectedPaths.length - 3) : 0;

  const getDragPreview = () => {
    const canvas = document.createElement("canvas");
    const tileSize = 72;
    const offset = 8;
    const count = previewPaths.length;
    canvas.width = tileSize + offset * (count - 1) + (overflowCount > 0 ? 28 : 0);
    canvas.height = tileSize + offset * (count - 1);
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    for (let i = count - 1; i >= 0; i--) {
      const p = previewPaths[i];
      const imgUrl = thumbUrls.get(p);
      const x = offset * i;
      const y = offset * i;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      if (imgUrl) {
        const img = new Image();
        img.src = imgUrl;
        ctx.drawImage(img, x, y, tileSize, tileSize);
      } else {
        ctx.fillStyle = "hsl(224 18% 16%)";
        ctx.fillRect(x, y, tileSize, tileSize);
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
    }

    if (overflowCount > 0) {
      const bx = tileSize + offset * (count - 1);
      const by = 0;
      ctx.fillStyle = "hsl(221 83% 53%)";
      ctx.beginPath();
      ctx.roundRect(bx, by, 26, 18, 9);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`+${overflowCount}`, bx + 13, by + 9);
    }

    return canvas;
  };

  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: "media-items",
    item: () => {
      const canvas = getDragPreview();
      return { paths: isSelected ? selectedPaths : [path], previewCanvas: canvas };
    },
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
  }), [path, isSelected, selectedPaths, thumbUrls]);

  // Use empty image as preview so react-dnd doesn't render its own (we handle it natively via canvas)
  const emptyImg = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

  const lastUsedLib = lastUsedLibraryId ? libraries.find(l => l.id === lastUsedLibraryId) : null;
  const otherLibraries = libraries.filter(l => l.id !== lastUsedLibraryId);

  const handleMove = async (libraryId: string) => {
    setLastUsedLibraryId(libraryId);
    const res = await commands.moveToLibrary(actionPaths, libraryId, "rename");
    const lib = libraries.find(l => l.id === libraryId);
    if (res.ok) {
      toast({
        title: `Moved ${actionPaths.length} item${actionPaths.length > 1 ? "s" : ""} to ${lib?.name ?? "library"}`,
        action: (
          <ToastAction altText="Undo" onClick={async () => {
            await commands.undoLastMove();
            toast({ title: "Move undone" });
          }}>
            Undo
          </ToastAction>
        ),
      });
    } else {
      toast({ title: "Move failed", variant: "destructive" });
    }
  };

  const handleCopy = async (libraryId: string) => {
    setLastUsedLibraryId(libraryId);
    const res = await commands.copyToLibrary(actionPaths, libraryId, "rename");
    const lib = libraries.find(l => l.id === libraryId);
    if (res.ok) {
      toast({ title: `Copied ${actionPaths.length} item${actionPaths.length > 1 ? "s" : ""} to ${lib?.name ?? "library"}` });
    } else {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleTrash = async () => {
    const res = await commands.trashItems(actionPaths);
    if (res.ok) {
      toast({ title: `Moved ${actionPaths.length} item${actionPaths.length > 1 ? "s" : ""} to trash` });
    } else {
      toast({ title: "Trash failed", variant: "destructive" });
    }
  };

  const LibrarySubMenu = ({ mode }: { mode: "move" | "copy" }) => (
    <ContextMenuSubContent className="w-48">
      {lastUsedLib && (
        <>
          <ContextMenuItem
            className="gap-2 font-medium"
            onClick={() => mode === "move" ? handleMove(lastUsedLib.id) : handleCopy(lastUsedLib.id)}
          >
            <Library className="h-3.5 w-3.5 text-primary" />
            <span className="flex-1 truncate">{lastUsedLib.name}</span>
            <span className="text-[10px] text-muted-foreground">↵</span>
          </ContextMenuItem>
          {otherLibraries.length > 0 && <ContextMenuSeparator />}
        </>
      )}
      {libraries.length === 0 ? (
        <ContextMenuItem disabled>No libraries yet</ContextMenuItem>
      ) : (
        otherLibraries.map(lib => (
          <ContextMenuItem
            key={lib.id}
            className="gap-2"
            onClick={() => mode === "move" ? handleMove(lib.id) : handleCopy(lib.id)}
          >
            <Library className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{lib.name}</span>
          </ContextMenuItem>
        ))
      )}
    </ContextMenuSubContent>
  );

  return (
    <>
      <DragPreviewImage connect={preview} src={emptyImg} />
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={(node) => { drag(node); }}
            className={cn(
              "flex flex-col group cursor-pointer transition-all select-none",
              isDragging && "opacity-40 scale-95"
            )}
            style={{ width: `${size}px` }}
            onClick={onClick}
          >
            <div
              className={cn(
                "relative rounded-xl overflow-hidden flex items-center justify-center transition-all duration-150",
                isSelected
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/20"
                  : "bg-muted/40 group-hover:bg-muted/70 group-hover:shadow-md group-hover:shadow-black/10"
              )}
              style={{ height: `${size}px`, width: `${size}px` }}
            >
              {url && !failed ? (
                <>
                  <img
                    src={url}
                    alt={name}
                    className={cn(
                      "w-full h-full object-cover transition-opacity duration-300",
                      loaded ? "opacity-100" : "opacity-0"
                    )}
                    onLoad={() => setLoaded(true)}
                    loading="lazy"
                    decoding="async"
                  />
                  {kind === "video" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/25 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm border border-white/20 shadow-lg">
                        <Play className="h-4 w-4 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center">
                  <MediaIcon kind={kind} />
                  {failed && (
                    <AlertCircle className="absolute top-1 right-1 h-3 w-3 text-destructive" />
                  )}
                </div>
              )}

              {/* Checkbox */}
              <div
                className={cn(
                  "absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150",
                  isSelected
                    ? "bg-primary border-primary opacity-100 scale-100"
                    : "bg-black/30 border-white/60 opacity-0 group-hover:opacity-100 backdrop-blur-sm scale-90 group-hover:scale-100"
                )}
                onClick={(e) => { e.stopPropagation(); toggle(path); }}
              >
                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>

              {/* Kind badges */}
              <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
                {isRaw && <Badge label="RAW" color="bg-purple-500" />}
                {isGif && <Badge label="GIF" color="bg-orange-500" />}
                {isHeic && failed && <Badge label="HEIC" color="bg-blue-500" />}
              </div>

              {kind === "video" && (
                <div className="absolute bottom-1.5 right-1.5 bg-black/65 text-[9px] font-bold text-white px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                  {formatDuration(duration)}
                </div>
              )}

              {/* Hover shimmer on unloaded */}
              {!loaded && !failed && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse" />
              )}
            </div>

            <div className="mt-1.5 text-[11px] truncate px-1 text-center text-muted-foreground group-hover:text-foreground/80 transition-colors" title={name}>
              {name}
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-52">
          {actionPaths.length > 1 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground border-b mb-1 flex items-center gap-1.5">
              <Check className="h-3 w-3" />
              {actionPaths.length} items selected
            </div>
          )}

          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2">
              <FolderInput className="h-4 w-4" /> Move to Library
            </ContextMenuSubTrigger>
            <LibrarySubMenu mode="move" />
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2">
              <Copy className="h-4 w-4" /> Copy to Library
            </ContextMenuSubTrigger>
            <LibrarySubMenu mode="copy" />
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuItem className="gap-2" onClick={() => selectAll(allPaths)}>
            <Check className="h-4 w-4" /> Select All
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem className="gap-2" onClick={() => commands.revealInFinder(path)}>
            <ExternalLink className="h-4 w-4" /> Reveal in Finder
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onClick={handleTrash}
          >
            <Trash2 className="h-4 w-4" /> Move to Trash
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={cn("text-[8px] font-black text-white px-1 py-0.5 rounded-md shadow-sm", color)}>
      {label}
    </span>
  );
}

function formatDuration(seconds?: number) {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function MediaIcon({ kind }: { kind: MediaKind }) {
  switch (kind) {
    case "image": return <ImageIcon className="h-8 w-8 text-blue-500/40" />;
    case "video": return <Film className="h-8 w-8 text-slate-500/40" />;
    case "raw":
      return (
        <div className="flex flex-col items-center">
          <FileDigit className="h-8 w-8 text-purple-500/40" />
          <span className="text-[10px] font-bold text-purple-500/40 mt-1">RAW</span>
        </div>
      );
    default: return <FileDigit className="h-8 w-8 text-muted-foreground/30" />;
  }
}
