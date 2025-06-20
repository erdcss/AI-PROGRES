# Trendyol Ürün Verisi Çıkarma API

## Ana Endpoint
```
POST /api/extract
```

## İstediğiniz 5 Veri Tipi
1. **Ürün markası** - Brand bilgisi
2. **Ürün başlığı** - Product title
3. **Ürün görselleri** - Image URLs listesi
4. **Ürün varyantları** - Renk-beden kombinasyonları (sadece stokta olanlar)
5. **Ürün özellikleri** - Product features/attributes

## Kullanım
```bash
curl -X POST http://localhost:5000/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.trendyol.com/ÜRÜN-LINKI"}'
```

## Örnek Yanıt
```json
{
  "success": true,
  "brand": "SHEISMONO",
  "title": "Soft Touch Yırtmaç Detaylı Kolsuz Elbise Siyah",
  "images": [
    "https://cdn.dsmcdn.com/ty1155/product/media/images/prod/SPM/PIM/20240128/03/e909a823-5d70-363f-b97c-6b34fdbe786e/1_org_zoom.jpg",
    "https://cdn.dsmcdn.com/ty1157/product/media/images/prod/SPM/PIM/20240128/03/e1a3dd5f-8520-3728-9472-b7dd6c8ae6de/1_org_zoom.jpg",
    "https://cdn.dsmcdn.com/ty1156/product/media/images/prod/SPM/PIM/20240128/03/e68224f3-9990-36f7-8a50-c0db6b0ba332/1_org_zoom.jpg"
  ],
  "variants": [
    {
      "color": "Gri",
      "size": "S",
      "inStock": true,
      "stockCount": 2
    },
    {
      "color": "Gri",
      "size": "M",
      "inStock": true,
      "stockCount": 1
    }
  ],
  "features": [
    {
      "key": "Kumaş Cinsi",
      "value": "Örme"
    },
    {
      "key": "Beden",
      "value": "Göğüs 34 cm"
    }
  ]
}
```

## Test Edilmiş Örnekler

### SHEISMONO Elbise
- 6 görsel, 2 varyant, 15 özellik başarıyla çıkarıldı

### Under Armour Tişört  
- 2 görsel, 2 varyant, 15 özellik başarıyla çıkarıldı

## Özellikler
- ✅ Sadece stokta olan varyantları döndürür
- ✅ Yüksek kaliteli ürün görsellerini filtreler  
- ✅ HTML regex yedek görsel sistemi
- ✅ Gelişmiş varyant ve özellik çıkarma
- ✅ Temizlenmiş ürün özelliklerini çıkarır
- ✅ Hızlı ve güvenilir extraction (400-500ms)
- ✅ Hata durumunda açıklayıcı mesajlar

## Dosya Konumu
- Ana extractor: `server/focused-extractor.ts`
- API endpoint: `server/routes.ts` - `/api/extract`