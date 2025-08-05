import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import PageLayout from "@/components/PageLayout";

export default function NotFound() {
  return (
    <PageLayout
      title="404 - Sayfa Bulunamadı"
      subtitle="Aradığınız sayfa mevcut değil"
      backTo="/"
      backLabel="Ana Sayfa"
    >
      <div className="flex items-center justify-center">
        <Card className="glassmorphism-card border-0 shadow-2xl w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="h-16 w-16 text-red-400" />
              <h2 className="text-xl font-bold text-white">Sayfa Bulunamadı</h2>
              <p className="text-gray-300">
                Bu sayfa mevcut değil veya kaldırılmış olabilir.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
