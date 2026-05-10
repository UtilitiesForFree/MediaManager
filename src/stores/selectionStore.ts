import { create } from "zustand";

interface SelectionState {
  paths: Set<string>;
  anchor: string | null;
  setSingle: (path: string) => void;
  toggle: (path: string) => void;
  rangeFromAnchor: (path: string, allPaths: string[]) => void;
  clear: () => void;
  selectAll: (paths: string[]) => void;
  keepOnly: (paths: string[]) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  paths: new Set<string>(),
  anchor: null,

  setSingle: (path) => set({ 
    paths: new Set([path]), 
    anchor: path 
  }),

  toggle: (path) => {
    const newPaths = new Set(get().paths);
    if (newPaths.has(path)) {
      newPaths.delete(path);
      set({ paths: newPaths, anchor: path });
    } else {
      newPaths.add(path);
      set({ paths: newPaths, anchor: path });
    }
  },

  rangeFromAnchor: (path, allPaths) => {
    const { anchor } = get();
    if (!anchor) {
      set({ paths: new Set([path]), anchor: path });
      return;
    }

    const anchorIndex = allPaths.indexOf(anchor);
    const currentIndex = allPaths.indexOf(path);

    if (anchorIndex === -1 || currentIndex === -1) {
      set({ paths: new Set([path]), anchor: path });
      return;
    }

    const start = Math.min(anchorIndex, currentIndex);
    const end = Math.max(anchorIndex, currentIndex);
    const range = allPaths.slice(start, end + 1);

    set({ paths: new Set(range) });
  },

  clear: () => set({ paths: new Set(), anchor: null }),

  selectAll: (paths) => set({ paths: new Set(paths), anchor: paths[0] || null }),

  keepOnly: (paths) => {
    const current = get().paths;
    const keep = new Set(paths.filter(p => current.has(p)));
    set({ paths: keep });
  },
}));
