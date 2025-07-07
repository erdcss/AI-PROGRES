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
    <Badge variant="secondary" className={`bg-white/10 text-white border-white/20 px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm ${className}`}>
      <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
      <span className="hidden sm:inline">{currentDateTime}</span>
      <span className="sm:hidden">{currentDateTime.split(' ')[1]}</span>
    </Badge>
  );
};