import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// 1) API routes
{
  const file = path.join(root, "server/routes/tracking-routes.ts");
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes('/api/tracking/full-scan/status')) {
    const anchor = '  app.post("/api/tracking/cleanup-invalid", async (req, res) => {';
    if (!src.includes(anchor)) throw new Error("[full-tracking-scan] tracking route anchor not found");
    const block = `  app.get("/api/tracking/full-scan/status", async (_req, res) => {\n    try {\n      const { getFullTrackingScanStatus } = await import("../services/tracking-full-scan.service");\n      return res.json({ success: true, ...getFullTrackingScanStatus() });\n    } catch (err) {\n      return migrationErrorResponse(res, err);\n    }\n  });\n\n  app.post("/api/tracking/full-scan/start", async (_req, res) => {\n    try {\n      const { startFullTrackingScan } = await import("../services/tracking-full-scan.service");\n      const result = startFullTrackingScan();\n      return res.status(result.started ? 202 : 409).json({ success: true, ...result });\n    } catch (err) {\n      return migrationErrorResponse(res, err);\n    }\n  });\n\n`;
    src = src.replace(anchor, block + anchor);
    fs.writeFileSync(file, src);
  }
}

// 2) UI: status polling, mutation, button
{
  const file = path.join(root, "client/src/pages/urun-takip.tsx");
  let src = fs.readFileSync(file, "utf8");

  if (!src.includes('queryKey: ["tracking-full-scan-status"]')) {
    const anchor = '  const saveSettingsMutation = useMutation({';
    if (!src.includes(anchor)) throw new Error("[full-tracking-scan] UI query anchor not found");
    const block = `  const fullScanStatusQuery = useQuery({\n    queryKey: ["tracking-full-scan-status"],\n    queryFn: async () => {\n      const res = await fetch("/api/tracking/full-scan/status", { cache: "no-store" });\n      const data = await res.json();\n      if (!res.ok) throw new Error(data.error || "Takip tarama durumu alınamadı");\n      return data as {\n        running: boolean; total: number; checked: number; succeeded: number; failed: number; skipped: number;\n        marktGoLive: number; marktGoImported: number; marktGoRemoved: number; message: string;\n      };\n    },\n    refetchInterval: (query) => query.state.data?.running ? 2000 : 10000,\n  });\n\n`;
    src = src.replace(anchor, block + anchor);
  }

  if (!src.includes('const fullScanMutation = useMutation({')) {
    const anchor = '  const changeActionMutation = useMutation({';
    if (!src.includes(anchor)) throw new Error("[full-tracking-scan] UI mutation anchor not found");
    const block = `  const fullScanMutation = useMutation({\n    mutationFn: async () => {\n      const res = await fetch("/api/tracking/full-scan/start", { method: "POST" });\n      const data = await res.json();\n      if (!res.ok && res.status !== 409) throw new Error(data.error || "Takip başlatılamadı");\n      return data;\n    },\n    onSuccess: (data) => {\n      queryClient.invalidateQueries({ queryKey: ["tracking-full-scan-status"] });\n      refreshTrackingQueries();\n      toast({\n        title: data.started === false ? "Takip zaten çalışıyor" : "Takip başlatıldı",\n        description: data.status?.message || "Kaynak URL, stok, varyant, fiyat ve MARKT-GO kontrol ediliyor.",\n      });\n    },\n    onError: (err: Error) => toast({ title: "Takip başlatılamadı", description: err.message, variant: "destructive" }),\n  });\n\n`;
    src = src.replace(anchor, block + anchor);
  }

  if (!src.includes('data-testid="button-start-full-tracking-scan"')) {
    const oldBlock = `                <Button variant="ghost" size="sm" onClick={() => changesQuery.refetch()}>\n                  <RefreshCw className={\`w-4 h-4 mr-1 \${changesQuery.isFetching ? "animate-spin" : ""}\`} />\n                  Yenile\n                </Button>`;
    if (!src.includes(oldBlock)) throw new Error("[full-tracking-scan] Yenile button anchor not found");
    const newBlock = `                <Button\n                  size="sm"\n                  onClick={() => fullScanMutation.mutate()}\n                  disabled={fullScanMutation.isPending || fullScanStatusQuery.data?.running}\n                  data-testid="button-start-full-tracking-scan"\n                >\n                  <Play className="w-4 h-4 mr-1" />\n                  {fullScanStatusQuery.data?.running\n                    ? \`Kontrol ediliyor \${fullScanStatusQuery.data.checked}/\${fullScanStatusQuery.data.total}\`\n                    : "Takibi Başlat"}\n                </Button>\n                <Button variant="ghost" size="sm" onClick={() => changesQuery.refetch()}>\n                  <RefreshCw className={\`w-4 h-4 mr-1 \${changesQuery.isFetching ? "animate-spin" : ""}\`} />\n                  Yenile\n                </Button>`;
    src = src.replace(oldBlock, newBlock);
  }

  fs.writeFileSync(file, src);
}

console.log("[full-tracking-scan] Değişiklikler sekmesine Takibi Başlat + kaynak/MARKT-GO tam kontrol eklendi");
