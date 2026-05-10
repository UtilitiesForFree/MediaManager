import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { Settings, Maximize2, Minimize2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { FolderTree } from "../folders/FolderTree";
import { MediaGrid } from "../grid/MediaGrid";
import { LibraryList } from "../libraries/LibraryList";
import { Inspector } from "../inspector/Inspector";
import { Breadcrumb } from "./Breadcrumb";
import { SearchBar } from "./SearchBar";
import { FilterPopover } from "./FilterPopover";
import { SortDropdown } from "./SortDropdown";
import { SettingsDialog } from "../dialogs/SettingsDialog";
import { useUiStore } from "@/stores/uiStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { thumbSize, setThumbSize } = useUiStore();
  const { paths: selectedPaths } = useSelectionStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selCount = selectedPaths.size;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden w-full">
      {/* Toolbar */}
      <header className="h-11 border-b border-border/60 flex items-center justify-between px-3 shrink-0 bg-card/60 glass">
        <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Layers className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="font-semibold text-sm tracking-tight">MediaManager</span>
          </div>
          <div className="h-4 w-px bg-border mx-1 shrink-0" />
          <div className="min-w-0 overflow-hidden">
            <Breadcrumb />
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 border-l border-r border-border/60 h-full">
          <SearchBar />
          <FilterPopover />
          <SortDropdown />
        </div>

        <div className="flex items-center gap-3 pl-3">
          <div className="flex items-center gap-2 w-28">
            <Minimize2 className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            <Slider
              value={[thumbSize]}
              min={64}
              max={384}
              step={32}
              onValueChange={([val]) => setThumbSize(val)}
              className="flex-1"
            />
            <Maximize2 className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-muted"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <PanelGroup orientation="horizontal" className="h-full w-full">
          {/* Left Pane */}
          <Panel
            defaultSize="18%"
            minSize="10%"
            maxSize="40%"
            className="flex flex-col"
          >
            <PanelGroup orientation="vertical" className="h-full w-full">
              <Panel defaultSize="60%" minSize="20%">
                <div className="h-full flex flex-col overflow-hidden">
                  <SidebarSectionHeader label="Folders" />
                  <div className="flex-1 overflow-hidden">
                    <FolderTree />
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-1.5 bg-transparent hover:bg-primary/10 transition-colors flex items-center justify-center cursor-row-resize group">
                <div className="h-px w-10 bg-border group-hover:bg-primary/30 rounded-full transition-colors" />
              </PanelResizeHandle>

              <Panel defaultSize="40%" minSize="20%">
                <LibraryList />
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border/40 hover:bg-primary/30 transition-colors cursor-col-resize" />

          {/* Center Pane */}
          <Panel minSize="20%">
            <div className="flex flex-col h-full overflow-hidden">
              <MediaGrid />
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border/40 hover:bg-primary/30 transition-colors cursor-col-resize" />

          {/* Right Pane */}
          <Panel
            defaultSize="22%"
            minSize="15%"
            maxSize="45%"
          >
            <div className="h-full flex flex-col overflow-hidden">
              <SidebarSectionHeader label="Inspector" />
              <div className="flex-1 overflow-hidden">
                <Inspector />
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </main>

      {/* Status Bar */}
      <footer className="h-6 border-t border-border/60 flex items-center justify-between px-3 bg-card/40 shrink-0">
        <div className="flex items-center gap-3">
          <span className={cn(
            "text-[10px] font-medium transition-colors",
            selCount > 0 ? "text-primary" : "text-muted-foreground/50"
          )}>
            {selCount > 0 ? `${selCount} selected` : "Ready"}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/40">
          ⌘⇧M to pick library
        </span>
      </footer>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function SidebarSectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-2 border-b border-border/50 bg-muted/20 shrink-0">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </h3>
    </div>
  );
}
