import { useControlCenterHealth } from "../hooks";

export function SystemHealthTab({ active }: { active: boolean }) {
  const { data, isLoading } = useControlCenterHealth(active);

  if (!active) return null;
  if (isLoading) return <p className="text-muted-foreground">Sağlık durumu yükleniyor...</p>;
  if (!data) return null;

  return (
    <pre className="overflow-auto rounded-md border bg-muted/30 p-4 text-xs">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
