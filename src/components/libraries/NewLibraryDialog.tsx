import { useState } from "react";
import { Folder, Camera, Heart, Star, Plane, Mountain, Home, Utensils, Briefcase, Music, Film, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLibraries } from "@/hooks/useLibraries";
import { useToast } from "@/hooks/use-toast";

const ICONS = [
  { name: "Folder", icon: Folder },
  { name: "Camera", icon: Camera },
  { name: "Heart", icon: Heart },
  { name: "Star", icon: Star },
  { name: "Plane", icon: Plane },
  { name: "Mountain", icon: Mountain },
  { name: "Home", icon: Home },
  { name: "Utensils", icon: Utensils },
  { name: "Briefcase", icon: Briefcase },
  { name: "Music", icon: Music },
  { name: "Film", icon: Film },
  { name: "ImageIcon", icon: ImageIcon },
];

const COLORS = [
  "#64748b", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"
];

interface NewLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewLibraryDialog({ open, onOpenChange }: NewLibraryDialogProps) {
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("Folder");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const { createLibrary } = useLibraries();
  const { toast } = useToast();

  const handleCreate = async () => {
    try {
      await createLibrary.mutateAsync({
        name,
        icon: selectedIcon,
        color: selectedColor,
      });
      toast({ title: "Library created", description: `Library '${name}' was created successfully.` });
      onOpenChange(false);
      setName("");
    } catch (e: any) {
      toast({ 
        title: "Error creating library", 
        description: e.message || "An unknown error occurred",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New Library</DialogTitle>
          <DialogDescription>
            Create a new library folder to organize your media.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summer Trip 2024"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label>Icon</Label>
            <div className="grid grid-cols-6 gap-2">
              {ICONS.map(({ name: n, icon: Icon }) => (
                <Button
                  key={n}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-9 w-9 rounded-md border-2 border-transparent",
                    selectedIcon === n && "border-primary bg-accent"
                  )}
                  onClick={() => setSelectedIcon(n)}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 border-transparent transition-all",
                    selectedColor === c && "border-primary scale-110"
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || createLibrary.isPending}>
            {createLibrary.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
