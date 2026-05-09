import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUiStore } from "@/stores/uiStore";
import { useState, useEffect, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";

export function SearchBar() {
  const { searchQuery, setSearchQuery, isSearching, setIsSearching } = useUiStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debouncedQuery = useDebounce(localQuery, 250);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedQuery !== searchQuery) {
      setSearchQuery(debouncedQuery);
      setIsSearching(debouncedQuery.length > 2);
    }
  }, [debouncedQuery, searchQuery, setSearchQuery, setIsSearching]);

  return (
    <div className="relative w-64">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search media..."
        className="pl-9 pr-9 h-9 text-xs"
        value={localQuery}
        onChange={(e) => setLocalQuery(e.target.value)}
      />
      {isSearching ? (
        <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />
      ) : localQuery ? (
        <button 
          className="absolute right-2.5 top-2.5 hover:text-foreground"
          onClick={() => { setLocalQuery(""); setSearchQuery(""); setIsSearching(false); }}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      ) : null}
    </div>
  );
}
