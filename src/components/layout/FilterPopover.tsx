import { Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

export function FilterPopover() {
  const { filters, setFilters } = useUiStore();

  const toggleKind = (kind: any) => {
    const nextKinds = filters.kinds ? [...filters.kinds] : [];
    const idx = nextKinds.indexOf(kind);
    if (idx > -1) nextKinds.splice(idx, 1);
    else nextKinds.push(kind);
    setFilters({ ...filters, kinds: nextKinds.length > 0 ? nextKinds : undefined });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <Filter className="h-4 w-4" />
          Filter
          {(filters.kinds?.length || 0) > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px]">
              {filters.kinds?.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <SectionTitle label="Media Kind" />
            <div className="flex flex-wrap gap-2">
              <KindChip label="Images" active={filters.kinds?.includes("image")} onClick={() => toggleKind("image")} />
              <KindChip label="Videos" active={filters.kinds?.includes("video")} onClick={() => toggleKind("video")} />
              <KindChip label="RAW" active={filters.kinds?.includes("raw")} onClick={() => toggleKind("raw")} />
            </div>
          </div>
          
          {/* Add more filters like Date/Size here later */}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</h4>;
}

function KindChip({ label, active, onClick }: { label: string, active?: boolean, onClick: () => void }) {
  return (
    <button
      className={cn(
        "px-3 py-1 text-xs rounded-full border transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent border-border"
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
