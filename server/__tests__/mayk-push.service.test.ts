import assert from "node:assert/strict";
import { buildMaykChangeEvent, mapMaykChangeEvent } from "../services/mayk-push.service";

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
console.log("M.A.Y.K push event mapping: OK");
