import { describe, it, expect, beforeEach } from "vitest";
import { useSelectionStore } from "../stores/selectionStore";

describe("selectionStore", () => {
  beforeEach(() => {
    useSelectionStore.getState().clear();
  });

  it("should set a single selection", () => {
    const { setSingle } = useSelectionStore.getState();
    setSingle("path1");
    expect(useSelectionStore.getState().paths.has("path1")).toBe(true);
    expect(useSelectionStore.getState().paths.size).toBe(1);
    expect(useSelectionStore.getState().anchor).toBe("path1");
  });

  it("should toggle selection", () => {
    const { toggle } = useSelectionStore.getState();
    toggle("path1");
    expect(useSelectionStore.getState().paths.has("path1")).toBe(true);
    toggle("path1");
    expect(useSelectionStore.getState().paths.has("path1")).toBe(false);
  });

  it("should select range from anchor", () => {
    const { setSingle, rangeFromAnchor } = useSelectionStore.getState();
    const allPaths = ["a", "b", "c", "d", "e"];
    
    setSingle("b");
    rangeFromAnchor("d", allPaths);
    
    const state = useSelectionStore.getState();
    expect(state.paths.has("b")).toBe(true);
    expect(state.paths.has("c")).toBe(true);
    expect(state.paths.has("d")).toBe(true);
    expect(state.paths.size).toBe(3);
  });
});
