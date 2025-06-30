import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const RealTimeClock = ({ className = "" }: { className?: string }) => {
  const [currentDateTime, setCurrentDateTime] = useState<string>('');

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('tr-TR');
      const timeStr = now.toLocaleTimeString('tr-TR');
      setCurrentDateTime(`${dateStr} ${timeStr}`);
    };

    updateDateTime(); // Initial update
    const dateTimeInterval = setInterval(updateDateTime, 1000);

    return () => clearInterval(dateTimeInterval);
  }, []);

  return (
    <Badge variant="secondary" className={`bg-white/10 text-white border-white/20 px-4 py-2 ${className}`}>
      <Clock className="h-4 w-4 mr-2" />
      {currentDateTime}
    </Badge>
  );
};