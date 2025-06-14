
BOT_NAME = "trendyol"

SPIDER_MODULES = ["trendyol.spiders"]
NEWSPIDER_MODULE = "trendyol.spiders"

USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
ROBOTSTXT_OBEY = False
DOWNLOAD_DELAY = 1.5

AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 1.0
AUTOTHROTTLE_MAX_DELAY = 5.0
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0

DOWNLOADER_MIDDLEWARES = {
    "trendyol.middlewares.RandomUserAgentMiddleware": 400,
}
