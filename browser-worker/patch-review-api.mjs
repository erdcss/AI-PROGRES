import fs from "node:fs";

const file = new URL("./server.ts", import.meta.url);
let source = fs.readFileSync(file, "utf8");

if (source.includes("review-api-multi-shape-v2")) {
  console.log("[review-api-patch] already applied");
  process.exit(0);
}

const startNeedle = "      const fetchPage = (pageIndex: number) => trendyolPacer.run(async () => {";
const endNeedle = "      const result = await collectReviewPages({ fetchPage, startPage: input.startPage, maxPages, deadline });";
const start = source.indexOf(startNeedle);
const end = source.indexOf(endNeedle, start);

if (start < 0 || end < 0 || end <= start) {
  throw new Error("[review-api-patch] Trendyol review fetchPage anchors not found");
}

const replacement = `      // review-api-multi-shape-v2
      // Trendyol yorum servisi zaman içinde endpoint ve JSON şekli değiştirdi.
      // Gerçek tarayıcı oturumunda yeni + eski endpointleri ve gömülü review props'u
      // birlikte destekle; 403 alan Railway direct HTTP yoluna geri dönme.
      const fetchPage = (pageIndex: number) => trendyolPacer.run(async () => {
        const batch = await page.evaluate(async ({ pid, index, size, timeout }) => {
          const readNumber = (...values: unknown[]): number | null => {
            for (const value of values) {
              const n = Number(value);
              if (Number.isFinite(n)) return n;
            }
            return null;
          };

          const parsePayload = (json: any) => {
            const result = json?.result ?? json?.data ?? json ?? {};
            const productReviews = result?.productReviews ?? result?.reviewsPage ?? result?.reviewList ?? null;
            const rows =
              Array.isArray(result?.reviews) ? result.reviews :
              Array.isArray(productReviews?.content) ? productReviews.content :
              Array.isArray(productReviews?.reviews) ? productReviews.reviews :
              Array.isArray(result?.content) ? result.content :
              Array.isArray(result?.items) ? result.items :
              null;
            const totalPages = readNumber(
              productReviews?.totalPages,
              result?.totalPages,
              result?.summary?.totalPages,
              json?.totalPages,
            );
            const totalElements = readNumber(
              productReviews?.totalElements,
              productReviews?.total,
              result?.totalElements,
              result?.total,
              result?.summary?.totalCommentCount,
              result?.summary?.commentCount,
              result?.summary?.reviewCount,
            );
            const averageRating = readNumber(
              result?.summary?.averageRating,
              result?.summary?.averageRate,
              result?.summary?.rating,
              productReviews?.averageRating,
              productReviews?.averageRate,
            );
            const summary = {
              ...(result?.summary && typeof result.summary === "object" ? result.summary : {}),
              ...(productReviews?.summary && typeof productReviews.summary === "object" ? productReviews.summary : {}),
              ...(totalPages != null ? { totalPages } : {}),
              ...(totalElements != null ? {
                totalElements,
                total: totalElements,
                reviewCount: totalElements,
                totalReviewCount: totalElements,
                totalCommentCount: totalElements,
                commentCount: totalElements,
              } : {}),
              ...(averageRating != null ? { averageRating, rating: averageRating } : {}),
            };
            return { rows, summary, totalElements };
          };

          const attempts = [
            {
              provider: "storefront-v2",
              url: "https://apigw.trendyol.com/discovery-storefront-trproductgw-service/api/review-read/product-reviews/detailed",
              page: index,
              extra: { pageSize: size, storefrontId: "1", countryCode: "TR", language: "tr" },
            },
            {
              provider: "santral-v1",
              url: "https://apigw.trendyol.com/discovery-web-websfxsocialreviewrating-santral/product-reviews-detailed",
              // Eski servis sahada 1-based page ile de görülüyor.
              page: index + 1,
              extra: {},
            },
          ];

          let lastStatus = 0;
          let lastRetryAfter: string | null = null;
          let lastError = "Yorum API yanıtı doğrulanamadı.";

          for (const attempt of attempts) {
            try {
              const apiUrl = new URL(attempt.url);
              Object.entries({
                contentId: pid,
                page: String(attempt.page),
                pageSize: String(size),
                order: "DESC",
                orderBy: "Score",
                channelId: "1",
                ...attempt.extra,
              }).forEach(([key, value]) => apiUrl.searchParams.set(key, String(value)));

              const res = await fetch(apiUrl.toString(), {
                credentials: "include",
                headers: {
                  Accept: "application/json, text/plain, */*",
                  "Accept-Language": "tr-TR,tr;q=0.9",
                  "X-Requested-With": "XMLHttpRequest",
                },
                signal: AbortSignal.timeout(timeout),
              });
              lastStatus = res.status;
              lastRetryAfter = res.headers.get("retry-after");
              const json = await res.json().catch(() => null);
              const parsed = parsePayload(json);
              const hasRows = Array.isArray(parsed.rows);
              const verifiedEmpty = hasRows && parsed.rows.length === 0 && parsed.totalElements === 0;
              const valid = res.ok && json?.isSuccess !== false && (hasRows || verifiedEmpty);

              if (valid) {
                return {
                  ok: true,
                  status: res.status,
                  reviews: parsed.rows || [],
                  summary: parsed.summary,
                  retryAfter: lastRetryAfter,
                  provider: attempt.provider,
                  errorText: "",
                };
              }
              lastError = \`\${attempt.provider} yorum yanıtı doğrulanamadı (HTTP \${res.status}).\`;
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);
            }
          }

          // Bazı sürümlerde ilk yorum sayfası API çağrısından önce props içine gömülür.
          if (index === 0) {
            const props = (window as any)["__review-detail__PROPS"] ??
              (window as any)["__REVIEW_DETAIL_PROPS__"] ?? null;
            if (props) {
              const parsed = parsePayload(props);
              if (Array.isArray(parsed.rows)) {
                return {
                  ok: true,
                  status: 200,
                  reviews: parsed.rows,
                  summary: parsed.summary,
                  retryAfter: null,
                  provider: "embedded-props",
                  errorText: "",
                };
              }
            }
          }

          return {
            ok: false,
            status: lastStatus || 422,
            reviews: [],
            summary: null,
            retryAfter: lastRetryAfter,
            provider: "none",
            errorText: lastError,
          };
        }, {
          pid: productId,
          index: pageIndex,
          size: pageSize,
          timeout: Math.max(1, Math.min(20_000, deadline - Date.now())),
        });

        if (batch.ok) {
          console.log("[scrape/trendyol-reviews] page", {
            productId,
            pageIndex,
            provider: (batch as any).provider,
            reviews: batch.reviews.length,
            totalPages: Number(batch.summary?.totalPages) || null,
            totalElements: Number(batch.summary?.totalElements) || null,
          });
        } else {
          console.warn("[scrape/trendyol-reviews] page failed", {
            productId,
            pageIndex,
            status: batch.status,
            error: batch.errorText,
          });
        }

        return {
          ...batch,
          retryAfterMs: batch.status === 429 ? trendyolPacer.pause(batch.retryAfter) : undefined,
        };
      });
`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(file, source);
console.log("[review-api-patch] multi-endpoint/multi-shape Trendyol review support applied");
