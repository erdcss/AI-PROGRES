import assert from "node:assert/strict";
import { buildMaykChangeEvent, mapMaykChangeEvent, hasPersistentMaykSourceWarning, buildMaykSourceWarningEvent } from "../services/mayk-push.service";

const sample = {
  id: 42,
  trackedProductId: 7,
  changeType: "price_changed",
  oldValue: 100,
  newValue: 120,
  status: "pending",
  approvedBy: null,
  updatedAt: new Date("2026-11-03T12:00:00.000Z"),
};
const detected = buildMaykChangeEvent(sample,"Ürün 7");
assert.equal(detected.type,"pending");
assert.equal(detected.title,"Fiyat değişikliği");
assert.match(detected.body,/100.*120/);
assert.equal(detected.key,buildMaykChangeEvent(sample,"Ürün 7").key,"aynı olay idempotent");
assert.equal(mapMaykChangeEvent({...sample,changeType:"stock_changed"}).title,"Stok değişikliği");
assert.equal(mapMaykChangeEvent({...sample,changeType:"variant_stock_changed"}).title,"Stok değişikliği");
assert.equal(mapMaykChangeEvent({...sample,status:"manual_review"}).title,"Manuel inceleme gerekli");
assert.equal(mapMaykChangeEvent({...sample,status:"approved"}).title,"Değişiklik onaylandı");
assert.equal(mapMaykChangeEvent({...sample,status:"ignored"}).title,"Değişiklik yok sayıldı");
assert.equal(mapMaykChangeEvent({...sample,status:"rejected"}).title,"Değişiklik reddedildi");
assert.equal(mapMaykChangeEvent({...sample,status:"failed"}).title,"MarktGO düzeltmesi başarısız");
assert.equal(mapMaykChangeEvent({...sample,status:"applied",approvedBy:"auto"}).title,"MarktGO otomatik düzeltildi");
assert.equal(mapMaykChangeEvent({...sample,status:"applied",approvedBy:"user"}).title,"MarktGO manuel düzeltildi");
assert.notEqual(
  buildMaykChangeEvent({...sample,status:"applied"},"Ürün 7").key,
  detected.key,
  "ayrı durum ayrı olay anahtarı olmalı",
);
const sourceNow = new Date("2026-11-20T12:00:00Z");
const priceWarn = (at: string) => ({
  action: "source_fetch", status: "warning", reason: "unreliable_price", createdAt: at,
});
const variantWarn = (at: string) => ({
  action: "source_fetch", status: "warning", reason: "incomplete_variant_snapshot", createdAt: at,
});
assert.equal(hasPersistentMaykSourceWarning([priceWarn("2026-11-20T11:59:00Z")], "unreliable_price", sourceNow), false, "a single transient price issue must not push");
assert.equal(hasPersistentMaykSourceWarning([
  priceWarn("2026-11-20T11:59:00Z"),
  priceWarn("2026-11-20T11:40:00Z"),
], "unreliable_price", sourceNow), true, "two consecutive price failures may push once");
assert.equal(hasPersistentMaykSourceWarning([
  priceWarn("2026-11-20T11:59:00Z"),
  variantWarn("2026-11-20T11:50:00Z"),
], "unreliable_price", sourceNow), false, "different transient reasons must not be merged");
assert.equal(hasPersistentMaykSourceWarning([
  priceWarn("2026-11-20T11:59:00Z"),
  {action:"tracking_check_completed",status:"success",reason:null,createdAt:"2026-11-20T11:50:00Z"},
], "unreliable_price", sourceNow), false, "successful check interrupts failure streak");
assert.equal(hasPersistentMaykSourceWarning([
  priceWarn("2026-11-20T11:59:00Z"),
  priceWarn("2026-11-18T11:50:00Z"),
], "unreliable_price", sourceNow), false, "old warnings must not count");
assert.equal(hasPersistentMaykSourceWarning([
  variantWarn("2026-11-20T11:59:00Z"),
  variantWarn("2026-11-20T11:40:00Z"),
], "incomplete_variant_snapshot", sourceNow), true, "repeat missing variants alert");
const firstSourceEvent=buildMaykSourceWarningEvent({
  productId:7,productTitle:"Ürün 7",reason:"unreliable_price",at:sourceNow,
});
const secondSourceEvent=buildMaykSourceWarningEvent({
  productId:7,productTitle:"Ürün 7",reason:"unreliable_price",at:new Date("2026-11-20T23:00:00Z"),
});
assert.equal(firstSourceEvent.key,secondSourceEvent.key,"daily dedupe prevents repeated source warnings");
assert.notEqual(firstSourceEvent.key,buildMaykSourceWarningEvent({
  productId:7,productTitle:"Ürün 7",reason:"incomplete_variant_snapshot",at:sourceNow,
}).key,"independent source validation failures should have separate keys");
assert.match(firstSourceEvent.body,/önceki fiyat korundu/);

console.log("M.A.Y.K push event mapping: OK");
