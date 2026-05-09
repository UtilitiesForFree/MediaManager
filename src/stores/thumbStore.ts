import { create } from "zustand";

interface ThumbState {
  urls: Map<string, string>;
  failed: Set<string>;
  setThumb: (path: string, url: string) => void;
  setFailed: (path: string) => void;
  clear: () => void;
}

export const useThumbStore = create<ThumbState>((set) => ({
  urls: new Map(),
  failed: new Set(),
  setThumb: (path, url) => set((state) => {
    const next = new Map(state.urls);
    next.set(path, url);
    return { urls: next };
  }),
  setFailed: (path) => set((state) => {
    const next = new Set(state.failed);
    next.add(path);
    return { failed: next };
  }),
  clear: () => set({ urls: new Map(), failed: new Set() }),
}));
