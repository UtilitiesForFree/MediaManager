import { FolderInput, Copy, Trash2, X, Image as ImageIcon, Film, FileDigit, Undo2, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToastAction } from "@/components/ui/toast";
import { useSelectionStore } from "@/stores/selectionStore";
import { useUiStore } from "@/stores/uiStore";
import { useLibraries } from "@/hooks/useLibraries";
import { commands, MediaItem } from "@/ipc";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SelectionToolbarProps {
  selectedPaths: string[];
  items: MediaItem[];
  onOpenLibraryPicker: (mode: "move" | "copy") => void;
}

export function SelectionToolbar({ selectedPaths, items, onOpenLibraryPicker }: SelectionToolbarProps) {
  const { clear, keepOnly } = useSelectionStore();
  const { lastUsedLibraryId, setLastUsedLibraryId } = useUiStore();
  const { libraries } = useLibraries();
  const { toast } = useToast();

  const count = selectedPaths.length;
  if (count === 0) return null;

  const lastUsedLib = lastUsedLibraryId ? libraries.find(l => l.id === lastUsedLibraryId) : null;
  const otherLibraries = libraries.filter(l => l.id !== lastUsedLibraryId);

  const handleMove = async (libraryId: string) => {
    setLastUsedLibraryId(libraryId);
    const res = await commands.moveToLibrary(selectedPaths, libraryId, "rename");
    const lib = libraries.find(l => l.id === libraryId);
    if (res.ok) {
      clear();
      toast({
        title: `Moved ${count} item${count > 1 ? "s" : ""} to ${lib?.name ?? "library"}`,
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
    const res = await commands.copyToLibrary(selectedPaths, libraryId, "rename");
    const lib = libraries.find(l => l.id === libraryId);
    if (res.ok) {
      toast({ title: `Copied ${count} item${count > 1 ? "s" : ""} to ${lib?.name ?? "library"}` });
    } else {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleTrash = async () => {
    const res = await commands.trashItems(selectedPaths);
    if (res.ok) {
      clear();
      toast({ title: `Moved ${count} item${count > 1 ? "s" : ""} to trash` });
    } else {
      toast({ title: "Trash failed", variant: "destructive" });
    }
  };

  const filterByKind = (kind: "image" | "video" | "raw") => {
    const matching = items.filter(i => i.kind === kind).map(i => i.path);
    keepOnly(matching);
  };

  const selectedItems = items.filter(i => selectedPaths.includes(i.path));
  const hasImages = selectedItems.some(i => i.kind === "image");
  const hasVideos = selectedItems.some(i => i.kind === "video");
  const hasRaw = selectedItems.some(i => i.kind === "raw");

  const LibraryMenu = ({ mode }: { mode: "move" | "copy" }) => (
    <DropdownMenuContent align="center" className="w-52">
      {lastUsedLib && (
        <>
          <DropdownMenuItem
            className="gap-2 font-medium"
            onClick={() => mode === "move" ? handleMove(lastUsedLib.id) : handleCopy(lastUsedLib.id)}
          >
            <Library className="h-3.5 w-3.5 text-primary" />
            <span className="flex-1 truncate">{lastUsedLib.name}</span>
            <span className="text-[10px] text-muted-foreground ml-1">↵</span>
          </DropdownMenuItem>
          {otherLibraries.length > 0 && <DropdownMenuSeparator />}
        </>
      )}
      {otherLibraries.length === 0 && !lastUsedLib && (
        <DropdownMenuItem disabled>No libraries yet</DropdownMenuItem>
      )}
      {otherLibraries.map(lib => (
        <DropdownMenuItem
          key={lib.id}
          className="gap-2"
          onClick={() => mode === "move" ? handleMove(lib.id) : handleCopy(lib.id)}
        >
          <Library className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate">{lib.name}</span>
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem className="gap-2 text-muted-foreground" onClick={() => onOpenLibraryPicker(mode)}>
        Browse all…
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-3 py-2 rounded-2xl border border-border/60 bg-card/90 glass shadow-2xl shadow-black/20 animate-in slide-in-from-bottom-3 duration-200">
      {/* Selection count */}
      <div className="flex items-center gap-1.5 pr-2 border-r border-border mr-1">
        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <span className="text-[9px] font-bold text-primary-foreground">{count > 99 ? "99+" : count}</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">selected</span>
      </div>

      {/* Kind filter chips — only show if selection has multiple kinds */}
      {(hasImages || hasVideos || hasRaw) && (hasImages ? 1 : 0) + (hasVideos ? 1 : 0) + (hasRaw ? 1 : 0) > 1 && (
        <div className="flex items-center gap-1 pr-2 border-r border-border mr-1">
          {hasImages && (
            <KindChip icon={<ImageIcon className="h-3 w-3" />} label="Images" onClick={() => filterByKind("image")} />
          )}
          {hasVideos && (
            <KindChip icon={<Film className="h-3 w-3" />} label="Videos" onClick={() => filterByKind("video")} />
          )}
          {hasRaw && (
            <KindChip icon={<FileDigit className="h-3 w-3" />} label="RAW" onClick={() => filterByKind("raw")} />
          )}
        </div>
      )}

      {/* Move to Library */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs font-medium px-2.5 hover:bg-primary/10 hover:text-primary">
            <FolderInput className="h-3.5 w-3.5" />
            Move
          </Button>
        </DropdownMenuTrigger>
        <LibraryMenu mode="move" />
      </DropdownMenu>

      {/* Copy to Library */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs font-medium px-2.5 hover:bg-primary/10 hover:text-primary">
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
        </DropdownMenuTrigger>
        <LibraryMenu mode="copy" />
      </DropdownMenu>

      {/* Undo last move */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs font-medium px-2.5 hover:bg-muted"
        onClick={async () => {
          const res = await commands.undoLastMove();
          if (res.ok) toast({ title: "Move undone" });
          else toast({ title: "Nothing to undo", variant: "destructive" });
        }}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Trash */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs font-medium px-2.5 hover:bg-destructive/10 hover:text-destructive"
        onClick={handleTrash}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      {/* Deselect */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 hover:bg-muted"
        onClick={clear}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function KindChip({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors",
        "border-border/60 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40"
      )}
      title={`Keep only ${label}`}
    >
      {icon}
      {label}
    </button>
  );
}
