import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { commands } from "@/ipc";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

export function useLibraries() {
  const queryClient = useQueryClient();

  const { data: libraries = [], isLoading } = useQuery({
    queryKey: ["libraries"],
    queryFn: async () => {
      const res = await commands.listLibraries();
      return res.ok ? res.value : [];
    },
  });

  useEffect(() => {
    const unlisten = listen("library-changed", () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      queryClient.invalidateQueries({ queryKey: ["roots"] }); // Roots might have changed too
    });
    return () => { unlisten.then(u => u()); };
  }, [queryClient]);

  const createLibrary = useMutation({
    mutationFn: async (args: { name: string, parentId?: string, icon?: string, color?: string }) => {
      const res = await commands.createLibrary(args.name, args.parentId, args.icon, args.color);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["libraries"] }),
  });

  const renameLibrary = useMutation({
    mutationFn: async (args: { id: string, newName: string }) => {
      const res = await commands.renameLibrary(args.id, args.newName);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["libraries"] }),
  });

  const deleteLibrary = useMutation({
    mutationFn: async (args: { id: string, deleteFiles: boolean }) => {
      const res = await commands.deleteLibrary(args.id, args.deleteFiles);
      if (!res.ok) throw res.error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["libraries"] }),
  });

  return {
    libraries,
    isLoading,
    createLibrary,
    renameLibrary,
    deleteLibrary,
  };
}
