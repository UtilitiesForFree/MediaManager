import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { Settings, Maximize, Minimize } from "lucide-react";
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
import { useState } from "react";

export function AppShell() {
  const { thumbSize, setThumbSize } = useUiStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden w-full">
      {/* Toolbar */}
      <header className="h-12 border-b flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4 overflow-hidden flex-1">
          <span className="font-bold text-lg tracking-tight shrink-0">MediaManager</span>
          <div className="h-6 w-px bg-border mx-2 shrink-0" />
          <Breadcrumb />
        </div>

        <div className="flex items-center gap-2 px-4 border-l border-r h-full">
          <SearchBar />
          <FilterPopover />
          <SortDropdown />
        </div>
        
        <div className="flex items-center gap-4 px-4 border-r h-full">
          <div className="flex items-center gap-2 w-32">
            <Minimize className="h-3 w-3 text-muted-foreground" />
            <Slider
              value={[thumbSize]}
              min={64}
              max={384}
              step={32}
              onValueChange={([val]) => setThumbSize(val)}
            />
            <Maximize className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <PanelGroup orientation="horizontal" className="h-full w-full">
          {/* Left Pane - Folders and Libraries */}
          <Panel
            defaultSize="18%"
            minSize="10%"
            maxSize="40%"
            className="flex flex-col"
          >
            <PanelGroup orientation="vertical" className="h-full w-full">
              <Panel defaultSize="60%" minSize="20%">
                <div className="h-full flex flex-col overflow-hidden">
                  <div className="p-3 border-b bg-muted/20">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Folders
                    </h3>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <FolderTree />
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-2 bg-transparent hover:bg-primary/10 transition-colors flex items-center justify-center cursor-row-resize">
                <div className="h-0.5 w-8 bg-border rounded-full" />
              </PanelResizeHandle>

              <Panel defaultSize="40%" minSize="20%">
                <LibraryList />
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-2 bg-transparent hover:bg-primary/10 transition-colors flex items-center justify-center cursor-col-resize">
            <div className="w-0.5 h-8 bg-border rounded-full" />
          </PanelResizeHandle>

          {/* Center Pane - Grid */}
          <Panel minSize="20%">
            <div className="flex flex-col h-full overflow-hidden bg-background">
              <MediaGrid />
            </div>
          </Panel>

          <PanelResizeHandle className="w-2 bg-transparent hover:bg-primary/10 transition-colors flex items-center justify-center cursor-col-resize">
            <div className="w-0.5 h-8 bg-border rounded-full" />
          </PanelResizeHandle>

          {/* Right Pane - Inspector */}
          <Panel
            defaultSize="22%"
            minSize="15%"
            maxSize="45%"
          >
            <div className="h-full flex flex-col overflow-hidden border-l">
              <div className="p-3 border-b bg-muted/20">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Inspector
                </h3>
              </div>
              <div className="flex-1 overflow-hidden">
                <Inspector />
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </main>

      {/* Status Bar */}
      <footer className="h-6 border-t flex items-center px-3 bg-muted/50 shrink-0">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Ready
        </span>
      </footer>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
