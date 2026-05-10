import { invoke } from "@tauri-apps/api/core";
import type { FolderNode, MediaListResult, SortBy, SortDir, AppError, Library, AppConfig, ConflictPolicy, OpResult, ExifData, SearchFilters, ImmichSyncResult } from "./types";

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

async function call<T>(cmd: string, args?: object): Promise<Result<T>> {
  try {
    const value = await invoke<T>(cmd, args as Record<string, unknown>);
    return { ok: true, value };
  } catch (e: unknown) {
    console.error(`IPC error in ${cmd}:`, e);
    return { ok: false, error: e as AppError };
  }
}

export const commands = {
  ping: () => call<string>("ping"),
  listDirectory: (path: string) => call<FolderNode[]>("list_directory", { path }),
  listRoots: () => call<FolderNode[]>("list_roots"),
  getHomeDirectory: () => call<string>("get_home_directory"),
  listMedia: (path: string, recursive: boolean, sortBy: SortBy, sortDir: SortDir) => 
    call<MediaListResult>("list_media", { path, recursive, sortBy, sortDir }),
  getThumbnail: (path: string, size: number) => call<string>("get_thumbnail", { path, size }),
  generateThumbnailsBatch: (paths: string[], size: number) => 
    call<void>("generate_thumbnails_batch", { paths, size }),
  
  listLibraries: () => call<Library[]>("list_libraries"),
  listLibrariesUnder: (parentId: string) => call<Library[]>("list_libraries_under", { parentId }),
  createLibrary: (name: string, parentId?: string, icon?: string, color?: string) => 
    call<Library>("create_library", { name, parentId, icon, color }),
  renameLibrary: (id: string, newName: string) => call<Library>("rename_library", { id, newName }),
  updateLibraryMeta: (id: string, icon?: string, color?: string) => 
    call<Library>("update_library_meta", { id, icon, color }),
  deleteLibrary: (id: string, deleteFiles: boolean) => call<void>("delete_library", { id, deleteFiles }),
  
  getConfig: () => call<AppConfig>("get_config"),
  updateConfig: (config: AppConfig) => call<AppConfig>("update_config", { config }),

  moveToLibrary: (items: string[], libraryId: string, policy: ConflictPolicy) => 
    call<OpResult>("move_to_library", { items, libraryId, policy }),
  copyToLibrary: (items: string[], libraryId: string, policy: ConflictPolicy) => 
    call<OpResult>("copy_to_library", { items, libraryId, policy }),
  trashItems: (items: string[]) => call<OpResult>("trash_items", { items }),
  cancelOperation: (opId: string) => call<void>("cancel_operation", { opId }),
  undoLastMove: () => call<OpResult>("undo_last_move"),
  getExif: (path: string) => call<ExifData>("get_exif", { path }),
  getMediaDimensions: (path: string) => call<[number, number]>("get_media_dimensions", { path }),
  watchDirectory: (path: string) => call<void>("watch_directory", { path }),
  unwatchDirectory: (path: string) => call<void>("unwatch_directory", { path }),
  searchMedia: (root: string, query: string, filters: SearchFilters) => 
    call<string>("search_media", { root, query, filters }),
  cancelSearch: (searchId: string) => call<void>("cancel_search", { searchId }),
  revealInFinder: (path: string) => call<void>("reveal_in_finder", { path }),
  syncLibraryToImmich: (libraryId: string) => call<ImmichSyncResult>("sync_library_to_immich", { libraryId }),
  renameDirectory: (oldPath: string, newName: string) => call<string>("rename_directory", { oldPath, newName }),
  deleteDirectory: (path: string) => call<void>("delete_directory", { path }),
};
