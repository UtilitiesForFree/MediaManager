import { useSelectionStore } from "@/stores/selectionStore";
import { useQuery } from "@tanstack/react-query";
import { commands, MediaItem } from "@/ipc";
import { useUiStore } from "@/stores/uiStore";
import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { MapPin, Info, ImageIcon, Film, FileDigit, Copy, ExternalLink, Trash2 } from "lucide-react";
import { fmtSize, fmtDate, fmtDateRange } from "@/lib/format";
import { useThumbnail } from "@/hooks/useThumbnail";
import { cn } from "@/lib/utils";

export function Inspector() {
  const { paths } = useSelectionStore();
  const { currentPath, sortBy, sortDir } = useUiStore();

  const { data: mediaItems } = useQuery({
    queryKey: ["media", currentPath, sortBy, sortDir],
    queryFn: async () => {
      if (!currentPath) return null;
      const res = await commands.listMedia(currentPath, false, sortBy, sortDir);
      return res.ok ? res.value : null;
    },
    enabled: !!currentPath,
  });

  const allItems: MediaItem[] = useMemo(() => mediaItems?.items ?? [], [mediaItems]);
  const selectedItems = useMemo(() => allItems.filter(i => paths.has(i.path)), [allItems, paths]);

  if (paths.size === 0) {
    return <EmptyState items={allItems} />;
  }

  if (paths.size === 1 && selectedItems[0]) {
    return <SingleSelection item={selectedItems[0]} />;
  }

  if (selectedItems.length === 0) {
    return <EmptyState items={allItems} />;
  }

  return <MultiSelection items={selectedItems} />;
}

function EmptyState({ items }: { items: MediaItem[] }) {
  const totalSize = items.reduce((acc, i) => acc + i.size, 0);
  const kindCounts = items.reduce((acc: any, i) => {
    acc[i.kind] = (acc[i.kind] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
      <Info className="h-12 w-12 mb-4 opacity-20" />
      <h3 className="font-semibold text-foreground mb-1">Folder Summary</h3>
      <div className="text-xs space-y-2 mt-4">
        <p>{items.length} items total</p>
        <p>{fmtSize(totalSize)}</p>
        <div className="flex gap-2 justify-center opacity-70">
          {kindCounts.image && <span>{kindCounts.image} imgs</span>}
          {kindCounts.video && <span>{kindCounts.video} vids</span>}
          {kindCounts.raw && <span>{kindCounts.raw} raw</span>}
        </div>
      </div>
    </div>
  );
}

function SingleSelection({ item }: { item: MediaItem }) {
  const { url } = useThumbnail(item.path, 480);
  
  const { data: exif } = useQuery({
    queryKey: ["exif", item.path],
    queryFn: async () => {
      const res = await commands.getExif(item.path);
      return res.ok ? res.value : null;
    },
  });

  const { data: dims } = useQuery({
    queryKey: ["dims", item.path],
    queryFn: async () => {
      const res = await commands.getMediaDimensions(item.path);
      return res.ok ? res.value : null;
    },
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6 pb-20">
        {/* Preview */}
        <div className="aspect-video rounded-lg bg-muted flex items-center justify-center overflow-hidden border shadow-sm">
          {url ? (
            <img src={url} className="w-full h-full object-contain" alt={item.name} />
          ) : (
            <MediaIcon kind={item.kind} className="h-12 w-12 opacity-20" />
          )}
        </div>

        {/* Identity */}
        <div>
          <h2 className="font-bold text-sm truncate" title={item.name}>{item.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">{item.path}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
              // Copy to clipboard
            }}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Properties */}
        <div className="space-y-2">
          <SectionTitle label="Properties" />
          <PropertyRow label="Kind" value={item.kind.toUpperCase()} />
          <PropertyRow label="Size" value={fmtSize(item.size)} />
          {dims && <PropertyRow label="Dimensions" value={`${dims[0]} × ${dims[1]}`} />}
          <PropertyRow label="Modified" value={fmtDate(item.modified)} />
        </div>

        {/* EXIF */}
        {exif && (
          <div className="space-y-2 pt-2">
            <SectionTitle label="Camera Settings" />
            {(exif.cameraMake || exif.cameraModel) && (
              <PropertyRow label="Camera" value={`${exif.cameraMake || ""} ${exif.cameraModel || ""}`.trim()} />
            )}
            {exif.lens && <PropertyRow label="Lens" value={exif.lens} />}
            <div className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded-md">
              ISO {exif.iso || "?"} · {exif.shutterSpeed || "?"} · f/{exif.aperture || "?"} · {exif.focalLength || "?"}mm
            </div>
          </div>
        )}

        {/* GPS */}
        {exif?.gps && (
          <div className="space-y-2 pt-2">
            <SectionTitle label="Location" icon={<MapPin className="h-3 w-3" />} />
            <div className="aspect-[2/1] rounded-md bg-muted border overflow-hidden relative group">
              <img 
                src={`https://staticmap.openstreetmap.de/staticmap.php?center=${exif.gps.lat},${exif.gps.lon}&zoom=12&size=280x140&markers=${exif.gps.lat},${exif.gps.lon},red-pushpin`} 
                className="w-full h-full object-cover"
                alt="Map"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <Button variant="secondary" size="sm" className="opacity-0 group-hover:opacity-100 scale-90" onClick={() => {
                  window.open(`https://www.google.com/maps?q=${exif.gps?.lat},${exif.gps?.lon}`, "_blank");
                }}>
                  Open in Maps
                </Button>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground text-center">
              {exif.gps.lat.toFixed(6)}, {exif.gps.lon.toFixed(6)}
            </div>
          </div>
        )}

        <Separator />

        {/* Actions */}
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start gap-2 h-8 text-xs">
            <ExternalLink className="h-3.5 w-3.5" /> Reveal in Explorer
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2 h-8 text-xs text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Move to Trash
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}

function MultiSelection({ items }: { items: MediaItem[] }) {
  const totalSize = items.reduce((acc, i) => acc + i.size, 0);
  
  const modifiedTimes = items.map(i => i.modified);
  const minDate = modifiedTimes.length > 0 ? Math.min(...modifiedTimes) : 0;
  const maxDate = modifiedTimes.length > 0 ? Math.max(...modifiedTimes) : 0;

  const kindCounts = items.reduce((acc: any, i) => {
    acc[i.kind] = (acc[i.kind] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-4 space-y-6">
      <div className="text-center py-6">
        <div className="text-4xl font-bold">{items.length}</div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Items Selected</div>
      </div>

      <Separator />

      <div className="space-y-3">
        <PropertyRow label="Total Size" value={fmtSize(totalSize)} />
        <PropertyRow label="Date Range" value={fmtDateRange(minDate, maxDate)} />

        <div className="pt-2 flex flex-wrap gap-2">
          {kindCounts.image && <Badge label={`${kindCounts.image} images`} color="bg-blue-500/10 text-blue-600" />}
          {kindCounts.video && <Badge label={`${kindCounts.video} videos`} color="bg-gray-500/10 text-gray-600" />}
          {kindCounts.raw && <Badge label={`${kindCounts.raw} RAW`} color="bg-purple-500/10 text-purple-600" />}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Button variant="outline" className="w-full justify-start gap-2 h-8 text-xs text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" /> Move All to Trash
        </Button>
      </div>
    </div>
  );
}

function SectionTitle({ label, icon }: { label: string, icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
      {icon} {label}
    </div>
  );
}

function PropertyRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate ml-4" title={value}>{value}</span>
    </div>
  );
}

function Badge({ label, color }: { label: string, color: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", color)}>
      {label}
    </span>
  );
}

function MediaIcon({ kind, className }: { kind: string, className?: string }) {
  switch (kind) {
    case "image": return <ImageIcon className={className} />;
    case "video": return <Film className={className} />;
    case "raw": return <FileDigit className={className} />;
    default: return <Info className={className} />;
  }
}
