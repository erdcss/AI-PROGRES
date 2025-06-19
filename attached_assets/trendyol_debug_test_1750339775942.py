
import requests, re, json, csv, unicodedata

def slugify(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')

def fetch_trendyol_html(url):
    headers = { "User-Agent": "Mozilla/5.0" }
    res = requests.get(url, headers=headers)
    return res.text

def extract_variants(html):
    match = re.search(r'window\.TYPageData\s*=\s*({.*?});', html, re.DOTALL)
    if not match:
        print("❌ Varyant bilgisi bulunamadı.")
        with open("debug-raw.html", "w", encoding="utf-8") as f:
            f.write(html)
        return [], {}, "Ürün"
    data = json.loads(match.group(1))
    variants = data.get("product", {}).get("variants", [])
    images = data.get("product", {}).get("variantImageMap", {})
    title = data.get("product", {}).get("name", "Ürün")
    return variants, images, title

def save_shopify_csv(variants, image_map, title, filename="shopify-variants.csv"):
    with open(filename, "w", newline="", encoding="utf-8-sig") as csvfile:
        fieldnames = [
            "Handle", "Title", "Option1 Name", "Option1 Value",
            "Option2 Name", "Option2 Value", "Variant Price", "Image Src"
        ]
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()

        handle = slugify(title)

        for v in variants:
            color = v.get("color", "-")
            size = v.get("size", "-")
            price = v.get("price", "0.00")
            image_url = image_map.get(color.lower()) if image_map else None
            if isinstance(image_url, list): image_url = image_url[0]
            full_image = f"https://cdn.dsmcdn.com{image_url}" if image_url else ""

            writer.writerow({
                "Handle": handle,
                "Title": f"{title} - {color} {size}",
                "Option1 Name": "Renk",
                "Option1 Value": color,
                "Option2 Name": "Beden",
                "Option2 Value": size,
                "Variant Price": price,
                "Image Src": full_image
            })

    print(f"✅ Shopify CSV başarıyla kaydedildi: {filename}")

if __name__ == "__main__":
    print("🔗 Trendyol ürün linkini girin:")
    url = input("URL: ").strip()

    html = fetch_trendyol_html(url)
    with open("debug-html.html", "w", encoding="utf-8") as f:
        f.write(html)
        print("📁 HTML verisi debug-html.html olarak kaydedildi.")

    variants, image_map, title = extract_variants(html)
    print(f"🧪 Bulunan varyant sayısı: {len(variants)}")
    for i, v in enumerate(variants):
        print(f"{i+1}. {v.get('color')} - {v.get('size')} - {v.get('price')} TL")

    save_shopify_csv(variants, image_map, title)
