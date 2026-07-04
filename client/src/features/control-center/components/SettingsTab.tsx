import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys } from "../query-keys";

async function fetchSettings() {
  const res = await fetch("/api/tracking/settings", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ayarlar yüklenemedi");
  return data.settings as Record<string, unknown>;
}

export function SettingsTab({ active }: { active: boolean }) {
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.all, "settings"],
    queryFn: fetchSettings,
    enabled: active,
  });

  if (isLoading) return <p className="text-muted-foreground">Ayarlar yükleniyor…</p>;
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Takip ve Scheduler Ayarları</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm md:grid-cols-2">
        {data &&
          Object.entries(data).map(([key, value]) => (
            <div key={key}>
              <span className="text-muted-foreground">{key}: </span>
              {String(value)}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
