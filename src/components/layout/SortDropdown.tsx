import { ArrowUpDown, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUiStore } from "@/stores/uiStore";
import { SortBy } from "@/ipc";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: { label: string, value: SortBy }[] = [
  { label: "Name", value: "name" },
  { label: "Date Modified", value: "modified" },
  { label: "Size", value: "size" },
  { label: "Type", value: "type" },
];

export function SortDropdown() {
  const { sortBy, sortDir, setSort } = useUiStore();

  const handleByChange = (val: SortBy) => {
    setSort(val, sortDir);
  };

  const toggleDir = () => {
    setSort(sortBy, sortDir === "asc" ? "desc" : "asc");
  };

  return (
    <div className="flex items-center">
      <Button 
        variant="outline" 
        size="sm" 
        className="h-9 rounded-r-none border-r-0 px-3 gap-2"
        onClick={toggleDir}
      >
        <ArrowUpDown className={cn("h-3.5 w-3.5 transition-transform", sortDir === "desc" && "rotate-180")} />
        <span className="text-xs">Sort: {SORT_OPTIONS.find(o => o.value === sortBy)?.label}</span>
      </Button>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-8 rounded-l-none">
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {SORT_OPTIONS.map((opt) => (
            <DropdownMenuItem 
              key={opt.value} 
              onClick={() => handleByChange(opt.value)}
              className="justify-between"
            >
              {opt.label}
              {sortBy === opt.value && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
