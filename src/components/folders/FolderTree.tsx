import React, { useState, useEffect, useRef } from "react";
import { Tree } from "react-arborist";
import { Folder, FolderOpen, ChevronRight, ChevronDown, Monitor, Home, Star } from "lucide-react";
import { commands } from "@/ipc";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

export function FolderTree() {
  const { setCurrentPath } = useUiStore();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const loadRoots = async () => {
      const res = await commands.listRoots();
      if (res.ok) {
        setData(res.value.map(r => ({
          id: r.path,
          name: r.name,
          hasChildren: r.hasChildren,
          isLibrary: r.isLibrary,
          path: r.path,
          children: r.hasChildren ? [] : undefined
        })));
      }
      setLoading(false);
    };
    loadRoots();

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setHeight(entries[0].contentRect.height);
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const onToggle = async (id: string) => {
    // Find the node to check if children are already loaded
    const findNode = (items: any[]): any | null => {
      for (const item of items) {
        if (item.id === id) return item;
        if (item.children) {
          const found = findNode(item.children);
          if (found) return found;
        }
      }
      return null;
    };

    const nodeData = findNode(data);
    if (!nodeData || !nodeData.hasChildren || (nodeData.children && nodeData.children.length > 0)) {
      return;
    }

    const res = await commands.listDirectory(id);
    if (res.ok) {
      const children = res.value.map(n => ({
        id: n.path,
        name: n.name,
        hasChildren: n.hasChildren,
        isLibrary: n.isLibrary,
        path: n.path,
        children: n.hasChildren ? [] : undefined
      }));

      setData(prev => {
        const updateNode = (items: any[]): any[] => {
          return items.map(item => {
            if (item.id === id) {
              return { ...item, children };
            }
            if (item.children) {
              return { ...item, children: updateNode(item.children) };
            }
            return item;
          });
        };
        return updateNode(prev);
      });
    }
  };

  if (loading) return <div className="p-4 text-sm text-muted-foreground italic">Loading roots...</div>;

  return (
    <div ref={containerRef} className="h-full w-full">
      <Tree
        data={data}
        onSelect={(nodes) => {
          if (nodes.length > 0) {
            setCurrentPath(nodes[0].data.path);
          }
        }}
        onToggle={onToggle}
        width="100%"
        height={height}
        indent={16}
        rowHeight={30}
        overscanCount={5}
        paddingBottom={20}
      >
        {Node}
      </Tree>
    </div>
  );
}

function Node({ node, style, dragHandle }: any) {
  const Icon = node.data.name === "Root" ? Monitor : (node.data.name === "Home" ? Home : (node.isOpen ? FolderOpen : Folder));

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    node.toggle();
  };

  const handleRowClick = () => {
    node.select();
    if (node.data.hasChildren) node.toggle();
  };

  return (
    <div
      style={style}
      ref={dragHandle}
      className={cn(
        "flex items-center gap-2 px-2 cursor-pointer hover:bg-accent rounded-sm transition-colors group",
        node.isSelected && "bg-accent"
      )}
      onClick={handleRowClick}
    >
      <div
        className="w-4 h-4 flex items-center justify-center hover:bg-muted-foreground/20 rounded-sm"
        onClick={handleChevronClick}
      >
        {node.data.hasChildren && (
          node.isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
        )}
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Icon className={cn("h-4 w-4 shrink-0", node.data.isLibrary ? "text-yellow-500" : "text-blue-500")} />
        <span className="text-base truncate select-none flex-1" title={node.data.path}>
          {node.data.name}
        </span>
        {node.data.isLibrary && (
          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
        )}
      </div>
    </div>
  );
}
