import React, { useState, useEffect, useRef, useCallback } from "react";
import { Tree } from "react-arborist";
import { Folder, FolderOpen, ChevronRight, ChevronDown, Monitor, Home, Star, Pencil, Trash2 } from "lucide-react";
import { commands } from "@/ipc";
import { useUiStore } from "@/stores/uiStore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function FolderTree() {
  const { setCurrentPath } = useUiStore();
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);

  // Rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; path: string; name: string } | null>(null);

  useEffect(() => {
    const loadRoots = async () => {
      const res = await commands.listRoots();
      if (res.ok) {
        setData(res.value.map(r => ({
          id: r.path,
          name: r.name,
          hasChildren: r.hasChildren,
          isLibrary: r.isLibrary,
          path: r.path,
          children: r.hasChildren ? [] : undefined,
        })));
      }
      setLoading(false);
    };
    loadRoots();

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) setHeight(entries[0].contentRect.height);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const onToggle = async (id: string) => {
    const findNode = (items: any[]): any | null => {
      for (const item of items) {
        if (item.id === id) return item;
        if (item.children) {
          const found = findNode(item.children);
          if (found) return found;
        }
      }
      return null;
    };

    const nodeData = findNode(data);
    if (!nodeData || !nodeData.hasChildren || (nodeData.children && nodeData.children.length > 0)) return;

    const res = await commands.listDirectory(id);
    if (res.ok) {
      const children = res.value.map(n => ({
        id: n.path,
        name: n.name,
        hasChildren: n.hasChildren,
        isLibrary: n.isLibrary,
        path: n.path,
        children: n.hasChildren ? [] : undefined,
      }));

      setData(prev => {
        const updateNode = (items: any[]): any[] =>
          items.map(item => {
            if (item.id === id) return { ...item, children };
            if (item.children) return { ...item, children: updateNode(item.children) };
            return item;
          });
        return updateNode(prev);
      });
    }
  };

  const applyRenameInTree = (items: any[], id: string, newName: string, newPath: string): any[] =>
    items.map(item => {
      if (item.id === id) return { ...item, id: newPath, name: newName, path: newPath };
      if (item.children) return { ...item, children: applyRenameInTree(item.children, id, newName, newPath) };
      return item;
    });

  const removeFromTree = (items: any[], id: string): any[] =>
    items
      .filter(item => item.id !== id)
      .map(item => item.children ? { ...item, children: removeFromTree(item.children, id) } : item);

  const commitRename = useCallback(async (id: string, newName: string) => {
    setEditingId(null);
    const trimmed = newName.trim();
    if (!trimmed) return;

    // Extract current name from id (which is the path)
    const currentName = id.split("/").pop() || id.split("\\").pop() || "";
    if (trimmed === currentName) return;

    const res = await commands.renameDirectory(id, trimmed);
    if (res.ok) {
      const newPath = res.value;
      setData(prev => applyRenameInTree(prev, id, trimmed, newPath));
      toast({ title: `Renamed to "${trimmed}"` });
    } else {
      toast({ title: "Rename failed", description: res.error.message, variant: "destructive" });
    }
  }, [toast]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    setDeleteTarget(null);

    const res = await commands.deleteDirectory(id);
    if (res.ok) {
      setData(prev => removeFromTree(prev, id));
      toast({ title: `"${name}" moved to Trash` });
    } else {
      toast({ title: "Delete failed", description: res.error.message, variant: "destructive" });
    }
  }, [deleteTarget, toast]);

  // Build the node renderer as a closure so it captures state callbacks
  const NodeRenderer = useCallback(({ node, style, dragHandle }: any) => {
    const isRoot = node.level === 0;
    const isEditing = editingId === node.id;
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (isEditing) {
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 30);
      }
    }, [isEditing]);

    const Icon = node.data.name === "Root"
      ? Monitor
      : node.data.name === "Home"
        ? Home
        : node.isOpen ? FolderOpen : Folder;

    const handleChevronClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      node.toggle();
    };

    const handleRowClick = () => {
      if (isEditing) return;
      node.select();
      if (node.data.hasChildren) node.toggle();
    };

    const startEdit = () => {
      setEditingName(node.data.name);
      setEditingId(node.id);
    };

    const startDelete = () => {
      setDeleteTarget({ id: node.id, path: node.data.path, name: node.data.name });
    };

    const row = (
      <div
        style={style}
        ref={dragHandle}
        className={cn(
          "flex items-center gap-1.5 px-2 cursor-pointer hover:bg-accent rounded-sm transition-colors group",
          node.isSelected && "bg-accent"
        )}
        onClick={handleRowClick}
      >
        <div
          className="w-4 h-4 flex items-center justify-center hover:bg-muted-foreground/20 rounded-sm shrink-0"
          onClick={handleChevronClick}
        >
          {node.data.hasChildren && (
            node.isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Icon className={cn("h-4 w-4 shrink-0", node.data.isLibrary ? "text-yellow-500" : "text-blue-500")} />

          {isEditing ? (
            <input
              ref={inputRef}
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              onBlur={() => commitRename(node.id, editingName)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); commitRename(node.id, editingName); }
                if (e.key === "Escape") { e.preventDefault(); setEditingId(null); }
                e.stopPropagation();
              }}
              onClick={e => e.stopPropagation()}
              className="flex-1 min-w-0 text-sm bg-background border border-primary rounded px-1 py-0 h-5 outline-none ring-1 ring-primary"
            />
          ) : (
            <span className="text-sm truncate select-none flex-1" title={node.data.path}>
              {node.data.name}
            </span>
          )}

          {node.data.isLibrary && !isEditing && (
            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
          )}
        </div>
      </div>
    );

    // No context menu for root-level nodes (drives, Home)
    if (isRoot || isEditing) return row;

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem className="gap-2" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5" /> Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onClick={startDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> Move to Trash
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }, [editingId, editingName, commitRename]);

  if (loading) return <div className="p-4 text-sm text-muted-foreground italic">Loading roots…</div>;

  return (
    <>
      <div ref={containerRef} className="h-full w-full">
        <Tree
          data={data}
          onSelect={(nodes) => {
            if (nodes.length > 0) setCurrentPath(nodes[0].data.path);
          }}
          onToggle={onToggle}
          width="100%"
          height={height}
          indent={16}
          rowHeight={30}
          overscanCount={5}
          paddingBottom={20}
        >
          {NodeRenderer}
        </Tree>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" and all its contents will be moved to the Trash. This can be undone from the Trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
