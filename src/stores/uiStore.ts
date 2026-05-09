import { create } from "zustand";
import { SearchFilters, SortBy, SortDir } from "@/ipc";

interface UiState {
  currentPath: string | null;
  thumbSize: number;
  leftPaneSize: number;
  rightPaneSize: number;
  
  searchQuery: string;
  isSearching: boolean;
  searchAllLibraries: boolean;
  filters: SearchFilters;
  sortBy: SortBy;
  sortDir: SortDir;

  setCurrentPath: (p: string | null) => void;
  setThumbSize: (n: number) => void;
  setLeftPaneSize: (n: number) => void;
  setRightPaneSize: (n: number) => void;
  
  setSearchQuery: (q: string) => void;
  setIsSearching: (b: boolean) => void;
  setSearchAllLibraries: (b: boolean) => void;
  setFilters: (f: SearchFilters) => void;
  setSort: (by: SortBy, dir: SortDir) => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentPath: null,
  thumbSize: 192,
  leftPaneSize: 40, 
  rightPaneSize: 20,
  
  searchQuery: "",
  isSearching: false,
  searchAllLibraries: false,
  filters: {},
  sortBy: "name",
  sortDir: "asc",

  setCurrentPath: (p) => set({ currentPath: p, searchQuery: "", isSearching: false }),
  setThumbSize: (n) => set({ thumbSize: n }),
  setLeftPaneSize: (n) => set({ leftPaneSize: n }),
  setRightPaneSize: (n) => set({ rightPaneSize: n }),

  setSearchQuery: (q) => set({ searchQuery: q }),
  setIsSearching: (b) => set({ isSearching: b }),
  setSearchAllLibraries: (b) => set({ searchAllLibraries: b }),
  setFilters: (f) => set({ filters: f }),
  setSort: (by, dir) => set({ sortBy: by, sortDir: dir }),
}));
