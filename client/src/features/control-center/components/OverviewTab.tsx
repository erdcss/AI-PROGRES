import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useControlCenterSummary } from "../hooks";

export function OverviewTab() {
  const { data, isLoading, error } = useControlCenterSummary();

  if (isLoading) return <p className="text-muted-foreground">Yükleniyor...</p>;
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  const cards = [
    { label: "Kuyruktaki aktarım", value: data.importJobs.queued },
    { label: "Çalışan aktarım", value: data.importJobs.running },
    { label: "Onay bekleyen", value: data.importJobs.awaitingApproval },
    { label: "Başarısız", value: data.importJobs.failed },
    { label: "Tamamlanan", value: data.importJobs.completed },
    { label: "Takip edilen ürün", value: data.tracking.trackedProducts },
    { label: "Bekleyen değişiklik", value: data.tracking.pendingChanges },
    {
      label: "Scheduler",
      value: data.tracking.schedulerRunning ? "Aktif" : "Kapalı",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {c.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
