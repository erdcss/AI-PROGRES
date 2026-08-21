import { useState, memo, useCallback } from 'react';
import { ProductPreview, type CSVPreviewData } from '@/components/CSVDrawerProductPreview';
import { FileText, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isBlockedShopifyTag, sanitizeShopifyTags } from '@shared/shopify-tag-sanitizer';
import { BulkTagToolbar } from '@/components/BulkTagToolbar';

interface CSVDrawerPreviewProps {
  csvPreviews: CSVPreviewData[];
  onDownload: (id: string, filename: string) => void;
  onShopifyUpload: (id: string, individualTags?: string[]) => void;
  individualTags: {[key: string]: string[]};
  setIndividualTags: React.Dispatch<React.SetStateAction<{[key: string]: string[]}>>;
  uploadingId?: string | null;
}

export const CSVDrawerPreview = memo(function CSVDrawerPreview({
  csvPreviews,
  onDownload,
  onShopifyUpload,
  individualTags,
  setIndividualTags,
  uploadingId,
}: CSVDrawerPreviewProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedImageIndex, setSelectedImageIndex] = useState<{[key: string]: number}>({});
  const [selectedPreviews, setSelectedPreviews] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const nextImage = (previewId: string, totalImages: number) => {
    setSelectedImageIndex((prev) => ({
      ...prev,
      [previewId]: ((prev[previewId] || 0) + 1) % totalImages,
    }));
  };

  const prevImage = (previewId: string, totalImages: number) => {
    setSelectedImageIndex((prev) => ({
      ...prev,
      [previewId]: ((prev[previewId] || 0) - 1 + totalImages) % totalImages,
    }));
  };

  const removeTag = (previewId: string, tagIndex: number) => {
    setIndividualTags((prev) => ({
      ...prev,
      [previewId]: (prev[previewId] || []).filter((_, i) => i !== tagIndex),
    }));
  };

  const toggleSelectAll = useCallback(() => {
    setSelectedPreviews((prev) => {
      if (prev.size === csvPreviews.length) return new Set();
      return new Set(csvPreviews.map((p) => p.id));
    });
  }, [csvPreviews]);

  const toggleSelectPreview = (id: string) => {
    setSelectedPreviews((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addBulkTags = useCallback(
    (tagsToAdd: string[]) => {
      if (!tagsToAdd.length) return;
      setIndividualTags((prev) => {
        const updated = { ...prev };
        const targets =
          selectedPreviews.size > 0
            ? csvPreviews.filter((p) => selectedPreviews.has(p.id))
            : csvPreviews;
        for (const preview of targets) {
          const existingTags = prev[preview.id] || [];
          const newTags = tagsToAdd.filter((tag) => !existingTags.includes(tag));
          if (newTags.length > 0) {
            updated[preview.id] = [...existingTags, ...newTags];
          }
        }
        return updated;
      });
    },
    [csvPreviews, selectedPreviews, setIndividualTags],
  );

  const parseCSVContent = (csvContent: string, csvPreview?: { headers?: string[]; rows?: string[][] }) => {
    if (csvPreview?.headers?.length) {
      return {
        headers: csvPreview.headers,
        rows: (csvPreview.rows ?? []).slice(0, 5),
      };
    }
    const lines = csvContent.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
    const rows = lines.slice(1, 6).map((line) =>
      line.split(',').map((cell) => cell.replace(/"/g, '').trim()),
    );
    return { headers, rows };
  };

  if (csvPreviews.length === 0) {
    return (
      <Card className="business-card border-zinc-800">
        <CardHeader className="business-header">
          <CardTitle className="text-zinc-100 font-thin text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-zinc-500" />
            CSV Önizleme
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8">
          <div className="text-center py-6">
            <Package className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">Henüz CSV önizlemesi yok</p>
            <p className="text-zinc-600 text-sm mt-1">Ürün çektikten sonra burada görünecek</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-zinc-500" />
          <h2 className="text-zinc-100 font-medium text-lg">CSV Önizleme</h2>
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-400">
            {csvPreviews.length} ürün
          </Badge>
        </div>
      </div>

      <BulkTagToolbar
        productCount={csvPreviews.length}
        selectedCount={selectedPreviews.size}
        allSelected={selectedPreviews.size === csvPreviews.length && csvPreviews.length > 0}
        onToggleSelectAll={toggleSelectAll}
        onAddTags={addBulkTags}
      />

      <div className="space-y-4 w-full">
        {csvPreviews.map((preview) => {
          const safeTitle =
            typeof preview.productTitle === 'string' && preview.productTitle.trim()
              ? preview.productTitle
              : 'Ürün';
          const safeCsvContent = typeof preview.csvContent === 'string' ? preview.csvContent : '';
          const { headers, rows } = parseCSVContent(safeCsvContent, preview.csvPreview);
          const imageCount = Array.isArray(preview.images) ? preview.images.length : 0;

          return (
            <ProductPreview
              key={preview.id}
              preview={preview}
              imageIndex={selectedImageIndex[preview.id] || 0}
              tags={individualTags[preview.id] || []}
              onPrevImage={() => prevImage(preview.id, Math.max(imageCount, 1))}
              onNextImage={() => nextImage(preview.id, Math.max(imageCount, 1))}
              onSelectImage={(index) =>
                setSelectedImageIndex((prev) => ({ ...prev, [preview.id]: index }))
              }
              onRemoveTag={(tagIndex) => removeTag(preview.id, tagIndex)}
              onAddTag={(tag) => {
                if (isBlockedShopifyTag(tag)) return;
                setIndividualTags((prev) => ({
                  ...prev,
                  [preview.id]: sanitizeShopifyTags([...(prev[preview.id] || []), tag]),
                }));
              }}
              selected={selectedPreviews.has(preview.id)}
              onSelectChange={() => toggleSelectPreview(preview.id)}
              isExpanded={expandedItems.has(preview.id)}
              onToggleExpand={() => toggleExpanded(preview.id)}
              onDownload={() =>
                onDownload(preview.id, `${safeTitle.replace(/[^a-zA-Z0-9]/g, '-')}.csv`)
              }
              onShopifyUpload={() => onShopifyUpload(preview.id, individualTags[preview.id])}
              isUploading={uploadingId === preview.id}
              uploadDisabled={
                !!uploadingId ||
                preview.restoredFromDisk === true ||
                preview.shopifyUploadBlocked === true
              }
              uploadDisabledReason={preview.blockReason}
              csvHeaders={headers}
              csvRows={rows}
            />
          );
        })}
      </div>
    </div>
  );
});
