# Renk Seçeneği Algılama Sistemi

## Mevcut Durum
Sistemimiz renk seçeneklerini algılamak için gelişmiş bir yaklaşım kullanıyor ancak test ettiğiniz ürünler tek renkli ürünler gibi görünüyor.

## Renk Algılama Yöntemleri
1. **JSON Veri Çıkarma**: Product state ve variant bilgilerinden
2. **HTML Element Tarama**: Color selector, data-color gibi attributelardan
3. **Pattern Matching**: Renk isimlerini direct text'ten çıkarma
4. **Çoklu Kaynak Kontrol**: Farklı data formatlarını kontrol etme

## Test Sonuçları
- Peelter Elbise: 0 renk, 5 beden (XS-XL)
- Bikelife Pantolon: 0 renk, 6 beden (S-3XL)

Bu ürünler gerçekten tek renkli olabilir. Renk seçeneklerini görmek için farklı ürün türleri test edilmeli.

## Sistem Özellikleri
- ✅ Beden algılama çalışıyor
- ✅ Fiyat çıkarma çalışıyor  
- ✅ CSV oluşturma çalışıyor
- ✅ Görsel çıkarma çalışıyor
- 🔄 Renk algılama hazır ama çok renkli ürün gerekli

## CSV Çıktısı
Sistem şu anda:
- Doğru beden varyantları oluşturuyor
- %10 kar marjı ekliyor
- Shopify formatında CSV üretiyor
- UTF-8 encoding ile format sorunları çözülmüş durumda