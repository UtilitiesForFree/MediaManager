import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { commands, AppConfig } from "@/ipc";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { applyTheme } from "@/App";
import { Monitor, Info, Zap, RefreshCw, Cloud, Eye, EyeOff } from "lucide-react";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingImmich, setTestingImmich] = useState(false);

  useEffect(() => {
    if (open) {
      commands.getConfig().then(res => {
        if (res.ok) setConfig(res.value);
        setLoading(false);
      });
    }
  }, [open]);

  const handleSave = async () => {
    if (!config) return;
    const res = await commands.updateConfig(config);
    if (res.ok) {
      toast({ title: "Settings saved" });
      i18n.changeLanguage(config.language);
      applyTheme(config.theme);
      onOpenChange(false);
    } else {
      toast({ title: "Error saving settings", variant: "destructive" });
    }
  };

  const handleTestImmich = async () => {
    if (!config) return;
    setTestingImmich(true);
    const res = await commands.pingImmich(config.immichUrl, config.immichApiKey);
    setTestingImmich(false);
    if (res.ok) {
      toast({ title: "Immich connection successful" });
    } else {
      toast({ title: `Connection failed — ${res.error.message}`, variant: "destructive" });
    }
  };

  if (loading || !config) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[660px] h-[500px] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("settings:title")}</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="general" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="general" className="gap-1 text-[11px]"><Monitor className="h-3 w-3" /> {t("settings:general")}</TabsTrigger>
            <TabsTrigger value="library" className="gap-1 text-[11px]"><Zap className="h-3 w-3" /> {t("settings:library")}</TabsTrigger>
            <TabsTrigger value="performance" className="gap-1 text-[11px]"><Zap className="h-3 w-3" /> Perf</TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1 text-[11px]"><Cloud className="h-3 w-3" /> Sync</TabsTrigger>
            <TabsTrigger value="updates" className="gap-1 text-[11px]"><RefreshCw className="h-3 w-3" /> {t("settings:updates")}</TabsTrigger>
            <TabsTrigger value="about" className="gap-1 text-[11px]"><Info className="h-3 w-3" /> {t("settings:about")}</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4 pr-4">
            <TabsContent value="general" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>{t("settings:language")}</Label>
                  <Select 
                    value={config.language} 
                    onValueChange={(v) => setConfig({ ...config, language: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="el">Ελληνικά</SelectItem>
                      <SelectItem value="sq">Shqip</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>{t("settings:theme")}</Label>
                  <Select 
                    value={config.theme} 
                    onValueChange={(v) => setConfig({ ...config, theme: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label>{t("settings:mapPreview")}</Label>
                  <Switch checked={false} disabled />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="library" className="space-y-6 mt-0">
              <div className="grid gap-2">
                <Label>Libraries Root</Label>
                <div className="flex gap-2">
                  <Input value={config.librariesRoot} readOnly className="bg-muted" />
                  <Button variant="outline" size="sm">Change</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="performance" className="space-y-6 mt-0">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Thumbnail Cache Cap: {config.thumbCacheSizeMb / 1024} GB</Label>
                  <Slider 
                    value={[config.thumbCacheSizeMb]} 
                    min={1024} 
                    max={20480} 
                    step={1024}
                    onValueChange={([v]) => setConfig({ ...config, thumbCacheSizeMb: v })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Workers</Label>
                  <Select 
                    value={config.thumbWorkers} 
                    onValueChange={(v) => setConfig({ ...config, thumbWorkers: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="8">8</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="integrations" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold mb-1">Immich</h4>
                  <p className="text-xs text-muted-foreground mb-4">
                    Sync library photos to your self-hosted Immich server.
                  </p>
                  <div className="space-y-3">
                    <div className="grid gap-2">
                      <Label>Server URL</Label>
                      <Input
                        placeholder="https://immich.yourdomain.com"
                        value={config.immichUrl}
                        onChange={(e) => setConfig({ ...config, immichUrl: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>API Key</Label>
                      <div className="flex gap-2">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          placeholder="Paste your Immich API key"
                          value={config.immichApiKey}
                          onChange={(e) => setConfig({ ...config, immichApiKey: e.target.value })}
                          className="flex-1 font-mono text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => setShowApiKey(v => !v)}
                        >
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestImmich}
                      disabled={testingImmich || !config.immichUrl || !config.immichApiKey}
                    >
                      {testingImmich ? "Testing…" : "Test Connection"}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="about" className="space-y-4 mt-0">
              <div className="text-center py-4">
                <h4 className="font-bold text-lg">MediaManager</h4>
                <p className="text-xs text-muted-foreground">Version 1.0.0 (v1.0.0-dev)</p>
              </div>
              <div className="text-xs text-muted-foreground space-y-2">
                <p>A cross-platform desktop media manager built with Tauri and React.</p>
                <p>© 2026 MediaManager Team. MIT License.</p>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common:cancel")}</Button>
          <Button onClick={handleSave}>{t("common:save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { ScrollArea } from "@/components/ui/scroll-area";
