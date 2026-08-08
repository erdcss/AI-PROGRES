import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type RealTimeClockProps = {
  className?: string;
  /** pool = Ürün Havuzu / ana sayfa siyah tema */
  variant?: "default" | "pool";
};

export const RealTimeClock = ({
  className = "",
  variant = "default",
}: RealTimeClockProps) => {
  const [currentDateTime, setCurrentDateTime] = useState("");
  const timeOnly = currentDateTime.includes(" ")
    ? currentDateTime.split(" ").slice(1).join(" ")
    : currentDateTime;

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString("tr-TR");
      const timeStr = now.toLocaleTimeString("tr-TR");
      setCurrentDateTime(`${dateStr} ${timeStr}`);
    };

    updateDateTime();
    const dateTimeInterval = setInterval(updateDateTime, 1000);
    return () => clearInterval(dateTimeInterval);
  }, []);

  if (variant === "pool") {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-black/90 px-3 py-1.5 text-xs text-zinc-200 shadow-[0_8px_28px_rgba(0,0,0,0.55)] backdrop-blur-md sm:px-4 sm:py-2 sm:text-sm ${className}`}
        data-testid="realtime-clock-pool"
        style={{ fontWeight: 300 }}
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950">
          <Clock className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.25} />
        </span>
        <span
          className="hidden tabular-nums tracking-wide text-zinc-200 sm:inline"
          style={{ color: "#e4e4e7", fontWeight: 300 }}
        >
          {currentDateTime}
        </span>
        <span
          className="tabular-nums tracking-wide text-zinc-200 sm:hidden"
          style={{ color: "#e4e4e7", fontWeight: 300 }}
        >
          {timeOnly || currentDateTime}
        </span>
      </div>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={`bg-white/10 text-white border-white/20 px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm ${className}`}
    >
      <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
      <span className="hidden sm:inline">{currentDateTime}</span>
      <span className="sm:hidden">{timeOnly}</span>
    </Badge>
  );
};
