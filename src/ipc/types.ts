export type MediaKind = "image" | "video" | "raw" | "unknown";

export interface MediaItem {
  path: string;            // absolute, OS-native
  name: string;
  size: number;            // bytes
  modified: number;        // unix milliseconds
  kind: MediaKind;
  width?: number;
  height?: number;
  duration?: number;       // seconds, video only
  hash?: string;           // blake3, computed lazily
}

export interface FolderNode {
  path: string;
  name: string;
  hasChildren: boolean;
  isLibrary: boolean;
}

export interface Library {
  id: string;              // uuid v4
  name: string;
  path: string;            // absolute
  icon?: string;           // lucide icon name, e.g. "Camera"
  color?: string;          // hex, e.g. "#3b82f6"
  createdAt: number;       // unix ms
  itemCount?: number;      // optional, computed lazily
}

export interface ExifData {
  cameraMake?: string;
  cameraModel?: string;
  lens?: string;
  iso?: number;
  shutterSpeed?: string;   // e.g. "1/250"
  aperture?: number;       // f-number, e.g. 2.8
  focalLength?: number;    // mm
  dateTaken?: number;      // unix ms
  gps?: { lat: number; lon: number };
}

export type ConflictPolicy = "skip" | "overwrite" | "rename";

export interface OpResult {
  opId: string;
  successes: string[];
  failures: { path: string; reason: string }[];
}

export interface MediaListResult {
  items: MediaItem[];
  truncated: boolean;
  totalScanned: number;
}

export interface SearchFilters {
  kinds?: MediaKind[];
  dateFrom?: number;
  dateTo?: number;
  sizeMin?: number;
  sizeMax?: number;
  hasGps?: boolean;
}

export interface FsEvent {
  root: string;
  created: string[];
  modified: string[];
  removed: string[];
  renamed: [string, string][];
}

export type SortBy = "name" | "dateTaken" | "modified" | "size" | "type";
export type SortDir = "asc" | "desc";

export interface AppConfig {
  librariesRoot: string;
  language: string;
  theme: string;
  thumbCacheSizeMb: number;
  thumbWorkers: string;
  checkUpdatesOnLaunch: boolean;
  immichUrl: string;
  immichApiKey: string;
}

export interface ImmichSyncResult {
  albumId: string;
  albumName: string;
  uploaded: number;
  skipped: number;
  failed: number;
}

export interface AppError {
  code: string;
  message: string;
  detail?: string;
}

export type ImageEditOp =
  | { op: "rotate"; degrees: 90 | 180 | 270 }
  | { op: "flipHorizontal" }
  | { op: "flipVertical" }
  | { op: "crop"; x: number; y: number; width: number; height: number }
  | { op: "brightness"; value: number }
  | { op: "contrast"; value: number };
