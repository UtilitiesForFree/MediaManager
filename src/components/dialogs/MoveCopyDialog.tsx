import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { commands, ConflictPolicy } from "@/ipc";
import { useToast } from "@/hooks/use-toast";
import { listen } from "@tauri-apps/api/event";

interface MoveCopyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: string[];
  targetLibrary: { id: string, name: string, path: string };
}

export function MoveCopyDialog({ open, onOpenChange, items, targetLibrary }: MoveCopyDialogProps) {
  const [mode, setMode] = useState<"move" | "copy">("move");
  const [policy, setPolicy] = useState<ConflictPolicy>("rename");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [opId, setOpId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!running || !opId) return;

    const unlisten = listen<{ opId: string, completed: number, total: number, current: string }>(
      "fileop-progress",
      (event) => {
        if (event.payload.opId === opId) {
          setProgress(Math.round((event.payload.completed / event.payload.total) * 100));
          setCurrentFile(event.payload.current);
        }
      }
    );

    return () => { unlisten.then(u => u()); };
  }, [running, opId]);

  const handleConfirm = async () => {
    setRunning(true);
    setProgress(0);
    
    try {
      const res = mode === "move" 
        ? await commands.moveToLibrary(items, targetLibrary.id, policy)
        : await commands.copyToLibrary(items, targetLibrary.id, policy);

      if (res.ok) {
        setOpId(res.value.opId);
        toast({
          title: `${mode === "move" ? "Moved" : "Copied"} ${res.value.successes.length} items`,
          description: res.value.failures.length > 0 
            ? `${res.value.failures.length} items failed.` 
            : `Successfully ${mode === "move" ? "moved" : "copied"} to ${targetLibrary.name}.`,
          action: mode === "move" ? (
            <Button variant="outline" size="sm" onClick={() => handleUndo()}>Undo</Button>
          ) : undefined
        });
        onOpenChange(false);
      } else {
        toast({ title: "Operation failed", description: res.error.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const handleUndo = async () => {
    const res = await commands.undoLastMove();
    if (res.ok) {
      toast({ title: "Move undone", description: `Restored ${res.value.successes.length} items.` });
    } else {
      toast({ title: "Undo failed", description: res.error.message, variant: "destructive" });
    }
  };

  const handleCancel = () => {
    if (opId) commands.cancelOperation(opId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={running ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{running ? "Processing..." : `${mode === "move" ? "Move" : "Copy"} to ${targetLibrary.name}`}</DialogTitle>
          <DialogDescription>
            {running ? "Please wait while we process your files." : `You are ${mode === "move" ? "moving" : "copying"} ${items.length} items.`}
          </DialogDescription>
        </DialogHeader>

        {!running ? (
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label>Operation Mode</Label>
              <Tabs value={mode} onValueChange={(v: any) => setMode(v)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="move">Move</TabsTrigger>
                  <TabsTrigger value="copy">Copy</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid gap-2">
              <Label>Conflict Resolution</Label>
              <RadioGroup value={policy} onValueChange={(v: any) => setPolicy(v)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="skip" id="skip" />
                  <Label htmlFor="skip">Skip</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="overwrite" id="overwrite" />
                  <Label htmlFor="overwrite">Overwrite</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="rename" id="rename" />
                  <Label htmlFor="rename">Rename</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        ) : (
          <div className="py-8 space-y-4">
            <Progress value={progress} />
            <div className="text-xs text-muted-foreground truncate text-center">
              {currentFile}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
          {!running && <Button onClick={handleConfirm}>Confirm</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
