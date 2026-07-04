import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionJob,
  assertJobTransition,
  InvalidJobTransitionError,
  isCancellableJobStatus,
} from "../../shared/import-job-state-machine";
import { hashCanonicalProduct } from "../services/shopify-dry-run.service";
import { calculatePriceWithRules } from "../services/price-rule-engine.service";

describe("import job state machine", () => {
  it("allows queued → scraping", () => {
    assert.equal(canTransitionJob("queued", "scraping"), true);
  });

  it("blocks awaiting_approval → completed", () => {
    assert.equal(canTransitionJob("awaiting_approval", "completed"), false);
  });

  it("throws 409 class on invalid transition", () => {
    assert.throws(
      () => assertJobTransition("awaiting_approval", "completed"),
      InvalidJobTransitionError,
    );
  });

  it("cancellable before upload", () => {
    assert.equal(isCancellableJobStatus("validating"), true);
    assert.equal(isCancellableJobStatus("uploading_to_shopify"), false);
  });
});

describe("canonical hash", () => {
  it("changes when canonical changes", () => {
    const a = hashCanonicalProduct({ title: "A", variants: [] });
    const b = hashCanonicalProduct({ title: "B", variants: [] });
    assert.notEqual(a, b);
  });
});

describe("price rule engine", () => {
  it("blocks when no rules and no shopify price", () => {
    const out = calculatePriceWithRules({ sourcePrice: 100, rules: [] });
    assert.equal(out.blocked, true);
    assert.equal(out.calculatedPrice, null);
  });

  it("applies percentage markup", () => {
    const out = calculatePriceWithRules({
      sourcePrice: 100,
      rules: [{ id: 1, ruleType: "percentage_markup", value: "20", isActive: true } as never],
    });
    assert.equal(out.calculatedPrice, 120);
    assert.equal(out.blocked, false);
  });
});
