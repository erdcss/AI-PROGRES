import assert from "node:assert/strict";
import { validateMaykIcon } from "../routes/mayk-branding-routes";

function pngHeader(width = 1024, height = 1024) {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, 4, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return "data:image/png;base64," + bytes.toString("base64");
}

assert.equal(validateMaykIcon(pngHeader()).data?.length, 33, "1024x1024 PNG header accepted");
assert.equal(validateMaykIcon(pngHeader(1254, 1254)).data, undefined, "wrong dimensions rejected");
assert.equal(validateMaykIcon(pngHeader(1024, 800)).data, undefined, "non-square rejected");
assert.equal(validateMaykIcon("data:image/jpeg;base64,abcd").data, undefined, "non-PNG rejected");
assert.equal(validateMaykIcon("data:image/png;base64," + Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64")).data, undefined, "oversize rejected");

console.log("M.A.Y.K branding upload validation passed");
