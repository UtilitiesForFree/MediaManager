import { Plus, Folder, Camera, Heart, Star, Plane, Mountain, Home, Utensils, Briefcase, Music, Film, Image as ImageIcon, UploadCloud, Loader2 } from "lucide-react";
import { useLibraries } from "@/hooks/useLibraries";
import { useUiStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { NewLibraryDialog } from "./NewLibraryDialog";
import { useDrop } from "react-dnd";
import { MoveCopyDialog } from "../dialogs/MoveCopyDialog";
import { commands } from "@/ipc";
import { useToast } from "@/hooks/use-toast";

export function LibraryList() {
  const { libraries, isLoading } = useLibraries();
  const { currentPath, setCurrentPath } = useUiStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [moveCopyData, setMoveCopyData] = useState<{ items: string[], targetLibrary: any } | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const handleSync = async (libraryId: string) => {
    setSyncingIds(prev => new Set(prev).add(libraryId));
    const res = await commands.syncLibraryToImmich(libraryId);
    setSyncingIds(prev => { const s = new Set(prev); s.delete(libraryId); return s; });
    if (res.ok) {
      const r = res.value;
      toast({
        title: `Synced "${r.albumName}"`,
        description: `${r.uploaded} uploaded, ${r.skipped} already on Immich${r.failed > 0 ? `, ${r.failed} failed` : ""}`,
      });
    } else {
      toast({ title: "Immich sync failed", description: res.error.message, variant: "destructive" });
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-3 border-b bg-muted/20 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Libraries
        </h3>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-5 w-5 hover:bg-muted"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="p-2 text-xs text-muted-foreground italic">Loading...</div>
          ) : libraries.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground italic text-center py-4">
              No libraries yet
            </div>
          ) : (
            libraries.map((lib) => (
              <LibraryRow
                key={lib.id}
                lib={lib}
                isActive={currentPath === lib.path}
                isSyncing={syncingIds.has(lib.id)}
                onClick={() => setCurrentPath(lib.path)}
                onDrop={(items: string[]) => setMoveCopyData({ items, targetLibrary: lib })}
                onSync={() => handleSync(lib.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <NewLibraryDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      {moveCopyData && (
        <MoveCopyDialog 
          open={!!moveCopyData} 
          onOpenChange={(open) => !open && setMoveCopyData(null)}
          items={moveCopyData.items}
          targetLibrary={moveCopyData.targetLibrary}
        />
      )}
    </div>
  );
}

function LibraryRow({ lib, isActive, isSyncing, onClick, onDrop, onSync }: any) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: "media-items",
    drop: (item: { paths: string[] }) => onDrop(item.paths),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }), [lib, onDrop]);

  return (
    <div
      ref={(node) => { drop(node); }}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm transition-colors group cursor-pointer",
        isActive && "bg-accent",
        isOver && "bg-primary/20 ring-1 ring-primary/50"
      )}
      onClick={onClick}
    >
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: lib.color || "transparent" }}
      />
      <LibraryIcon name={lib.icon} className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="truncate flex-1 text-left">{lib.name}</span>
      <button
        className={cn(
          "shrink-0 p-0.5 rounded transition-opacity text-muted-foreground hover:text-foreground",
          isSyncing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        title="Sync to Immich"
        onClick={(e) => { e.stopPropagation(); onSync(); }}
        disabled={isSyncing}
      >
        {isSyncing
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <UploadCloud className="h-3.5 w-3.5" />
        }
      </button>
    </div>
  );
}

function LibraryIcon({ name, className }: { name?: string, className?: string }) {
  const icons: Record<string, any> = {
    Folder, Camera, Heart, Star, Plane, Mountain, Home, Utensils, Briefcase, Music, Film, ImageIcon
  };
  const Icon = (name && icons[name]) || Folder;
  return <Icon className={className} />;
}
