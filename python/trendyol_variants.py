import scrapy
import json
import re


class TrendyolVariantsSpider(scrapy.Spider):
    name = "trendyol_variants"
    allowed_domains = ["trendyol.com"]
    start_urls = [
        "https://www.trendyol.com/sayina/kadin-bordo-tek-omuz-kemer-detayli-balenli-ozel-tasarim-astarli-sik-butik-mayo-p-682670844?boutiqueId=61&merchantId=381608"
    ]

    def parse(self, response):
        js_text = response.xpath(
            "//script[contains(., '__PRELOADED_STATE__')]/text()").get()
        if js_text:
            match = re.search(r'window\.__PRELOADED_STATE__\s*=\s*({.*});',
                              js_text, re.DOTALL)
            if match:
                json_text = match.group(1)
                try:
                    data = json.loads(json_text)
                    variants = data.get("product", {}).get("variants", [])
                    for v in variants:
                        productId = v.get("productId")
                        colorName = v.get("color")
                        variant_url = f"https://www.trendyol.com/-p-{productId}"
                        yield scrapy.Request(variant_url,
                                             callback=self.parse_variant,
                                             meta={"colorName": colorName})
                except Exception as e:
                    self.logger.error(f"JSON parse hatası: {e}")

    def parse_variant(self, response):
        # aynı mantık burada da geçerli
        color = response.meta.get("colorName")
        js_text = response.xpath(
            "//script[contains(., '__PRELOADED_STATE__')]/text()").get()
        attributes = {}
        stock_info = []
        product_name = ""
        images = []
        price = None
        if js_text:
            match = re.search(r'window\.__PRELOADED_STATE__\s*=\s*({.*});',
                              js_text, re.DOTALL)
            if match:
                json_text = match.group(1)
                try:
                    data = json.loads(json_text)
                    product = data.get("product", {})

                    product_name = product.get("name")
                    price = product.get("price", {}).get("sellingPrice", None)

                    attr = product.get("attributes", [])
                    for a in attr:
                        attributes[a.get("attributeName")] = a.get(
                            "attributeValue")

                    variants = product.get("variants", [])
                    for v in variants:
                        stock_info.append({
                            "size": v.get("size"),
                            "inStock": v.get("inStock"),
                            "variantId": v.get("variantId"),
                        })

                    medias = product.get("images", [])
                    for img in medias:
                        images.append(img.get("url"))

                except Exception as e:
                    self.logger.error(f"JSON parse hatası 2: {e}")

        yield {
            "product_name": product_name,
            "color": color,
            "price": price,
            "url": response.url,
            "images": images,
            "attributes": attributes,
            "stock_info": stock_info
        }
