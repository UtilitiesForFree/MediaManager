import { Home, ChevronRight } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Breadcrumb() {
  const { currentPath, setCurrentPath } = useUiStore();

  if (!currentPath) return null;

  // Split path handles both Windows (backslashes) and Unix (forward slashes)
  const segments = currentPath.split(/[/\\]/).filter(Boolean);
  const isWindows = currentPath.includes(":");
  
  // Reconstruct paths for each segment
  const pathParts: { name: string; path: string }[] = [];
  let currentAccumulatedPath = isWindows ? "" : "/";

  segments.forEach((seg, i) => {
    if (isWindows && i === 0) {
      currentAccumulatedPath = seg + "\\";
    } else {
      const sep = isWindows ? "\\" : "/";
      if (currentAccumulatedPath.endsWith(sep)) {
        currentAccumulatedPath += seg;
      } else {
        currentAccumulatedPath += sep + seg;
      }
    }
    pathParts.push({ name: seg, path: currentAccumulatedPath });
  });

  return (
    <div className="flex items-center text-xs text-muted-foreground overflow-hidden">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={() => setCurrentPath("/")} // Simplified home
      >
        <Home className="h-3 w-3" />
      </Button>
      
      {pathParts.map((part, i) => (
        <div key={part.path} className="flex items-center shrink-0">
          <ChevronRight className="h-3 w-3 mx-1 opacity-50 shrink-0" />
          <button
            className={cn(
              "hover:text-foreground transition-colors truncate max-w-[120px]",
              i === pathParts.length - 1 && "text-foreground font-semibold"
            )}
            onClick={() => setCurrentPath(part.path)}
          >
            {part.name}
          </button>
        </div>
      ))}
    </div>
  );
}
