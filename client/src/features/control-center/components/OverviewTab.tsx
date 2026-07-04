import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useControlCenterSummary } from "../hooks";

type OverviewTabProps = {
  onNavigate?: (tab: string) => void;
  active?: boolean;
};

const CARD_LINKS: Record<string, string> = {
  "Kuyruktaki aktarım": "import-jobs",
  "Çalışan aktarım": "import-jobs",
  "Aktarım onayı": "import-jobs",
  Başarısız: "import-jobs",
  Tamamlanan: "import-jobs",
  "Takip edilen ürün": "tracking",
  "Onay bekleyen değişiklik": "changes",
  "Manuel inceleme": "changes",
  Scheduler: "settings",
};

export function OverviewTab({ onNavigate, active = true }: OverviewTabProps) {
  const { data, isLoading, error } = useControlCenterSummary();

  if (!active) return null;

  if (isLoading) return <p className="text-muted-foreground">Yükleniyor...</p>;
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  const schedulerLabel = !data.tracking.trackingEnabled
    ? "Kapalı"
    : data.tracking.schedulerRunning
      ? "Aktif"
      : data.tracking.schedulerEnabled
        ? "Başlatılıyor"
        : "Kapalı";

  const cards = [
    { label: "Kuyruktaki aktarım", value: data.importJobs.queued },
    { label: "Çalışan aktarım", value: data.importJobs.running },
    { label: "Aktarım onayı", value: data.importJobs.awaitingApproval },
    { label: "Başarısız", value: data.importJobs.failed },
    { label: "Tamamlanan", value: data.importJobs.completed },
    { label: "Takip edilen ürün", value: data.tracking.trackedProducts },
    { label: "Onay bekleyen değişiklik", value: data.tracking.pendingChanges },
    { label: "Manuel inceleme", value: data.tracking.manualReview },
    { label: "Scheduler", value: schedulerLabel },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Kartlara tıklayarak ilgili sekmeye gidebilirsiniz.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const targetTab = CARD_LINKS[c.label];
          const clickable = Boolean(onNavigate && targetTab);
          return (
            <Card
              key={c.label}
              className={clickable ? "cursor-pointer transition-colors hover:bg-muted/40" : undefined}
              onClick={() => clickable && onNavigate!(targetTab)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {c.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{c.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
