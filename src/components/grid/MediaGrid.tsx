import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { Image as ImageIcon, Search as SearchIcon } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useThumbStore } from "@/stores/thumbStore";
import { commands, MediaItem } from "@/ipc";
import { useQuery } from "@tanstack/react-query";
import { Thumbnail } from "./Thumbnail";
import { listen } from "@tauri-apps/api/event";

const LABEL_HEIGHT = 40;
const GAP = 12;

export function MediaGrid() {
  const { currentPath, thumbSize, searchQuery, isSearching, filters, sortBy, sortDir } = useUiStore();
  const { paths: selectedPaths, setSingle, toggle, rangeFromAnchor, clear, selectAll } = useSelectionStore();
  const thumbUrls = useThumbStore(s => s.urls);
  
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [_activeSearchId, setActiveSearchId] = useState<string | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  // Callback ref so the ResizeObserver attaches whenever the grid div mounts
  // (it only renders after data loads, so a plain useEffect([]) would miss it)
  const gridRefCallback = useCallback((el: HTMLDivElement | null) => {
    (parentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
  }, []);

  // Normal listing query
  const { data: listData, isLoading: isListingLoading } = useQuery({
    queryKey: ["media", currentPath, sortBy, sortDir],
    queryFn: async () => {
      if (!currentPath || isSearching) return null;
      const res = await commands.listMedia(currentPath, false, sortBy, sortDir);
      return res.ok ? res.value : null;
    },
    enabled: !!currentPath && !isSearching,
  });

  // Search logic
  useEffect(() => {
    if (!isSearching || !searchQuery || !currentPath) {
      setSearchResults([]);
      return;
    }

    let searchId: string;
    const startSearch = async () => {
      setSearchResults([]);
      const res = await commands.searchMedia(currentPath, searchQuery, filters);
      if (res.ok) {
        searchId = res.value;
        setActiveSearchId(searchId);
      }
    };

    startSearch();

    const unlisten = listen<[string, MediaItem[]]>("search-result", (event) => {
      if (event.payload[0] === searchId) {
        setSearchResults(prev => [...prev, ...event.payload[1]]);
      }
    });

    return () => {
      if (searchId) commands.cancelSearch(searchId);
      unlisten.then(u => u());
    };
  }, [isSearching, searchQuery, currentPath, filters]);

  const items = isSearching ? searchResults : (listData?.items || []);
  
  // Apply client-side filters if not searching (search does it server-side)
  const filteredItems = useMemo(() => {
    if (isSearching) return items;
    if (!filters.kinds) return items;
    return items.filter(i => filters.kinds?.includes(i.kind as any));
  }, [items, filters, isSearching]);

  const allPaths = useMemo(() => filteredItems.map(i => i.path), [filteredItems]);

  const lanes = Math.max(1, Math.floor((containerWidth - 24) / (thumbSize + GAP)));
  const rowCount = Math.ceil(filteredItems.length / lanes);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => thumbSize + LABEL_HEIGHT + GAP,
    overscan: 5,
  });

  // Batch enqueue thumbnails
  useEffect(() => {
    if (!filteredItems.length || (!currentPath && !isSearching)) return;

    const virtualItems = rowVirtualizer.getVirtualItems();
    if (!virtualItems.length) return;

    const startIdx = virtualItems[0].index * lanes;
    const endIdx = (virtualItems[virtualItems.length - 1].index + 1) * lanes;
    
    const visiblePaths = filteredItems.slice(startIdx, endIdx)
      .map(i => i.path)
      .filter(p => !thumbUrls.has(p));

    if (visiblePaths.length > 0) {
      const timer = setTimeout(() => {
        commands.generateThumbnailsBatch(visiblePaths, thumbSize);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [rowVirtualizer.getVirtualItems(), filteredItems, lanes, thumbSize, thumbUrls, currentPath, isSearching]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    
    const rect = parentRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX - rect.left + (parentRef.current?.scrollLeft || 0);
    const startY = e.clientY - rect.top + (parentRef.current?.scrollTop || 0);

    setMarquee({ startX, startY, endX: startX, endY: startY });

    const handleMouseMove = (em: MouseEvent) => {
      const endX = em.clientX - rect.left + (parentRef.current?.scrollLeft || 0);
      const endY = em.clientY - rect.top + (parentRef.current?.scrollTop || 0);
      setMarquee(prev => prev ? { ...prev, endX, endY } : null);
    };

    const handleMouseUp = (em: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      
      setMarquee(prev => {
        if (!prev) return null;
        
        const x1 = Math.min(prev.startX, em.clientX - rect.left + (parentRef.current?.scrollLeft || 0));
        const x2 = Math.max(prev.startX, em.clientX - rect.left + (parentRef.current?.scrollLeft || 0));
        const y1 = Math.min(prev.startY, em.clientY - rect.top + (parentRef.current?.scrollTop || 0));
        const y2 = Math.max(prev.startY, em.clientY - rect.top + (parentRef.current?.scrollTop || 0));

        const selected = filteredItems.filter((_, idx) => {
          const row = Math.floor(idx / lanes);
          const col = idx % lanes;
          const x = col * (thumbSize + GAP) + GAP;
          const y = row * (thumbSize + LABEL_HEIGHT + GAP) + GAP;
          
          const centerX = x + thumbSize / 2;
          const centerY = y + thumbSize / 2;

          return centerX >= x1 && centerX <= x2 && centerY >= y1 && centerY <= y2;
        }).map(i => i.path);

        if (em.shiftKey) {
          selected.forEach(p => toggle(p));
        } else {
          selected.forEach((p, i) => i === 0 ? setSingle(p) : toggle(p));
          if (selected.length === 0) clear();
        }

        return null;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        selectAll(allPaths);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allPaths, clear, selectAll]);

  if (!currentPath && !isSearching) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-10 text-center">
        <ImageIcon className="h-12 w-12 mb-4 opacity-20" />
        <h3 className="text-lg font-medium">No folder selected</h3>
        <p className="text-sm max-w-xs">Select a folder from the tree on the left to browse your media.</p>
      </div>
    );
  }

  if (isListingLoading && !isSearching) {
    return <div className="p-10 text-center text-muted-foreground italic">Scanning folder...</div>;
  }

  if (isSearching && filteredItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-10 text-center">
        <SearchIcon className="h-12 w-12 mb-4 opacity-20" />
        <h3 className="text-lg font-medium">No results found</h3>
        <p className="text-sm max-w-xs">Try adjusting your search query or filters.</p>
      </div>
    );
  }

  if (!isListingLoading && !isSearching && filteredItems.length === 0 && currentPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-10 text-center">
        <ImageIcon className="h-12 w-12 mb-4 opacity-20" />
        <h3 className="text-lg font-medium">No media files here</h3>
        <p className="text-sm max-w-xs">This folder contains no supported images or videos.</p>
      </div>
    );
  }

  return (
    <div
      ref={gridRefCallback}
      className="h-full overflow-auto p-4 relative"
      onMouseDown={handleMouseDown}
    >
      {marquee && (
        <div 
          className="absolute border border-primary bg-primary/10 z-50 pointer-events-none"
          style={{
            left: Math.min(marquee.startX, marquee.endX),
            top: Math.min(marquee.startY, marquee.endY),
            width: Math.abs(marquee.startX - marquee.endX),
            height: Math.abs(marquee.startY - marquee.endY),
          }}
        />
      )}
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowItems = filteredItems.slice(
            virtualRow.index * lanes,
            (virtualRow.index + 1) * lanes
          );

          return (
            <div
              key={virtualRow.index}
              className="absolute top-0 left-0 w-full flex gap-3"
              style={{
                height: `${thumbSize + LABEL_HEIGHT}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rowItems.map((item) => (
                <Thumbnail
                  key={item.path}
                  path={item.path}
                  name={item.name}
                  kind={item.kind as any}
                  size={thumbSize}
                  isSelected={selectedPaths.has(item.path)}
                  selectedPaths={Array.from(selectedPaths)}
                  allPaths={allPaths}
                  duration={item.duration}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) rangeFromAnchor(item.path, allPaths);
                    else if (e.metaKey || e.ctrlKey) toggle(item.path);
                    else setSingle(item.path);
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
      {listData?.truncated && !isSearching && (
        <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-xs text-yellow-600 text-center">
          Showing first 50,000 items. Refine your view by opening a subfolder.
        </div>
      )}
    </div>
  );
}
