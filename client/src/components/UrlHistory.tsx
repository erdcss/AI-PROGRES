import { memo, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { History } from "lucide-react";
import { getRecentUrls, subscribeRecentUrls } from "@/lib/url-history-client";

interface Props {
  onSelect: (url: string) => void;
}

export const UrlHistory = memo(function UrlHistory({ onSelect }: Props) {
  const [urls, setUrls] = useState<string[]>(() => getRecentUrls());

  useEffect(() => subscribeRecentUrls(() => setUrls(getRecentUrls())), []);

  if (urls.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <History className="w-3 h-3" />
        <span>Son kullanılan URL&apos;ler</span>
      </div>
      <div className="flex flex-col gap-1">
        {urls.map((url) => (
          <Button
            key={url}
            variant="ghost"
            className="text-left justify-start h-auto py-1 px-2 text-xs truncate bg-gray-900/50"
            onClick={() => onSelect(url)}
          >
            {url}
          </Button>
        ))}
      </div>
    </div>
  );
});
