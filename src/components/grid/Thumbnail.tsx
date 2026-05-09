import { useThumbnail } from "@/hooks/useThumbnail";
import { Film, Image as ImageIcon, FileDigit, AlertCircle, Play, Check, FolderInput, Copy, ExternalLink, Trash2 } from "lucide-react";
import { MediaKind } from "@/ipc";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useDrag } from "react-dnd";
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
import { useToast } from "@/hooks/use-toast";

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
  const { selectAll } = useSelectionStore();
  const { toast } = useToast();

  const ext = name.split(".").pop()?.toLowerCase();
  const isRaw = kind === "raw";
  const isGif = ext === "gif";
  const isHeic = ext === "heic" || ext === "heif";

  // Paths that will be acted on: if right-clicked item is selected, act on whole selection; otherwise just this item
  const actionPaths = isSelected && selectedPaths.length > 1 ? selectedPaths : [path];

  const [{ isDragging }, drag] = useDrag(() => ({
    type: "media-items",
    item: () => ({ paths: isSelected ? selectedPaths : [path] }),
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
  }), [path, isSelected, selectedPaths]);

  const handleMove = async (libraryId: string) => {
    const res = await commands.moveToLibrary(actionPaths, libraryId, "rename");
    if (res.ok) {
      toast({ title: `Moved ${actionPaths.length} item${actionPaths.length > 1 ? "s" : ""} to library` });
    } else {
      toast({ title: "Move failed", variant: "destructive" });
    }
  };

  const handleCopy = async (libraryId: string) => {
    const res = await commands.copyToLibrary(actionPaths, libraryId, "rename");
    if (res.ok) {
      toast({ title: `Copied ${actionPaths.length} item${actionPaths.length > 1 ? "s" : ""} to library` });
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={(node) => { drag(node); }}
          className={cn(
            "flex flex-col group cursor-pointer transition-opacity select-none",
            isDragging && "opacity-40"
          )}
          style={{ width: `${size}px` }}
          onClick={onClick}
        >
          <div
            className={cn(
              "relative rounded-md overflow-hidden flex items-center justify-center transition-all",
              isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "bg-muted/50 group-hover:bg-muted"
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
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm border border-white/20">
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

            {/* Checkbox — visible on hover or when selected */}
            <div
              className={cn(
                "absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                isSelected
                  ? "bg-primary border-primary opacity-100"
                  : "bg-black/30 border-white/60 opacity-0 group-hover:opacity-100 backdrop-blur-sm"
              )}
              onClick={(e) => { e.stopPropagation(); onClick(e); }}
            >
              {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>

            {/* Kind badges */}
            <div className="absolute top-1 right-1 flex flex-col gap-1">
              {isRaw && <Badge label="RAW" color="bg-purple-600" />}
              {isGif && <Badge label="GIF" color="bg-orange-500" />}
              {isHeic && failed && <Badge label="HEIC" color="bg-blue-600" />}
            </div>

            {kind === "video" && (
              <div className="absolute bottom-1 right-1 bg-black/60 text-[9px] font-bold text-white px-1.5 py-0.5 rounded backdrop-blur-sm border border-white/10">
                {formatDuration(duration)}
              </div>
            )}
          </div>

          <div className="mt-1.5 text-[11px] truncate px-1 text-center text-muted-foreground group-hover:text-foreground transition-colors" title={name}>
            {name}
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        {actionPaths.length > 1 && (
          <div className="px-2 py-1 text-xs text-muted-foreground border-b mb-1">
            {actionPaths.length} items selected
          </div>
        )}

        {/* Move to Library */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <FolderInput className="h-4 w-4" /> Move to Library
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            {libraries.length === 0 ? (
              <ContextMenuItem disabled>No libraries yet</ContextMenuItem>
            ) : (
              libraries.map(lib => (
                <ContextMenuItem key={lib.id} onClick={() => handleMove(lib.id)}>
                  {lib.name}
                </ContextMenuItem>
              ))
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>

        {/* Copy to Library */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <Copy className="h-4 w-4" /> Copy to Library
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            {libraries.length === 0 ? (
              <ContextMenuItem disabled>No libraries yet</ContextMenuItem>
            ) : (
              libraries.map(lib => (
                <ContextMenuItem key={lib.id} onClick={() => handleCopy(lib.id)}>
                  {lib.name}
                </ContextMenuItem>
              ))
            )}
          </ContextMenuSubContent>
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
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={cn("text-[8px] font-black text-white px-1 rounded shadow-sm", color)}>
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
    case "image": return <ImageIcon className="h-8 w-8 text-blue-500/50" />;
    case "video": return <Film className="h-8 w-8 text-gray-500/50" />;
    case "raw":
      return (
        <div className="flex flex-col items-center">
          <FileDigit className="h-8 w-8 text-purple-500/50" />
          <span className="text-[10px] font-bold text-purple-500/50 mt-1">RAW</span>
        </div>
      );
    default: return <FileDigit className="h-8 w-8 text-muted-foreground/30" />;
  }
}
