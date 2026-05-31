import { Plus, Folder, Camera, Heart, Star, Plane, Mountain, Home, Utensils, Briefcase, Music, Film, Image as ImageIcon, UploadCloud, Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { useLibraries } from "@/hooks/useLibraries";
import { useUiStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import React, { useState } from "react";
import { NewLibraryDialog } from "./NewLibraryDialog";
import { useDrop } from "react-dnd";
import { MoveCopyDialog } from "../dialogs/MoveCopyDialog";
import { commands } from "@/ipc";
import { useToast } from "@/hooks/use-toast";
import type { FolderNode } from "@/ipc/types";

const MAX_FOLDER_DEPTH = 3;

export function LibraryList() {
  const { libraries, isLoading } = useLibraries();
  const { currentPath, setCurrentPath } = useUiStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [moveCopyData, setMoveCopyData] = useState<{ items: string[], targetLibrary: any } | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const { toast } = useToast();

  // Unified path-keyed expansion state for both library rows and folder rows
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [folderMap, setFolderMap] = useState<Map<string, FolderNode[]>>(new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());

  const togglePath = async (path: string) => {
    const isExpanded = expandedPaths.has(path);
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (isExpanded) next.delete(path); else next.add(path);
      return next;
    });

    if (!isExpanded && !folderMap.has(path)) {
      setLoadingPaths(prev => new Set(prev).add(path));
      const res = await commands.listDirectory(path);
      setLoadingPaths(prev => { const s = new Set(prev); s.delete(path); return s; });
      if (res.ok) {
        setFolderMap(prev => new Map(prev).set(path, res.value.filter(f => !f.isLibrary)));
      }
    }
  };

  const renderFolderRows = (folders: FolderNode[], depth: number): React.ReactNode[] => {
    if (depth > MAX_FOLDER_DEPTH) return [];
    return folders.flatMap(folder => {
      const isExpanded = expandedPaths.has(folder.path);
      const children = folderMap.get(folder.path) ?? [];
      const hasActiveChild = !!(currentPath && currentPath !== folder.path && currentPath.startsWith(folder.path + "/"));

      const rows: React.ReactNode[] = [
        <FolderRow
          key={folder.path}
          folder={folder}
          depth={depth}
          isActive={currentPath === folder.path}
          hasActiveChild={hasActiveChild}
          isExpanded={isExpanded}
          isLoading={loadingPaths.has(folder.path)}
          onClick={() => setCurrentPath(folder.path)}
          onToggle={() => togglePath(folder.path)}
        />,
      ];

      if (isExpanded && depth < MAX_FOLDER_DEPTH) {
        rows.push(...renderFolderRows(children, depth + 1));
      }

      return rows;
    });
  };

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

  const handleSyncAll = async () => {
    if (libraries.length === 0 || syncingAll) return;
    setSyncingAll(true);
    let totalUploaded = 0, totalSkipped = 0, totalFailed = 0, errors = 0;
    for (const lib of libraries) {
      setSyncingIds(prev => new Set(prev).add(lib.id));
      const res = await commands.syncLibraryToImmich(lib.id);
      setSyncingIds(prev => { const s = new Set(prev); s.delete(lib.id); return s; });
      if (res.ok) {
        totalUploaded += res.value.uploaded;
        totalSkipped += res.value.skipped;
        totalFailed += res.value.failed;
      } else {
        errors++;
      }
    }
    setSyncingAll(false);
    toast({
      title: `All libraries synced (${libraries.length - errors}/${libraries.length})`,
      description: `${totalUploaded} uploaded, ${totalSkipped} already on Immich${totalFailed > 0 ? `, ${totalFailed} failed` : ""}${errors > 0 ? `, ${errors} libraries errored` : ""}`,
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-3 border-b bg-muted/20 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Libraries
        </h3>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 hover:bg-muted"
            title="Sync all libraries to Immich"
            disabled={syncingAll || libraries.length === 0}
            onClick={handleSyncAll}
          >
            {syncingAll
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <UploadCloud className="h-3 w-3" />
            }
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 hover:bg-muted"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {isLoading ? (
            <div className="p-2 text-xs text-muted-foreground italic">Loading...</div>
          ) : libraries.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground italic text-center py-4">
              No libraries yet
            </div>
          ) : (
            libraries.flatMap((lib) => {
              const isExpanded = expandedPaths.has(lib.path);
              const folders = folderMap.get(lib.path) ?? [];
              const hasActiveFolderChild = !!(currentPath && currentPath !== lib.path && currentPath.startsWith(lib.path + "/"));

              const rows: React.ReactNode[] = [
                <LibraryRow
                  key={lib.id}
                  lib={lib}
                  isActive={currentPath === lib.path}
                  hasActiveFolderChild={hasActiveFolderChild}
                  isSyncing={syncingIds.has(lib.id)}
                  isExpanded={isExpanded}
                  isLoadingFolders={loadingPaths.has(lib.path)}
                  onClick={() => setCurrentPath(lib.path)}
                  onToggleExpand={() => togglePath(lib.path)}
                  onDrop={(items: string[]) => setMoveCopyData({ items, targetLibrary: lib })}
                  onSync={() => handleSync(lib.id)}
                />,
              ];

              if (isExpanded) {
                rows.push(...renderFolderRows(folders, 1));
              }

              return rows;
            })
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

function LibraryRow({ lib, isActive, hasActiveFolderChild, isSyncing, isExpanded, isLoadingFolders, onClick, onToggleExpand, onDrop, onSync }: any) {
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
        "w-full flex items-center gap-1 px-1 py-1.5 text-sm rounded-sm transition-colors group cursor-pointer",
        (isActive || hasActiveFolderChild) && "bg-accent",
        isOver && "bg-primary/20 ring-1 ring-primary/50"
      )}
      onClick={onClick}
    >
      <button
        className="w-5 h-5 flex items-center justify-center shrink-0 rounded-sm hover:bg-muted-foreground/20"
        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
      >
        {isLoadingFolders
          ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          : isExpanded
            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground" />
        }
      </button>
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: lib.color || "transparent" }}
      />
      <LibraryIcon name={lib.icon} className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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

interface FolderRowProps {
  folder: FolderNode;
  depth: number;
  isActive: boolean;
  hasActiveChild: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  onClick: () => void;
  onToggle: () => void;
}

function FolderRow({ folder, depth, isActive, hasActiveChild, isExpanded, isLoading, onClick, onToggle }: FolderRowProps) {
  // depth 1 = 20px, depth 2 = 34px, depth 3 = 48px
  const paddingLeft = 6 + depth * 14;
  const canExpand = folder.hasChildren && depth < MAX_FOLDER_DEPTH;

  return (
    <div
      style={{ paddingLeft, paddingRight: 8 }}
      className={cn(
        "flex items-center gap-1.5 py-1 text-sm rounded-sm transition-colors cursor-pointer",
        (isActive || hasActiveChild) ? "bg-accent" : "hover:bg-accent/50"
      )}
      onClick={onClick}
    >
      {canExpand ? (
        <button
          className="w-4 h-4 flex items-center justify-center shrink-0 rounded-sm hover:bg-muted-foreground/20"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {isLoading
            ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            : isExpanded
              ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          }
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <Folder className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-blue-400" : "text-blue-400/60")} />
      <span className={cn(
        "truncate flex-1 text-left text-sm",
        isActive ? "text-foreground" : "text-muted-foreground"
      )}>
        {folder.name}
      </span>
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
