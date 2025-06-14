import scrapy

class TrendyolSpider(scrapy.Spider):
    name = 'urun_gorseli'
    start_urls = ['https://www.trendyol.com/sr?q=ayakkabı']

    def parse(self, response):
        for product in response.css('div.p-card-wrppr'):
            yield {
                'title': product.css('span.prdct-desc-cntnr-name::text').get(),
                'image_url': product.css('img::attr(src)').get(),
                'price': product.css('div.prc-box-dscntd::text').get()
            }