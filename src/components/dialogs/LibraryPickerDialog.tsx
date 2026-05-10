import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FolderInput, Copy, Library, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useLibraries } from "@/hooks/useLibraries";
import { useUiStore } from "@/stores/uiStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { commands } from "@/ipc";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LibraryPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "move" | "copy";
  selectedPaths: string[];
}

export function LibraryPickerDialog({ open, onOpenChange, mode, selectedPaths }: LibraryPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const { libraries } = useLibraries();
  const { lastUsedLibraryId, setLastUsedLibraryId } = useUiStore();
  const { clear } = useSelectionStore();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = libraries.filter(l =>
    l.name.toLowerCase().includes(query.toLowerCase())
  );

  // Pin last-used to top
  const sorted = lastUsedLibraryId
    ? [
        ...filtered.filter(l => l.id === lastUsedLibraryId),
        ...filtered.filter(l => l.id !== lastUsedLibraryId),
      ]
    : filtered;

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleSelect = async (libraryId: string) => {
    onOpenChange(false);
    setLastUsedLibraryId(libraryId);
    const lib = libraries.find(l => l.id === libraryId);
    const count = selectedPaths.length;

    if (mode === "move") {
      const res = await commands.moveToLibrary(selectedPaths, libraryId, "rename");
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
    } else {
      const res = await commands.copyToLibrary(selectedPaths, libraryId, "rename");
      if (res.ok) {
        toast({ title: `Copied ${count} item${count > 1 ? "s" : ""} to ${lib?.name ?? "library"}` });
      } else {
        toast({ title: "Copy failed", variant: "destructive" });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, sorted.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && sorted[activeIndex]) {
      handleSelect(sorted[activeIndex].id);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            {mode === "move"
              ? <><FolderInput className="h-4 w-4 text-primary" /> Move {selectedPaths.length} item{selectedPaths.length > 1 ? "s" : ""} to…</>
              : <><Copy className="h-4 w-4 text-primary" /> Copy {selectedPaths.length} item{selectedPaths.length > 1 ? "s" : ""} to…</>
            }
          </DialogTitle>
        </DialogHeader>

        <div className="p-3 pb-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search libraries…"
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>

        <div className="p-2 max-h-64 overflow-auto">
          {sorted.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">No libraries found</div>
          )}
          {sorted.map((lib, idx) => (
            <button
              key={lib.id}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors",
                idx === activeIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
              )}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => handleSelect(lib.id)}
            >
              <Library className={cn("h-4 w-4 shrink-0", idx === activeIndex ? "text-primary" : "text-muted-foreground")} />
              <span className="flex-1 truncate font-medium">{lib.name}</span>
              {lib.id === lastUsedLibraryId && (
                <span className="text-[10px] text-muted-foreground shrink-0">last used</span>
              )}
              {idx === activeIndex && <span className="text-[10px] text-muted-foreground shrink-0">↵</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/30">
          <span className="text-[10px] text-muted-foreground">↑↓ navigate · ↵ select · Esc close</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
