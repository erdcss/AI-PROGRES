import { useState, memo } from "react";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sanitizeShopifyTags } from "@shared/shopify-tag-sanitizer";

type BulkTagToolbarProps = {
  productCount: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onAddTags: (tags: string[]) => void;
};

/**
 * Kendi state'inde tutulur — yazarken tüm CSV ürün kartları yeniden render olmaz.
 */
export const BulkTagToolbar = memo(function BulkTagToolbar({
  productCount,
  selectedCount,
  allSelected,
  onToggleSelectAll,
  onAddTags,
}: BulkTagToolbarProps) {
  const [bulkTagInput, setBulkTagInput] = useState("");

  const addBulkTags = () => {
    const tagsToAdd = sanitizeShopifyTags(
      bulkTagInput
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    );
    if (tagsToAdd.length === 0) return;
    onAddTags(tagsToAdd);
    setBulkTagInput("");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-zinc-800 bg-zinc-950/60">
      <Tag className="w-4 h-4 text-zinc-500 shrink-0" />
      <Input
        type="text"
        value={bulkTagInput}
        onChange={(e) => setBulkTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addBulkTags();
          }
        }}
        placeholder="Toplu etiket (virgülle ayırın)"
        className="flex-1 min-w-[200px] h-9 text-sm bg-zinc-900 border-zinc-800 text-zinc-200"
        data-testid="input-bulk-tags"
        spellCheck={false}
        autoComplete="off"
      />
      <Button type="button" onClick={addBulkTags} size="sm" className="h-9 bg-zinc-700 hover:bg-zinc-600">
        <Plus className="w-4 h-4 mr-1" />
        Ekle
      </Button>
      <Button
        type="button"
        onClick={onToggleSelectAll}
        size="sm"
        variant="outline"
        className="h-9 border-zinc-700 text-zinc-400"
      >
        {allSelected ? "Seçimi kaldır" : "Tümünü seç"}
      </Button>
      <span className="text-xs text-zinc-500 w-full sm:w-auto">
        {selectedCount > 0
          ? `${selectedCount} seçili ürüne uygulanır`
          : productCount > 0
            ? "Seçim yok — tüm ürünlere uygulanır"
            : ""}
      </span>
    </div>
  );
});
