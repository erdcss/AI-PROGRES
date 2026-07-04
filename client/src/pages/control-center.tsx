import { useMemo } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "@/features/control-center/components/OverviewTab";
import { ImportJobsTab } from "@/features/control-center/components/ImportJobsTab";
import { SystemHealthTab } from "@/features/control-center/components/SystemHealthTab";
import { ChangeApprovalTab } from "@/features/control-center/components/ChangeApprovalTab";
import { ShopifyTab } from "@/features/control-center/components/ShopifyTab";
import { TrackingProductsTab } from "@/features/control-center/components/TrackingProductsTab";
import { SettingsTab } from "@/features/control-center/components/SettingsTab";
import { ActivityLogTab } from "@/features/control-center/components/ActivityLogTab";

const TAB_IDS = [
  "overview",
  "import-jobs",
  "shopify",
  "tracking",
  "changes",
  "health",
  "settings",
  "activity",
] as const;

type TabId = (typeof TAB_IDS)[number];

function tabFromSearch(search: string): TabId {
  const tab = new URLSearchParams(search).get("tab");
  if (tab && TAB_IDS.includes(tab as TabId)) return tab as TabId;
  return "overview";
}

export default function ControlCenterPage() {
  const [location, setLocation] = useLocation();
  const activeTab = useMemo(() => {
    const q = location.includes("?") ? location.split("?")[1] : "";
    return tabFromSearch(q ? `?${q}` : "");
  }, [location]);

  const setTab = (tab: string) => {
    setLocation(`/control-center?tab=${tab}`);
  };

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Ürün Aktarım ve Takip Kontrol Merkezi
        </h1>
        <p className="text-muted-foreground">
          Çekim, doğrulama, Shopify aktarımı ve takip onaylarını tek yerden yönetin.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
          <TabsTrigger value="import-jobs">Ürün Aktarım İşleri</TabsTrigger>
          <TabsTrigger value="shopify">Shopify</TabsTrigger>
          <TabsTrigger value="tracking">Takip Edilen Ürünler</TabsTrigger>
          <TabsTrigger value="changes">Değişiklik Onayı</TabsTrigger>
          <TabsTrigger value="health">Sistem Sağlığı</TabsTrigger>
          <TabsTrigger value="settings">Ayarlar</TabsTrigger>
          <TabsTrigger value="activity">İşlem Geçmişi</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="import-jobs" className="mt-4">
          <ImportJobsTab active={activeTab === "import-jobs"} />
        </TabsContent>
        <TabsContent value="health" className="mt-4">
          <SystemHealthTab active={activeTab === "health"} />
        </TabsContent>
        <TabsContent value="shopify" className="mt-4">
          <ShopifyTab active={activeTab === "shopify"} />
        </TabsContent>
        <TabsContent value="tracking" className="mt-4">
          <TrackingProductsTab />
        </TabsContent>
        <TabsContent value="changes" className="mt-4">
          <ChangeApprovalTab active={activeTab === "changes"} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsTab active={activeTab === "settings"} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityLogTab active={activeTab === "activity"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
