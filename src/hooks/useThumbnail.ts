import { useState, useEffect } from "react";
import { commands } from "@/ipc";
import { useThumbStore } from "@/stores/thumbStore";

export function useThumbnail(path: string, size: number) {
  const { urls, failed: globalFailed, setThumb, setFailed: setGlobalFailed } = useThumbStore();
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [localFailed, setLocalFailed] = useState(false);

  const cachedUrl = urls.get(path);
  const isGlobalFailed = globalFailed.has(path);

  useEffect(() => {
    if (cachedUrl || isGlobalFailed || localUrl || localFailed) return;

    let cancelled = false;
    commands.getThumbnail(path, size).then(res => {
      if (cancelled) return;
      if (res.ok) {
        setThumb(path, res.value);
        setLocalUrl(res.value);
      } else {
        setGlobalFailed(path);
        setLocalFailed(true);
      }
    });

    return () => { cancelled = true; };
  }, [path, size, cachedUrl, isGlobalFailed, localUrl, localFailed, setThumb, setGlobalFailed]);

  return { 
    url: cachedUrl || localUrl, 
    failed: isGlobalFailed || localFailed 
  };
}
