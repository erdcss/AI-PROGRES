
import scrapy

class TrendyolSpider(scrapy.Spider):
    name = "urun_gorseli"
    allowed_domains = ["trendyol.com"]
    start_urls = ["https://www.trendyol.com/sr?q=telefon"]

    def parse(self, response):
        for product in response.css("div.p-card-wrppr"):
            yield {
                "title": product.css("span.prdct-desc-cntnr-name::text").get(),
                "image_url": product.css("img::attr(src)").get(),
                "price": product.css("div.prc-box-dscntd::text").get()
            }

        next_page = response.css("a[rel='next']::attr(href)").get()
        if next_page:
            yield response.follow(next_page, callback=self.parse)
