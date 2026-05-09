import { useEffect, Component, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/layout/AppShell";
import { Toaster } from "@/components/ui/toaster";
import { listen } from "@tauri-apps/api/event";
import { useThumbStore } from "@/stores/thumbStore";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { FsEvent } from "@/ipc";
import { commands } from "@/ipc";

export function applyTheme(theme: string) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ padding: 32, fontFamily: "monospace", color: "red", whiteSpace: "pre-wrap" }}>
          <strong>CRASH: {err.message}</strong>{"\n\n"}{err.stack}
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient();

function App() {
  const setThumb = useThumbStore(s => s.setThumb);
  const setFailed = useThumbStore(s => s.setFailed);

  // Apply saved theme on startup; fall back to dark
  useEffect(() => {
    commands.getConfig().then(res => {
      applyTheme(res.ok ? res.value.theme : "dark");
    }).catch(() => applyTheme("dark"));
  }, []);

  useEffect(() => {
    const unlistenReady = listen<{ path: string, url: string }>("thumbnail-ready", (event) => {
      setThumb(event.payload.path, event.payload.url);
    });
    const unlistenFailed = listen<{ path: string, reason: string }>("thumbnail-failed", (event) => {
      setFailed(event.payload.path);
    });
    const unlistenFs = listen<FsEvent>("fs-changed", (event) => {
      queryClient.invalidateQueries({ queryKey: ["media", event.payload.root] });
    });

    return () => {
      unlistenReady.then(u => u());
      unlistenFailed.then(u => u());
      unlistenFs.then(u => u());
    };
  }, [setThumb, setFailed]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <DndProvider backend={HTML5Backend}>
          <AppShell />
          <Toaster />
        </DndProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
