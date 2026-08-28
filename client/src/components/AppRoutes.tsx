import { Switch, Route, Redirect } from "wouter";
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageTransition } from "@/components/PageTransition";
import ScraperPage from "@/pages/scraper";
import PriceComparisonPage from "@/pages/price-comparison";
import MarketplaceSelection from "@/pages/marketplace-selection";
import UrunHavuzuPage from "@/pages/urun-havuzu";
import WebHooksPage from "@/pages/web-hooks";
import ComingSoon from "@/pages/coming-soon";
import { TelegramPage } from "@/pages/telegram";
import EmailSettings from "@/pages/EmailSettings";
import ArcelikScraper from "@/pages/arcelik-scraper";
import PttAvmScraper from "@/pages/pttavm-scraper";
import AIEnhancedScraper from "@/pages/ai-enhanced-scraper";
import PriceMovementTest from "@/pages/price-movement-test";
import ProductDataAnalysisPage from "@/pages/product-data-analysis";
import SchedulerPage from "@/pages/scheduler";
import SystemStatusPage from "@/pages/system-status";
import ReplitAgent from "@/pages/replit-agent-fixed";
import SOSControl from "@/pages/sos-control";
import ProductReviews from "@/pages/product-reviews";
import TrendyolReviewsPage from "@/pages/trendyol-reviews";
import MemoryTrackingPage from "@/pages/MemoryTrackingPage";
import SavedUrlsPage from "@/pages/SavedUrlsPage";
import ProductPreview from "@/pages/product-preview";
import TelegramNotifications from "@/pages/TelegramNotifications";
import BildirimlerPage from "@/pages/bildirimler";
import UrunTakipPage from "@/pages/urun-takip";
import ControlCenterPage from "@/pages/control-center";
import TelegramManagementPage from "@/pages/TelegramManagementPage";
import ProductStatisticsPage from "@/pages/ProductStatisticsPage";
import MemoryDashboard from "@/pages/memory-dashboard";
import BaglantiApiPage from "@/pages/baglanti-api";
import ShopifyCategoriesPage from "@/pages/shopify-categories";

export function AppRoutes() {
  const isMobile = useIsMobile();

  const scraperShell = (content: ReactNode) => (
    <div className={`mx-auto ${isMobile ? "px-4 py-4 max-w-full" : "container px-4 py-4"}`}>
      {content}
    </div>
  );

  return (
    <Switch>
      <Route path="/">
        <PageTransition>
          <MarketplaceSelection />
        </PageTransition>
      </Route>
      <Route path="/marketplace">
        <PageTransition>
          <MarketplaceSelection />
        </PageTransition>
      </Route>
      <Route path="/coming-soon/:platform?">
        {(params) => (
          <PageTransition>
            <ComingSoon platform={params && params.platform} />
          </PageTransition>
        )}
      </Route>
      <Route path="/scraper/:platform?">
        <PageTransition>{scraperShell(<ScraperPage />)}</PageTransition>
      </Route>
      <Route path="/urun-havuzu">
        <PageTransition>
          <UrunHavuzuPage />
        </PageTransition>
      </Route>
      <Route path="/web-hooks">
        <PageTransition>
          <WebHooksPage />
        </PageTransition>
      </Route>
      <Route path="/web-sitesi-kancalari">
        <PageTransition>
          <WebHooksPage />
        </PageTransition>
      </Route>
      <Route path="/trendyol">
        <PageTransition>{scraperShell(<ScraperPage />)}</PageTransition>
      </Route>
      <Route path="/price-comparison">
        <PageTransition>
          <PriceComparisonPage />
        </PageTransition>
      </Route>
      <Route path="/telegram">
        <PageTransition>
          <TelegramPage />
        </PageTransition>
      </Route>
      <Route path="/email">
        <PageTransition>
          <EmailSettings />
        </PageTransition>
      </Route>
      <Route path="/product-data-analysis">
        <PageTransition>
          <ProductDataAnalysisPage />
        </PageTransition>
      </Route>
      <Route path="/data-analysis">
        <PageTransition>
          <ProductDataAnalysisPage />
        </PageTransition>
      </Route>
      <Route path="/saved-urls">
        <PageTransition>
          <SavedUrlsPage />
        </PageTransition>
      </Route>
      <Route path="/scheduler">
        <PageTransition>
          <SchedulerPage />
        </PageTransition>
      </Route>
      <Route path="/system-status">
        <PageTransition>
          <SystemStatusPage />
        </PageTransition>
      </Route>
      <Route path="/replit-agent">
        <PageTransition>
          <ReplitAgent />
        </PageTransition>
      </Route>
      <Route path="/sos-control">
        <PageTransition>
          <SOSControl />
        </PageTransition>
      </Route>
      <Route path="/product-reviews">
        <PageTransition>
          <ProductReviews />
        </PageTransition>
      </Route>
      <Route path="/trendyol-reviews">
        <PageTransition>
          <TrendyolReviewsPage />
        </PageTransition>
      </Route>
      <Route path="/memory-tracking">
        <PageTransition>
          <MemoryTrackingPage />
        </PageTransition>
      </Route>
      <Route path="/control-center">
        <PageTransition>
          <ControlCenterPage />
        </PageTransition>
      </Route>
      <Route path="/tracking-dashboard">
        <Redirect to="/control-center?tab=tracking" />
      </Route>
      <Route path="/arcelik">
        <PageTransition>
          <ArcelikScraper />
        </PageTransition>
      </Route>
      <Route path="/scraper/arcelik">
        <PageTransition>
          <ArcelikScraper />
        </PageTransition>
      </Route>
      <Route path="/pttavm">
        <PageTransition>
          <PttAvmScraper />
        </PageTransition>
      </Route>
      <Route path="/scraper/pttavm">
        <PageTransition>
          <PttAvmScraper />
        </PageTransition>
      </Route>
      <Route path="/ai-enhanced">
        <PageTransition>
          <AIEnhancedScraper />
        </PageTransition>
      </Route>
      <Route path="/price-movement-test">
        <PageTransition>
          <PriceMovementTest />
        </PageTransition>
      </Route>
      <Route path="/shopify-tracking">
        <Redirect to="/control-center?tab=shopify" />
      </Route>
      <Route path="/product-preview">
        <PageTransition>
          <ProductPreview />
        </PageTransition>
      </Route>
      <Route path="/telegram-notifications">
        <PageTransition>
          <TelegramNotifications />
        </PageTransition>
      </Route>
      <Route path="/bildirimler">
        <PageTransition>
          <BildirimlerPage />
        </PageTransition>
      </Route>
      <Route path="/product-tracking">
        <Redirect to="/control-center?tab=tracking" />
      </Route>
      <Route path="/urun-takip">
        <PageTransition>
          <UrunTakipPage />
        </PageTransition>
      </Route>
      <Route path="/kategoriler">
        <PageTransition>
          <ShopifyCategoriesPage />
        </PageTransition>
      </Route>
      <Route path="/memory-dashboard">
        <MemoryDashboard />
      </Route>
      <Route path="/shopify-system">
        <Redirect to="/control-center?tab=shopify" />
      </Route>
      <Route path="/baglanti-api">
        <PageTransition>
          <BaglantiApiPage />
        </PageTransition>
      </Route>
      <Route path="/telegram-management">
        <PageTransition>
          <TelegramManagementPage />
        </PageTransition>
      </Route>
      <Route path="/product-statistics/:id">
        {(params) => (
          <PageTransition>
            <ProductStatisticsPage />
          </PageTransition>
        )}
      </Route>
    </Switch>
  );
}
