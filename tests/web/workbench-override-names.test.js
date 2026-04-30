/**
 * Unit tests for registry-derived override-name generation.
 *
 * Proves that override names derive from registry prefix_catalog.ahsw_range
 * and not from any hardcoded map.
 *
 * Run with: node tests/web/workbench-override-names.test.js
 */

"use strict";

// ── minimal test harness (matches pattern used across tests/web/) ─────────────

class TestRunner {
  constructor() {
    this.ok = 0;
    this.fail = 0;
  }

  describe(suiteName, suiteFunc) {
    console.log(`\n${suiteName}`);
    suiteFunc();
  }

  it(testName, testFunc) {
    try {
      testFunc();
      this.ok++;
      console.log(`  \u2713 ${testName}`);
    } catch (error) {
      this.fail++;
      console.log(`  \u2717 ${testName}`);
      console.log(`    ${error.message}`);
    }
  }

  report() {
    console.log(`\n${this.ok} ok, ${this.fail} failed`);
    process.exit(this.fail > 0 ? 1 : 0);
  }
}

const expect = (value) => ({
  toBe(expected) {
    if (value !== expected) {
      throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
    }
  },
  toContain(item) {
    if (!value.includes(item)) {
      throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
    }
  },
  toNotContain(item) {
    if (value.includes(item)) {
      throw new Error(`Expected array to NOT contain ${JSON.stringify(item)}`);
    }
  },
});

const t = new TestRunner();

// ── _ahswNamesFromRegistry implementation ────────────────────────────────────
// Mirrors the logic from web/workbench.js and web/termpp_skin_lab.js
// so we can test the derivation contract in isolation.

function _ahswNamesFromRegistry(prefixCatalog, prefixes) {
  const out = [];
  for (const prefix of prefixes) {
    const spec = prefixCatalog[prefix];
    const range = spec && spec.ahsw_range;
    const wRange = range === "weapon_gte_1" ? [1, 2] : [0, 1, 2];
    if (range === "all_16" && prefix === "player") out.push("player-nude.xp");
    for (let a = 0; a < 2; a++)
      for (let h = 0; h < 2; h++)
        for (let s = 0; s < 2; s++)
          for (const w of wRange)
            out.push(`${prefix}-${a}${h}${s}${w}.xp`);
  }
  return out;
}

// ── mock registries ──────────────────────────────────────────────────────────

const MOCK_PREFIX_CATALOG = {
  player: { ahsw_range: "all_16", mounted: false },
  attack: { ahsw_range: "weapon_gte_1", mounted: false },
  plydie: { ahsw_range: "all_16", mounted: false },
  wolfie: { ahsw_range: "all_16", mounted: true },
  wolack: { ahsw_range: "weapon_gte_1", mounted: true },
  bigbee: { mounted: true }, // deferred, no ahsw_range
};

// ── tests ────────────────────────────────────────────────────────────────────

t.describe("_ahswNamesFromRegistry — happy path", () => {
  t.it("produces 105 names for all 5 live prefixes", () => {
    const prefixes = ["player", "attack", "plydie", "wolfie", "wolack"];
    const names = _ahswNamesFromRegistry(MOCK_PREFIX_CATALOG, prefixes);
    expect(names.length).toBe(105);
  });

  t.it("includes player-nude.xp exactly once", () => {
    const prefixes = ["player", "attack", "plydie", "wolfie", "wolack"];
    const names = _ahswNamesFromRegistry(MOCK_PREFIX_CATALOG, prefixes);
    expect(names.filter(n => n === "player-nude.xp").length).toBe(1);
  });

  t.it("produces correct per-prefix counts", () => {
    const prefixes = ["player", "attack", "plydie", "wolfie", "wolack"];
    const names = _ahswNamesFromRegistry(MOCK_PREFIX_CATALOG, prefixes);
    const count = (pre) => names.filter(n => n.startsWith(pre + "-")).length;
    expect(count("player")).toBe(25);  // 24 AHSW + nude
    expect(count("attack")).toBe(16);  // weapon_gte_1
    expect(count("plydie")).toBe(24);  // all_16
    expect(count("wolfie")).toBe(24);  // all_16
    expect(count("wolack")).toBe(16);  // weapon_gte_1
  });
});

t.describe("_ahswNamesFromRegistry — mutation proves derivation", () => {
  t.it("changing attack ahsw_range to all_16 increases attack count to 24", () => {
    const mutated = { ...MOCK_PREFIX_CATALOG, attack: { ahsw_range: "all_16", mounted: false } };
    const prefixes = ["player", "attack", "plydie", "wolfie", "wolack"];
    const names = _ahswNamesFromRegistry(mutated, prefixes);
    const attackCount = names.filter(n => n.startsWith("attack-")).length;
    expect(attackCount).toBe(24);
    expect(names.length).toBe(113);  // 105 - 16 + 24
  });

  t.it("changing wolfie ahsw_range to weapon_gte_1 reduces wolfie count to 16", () => {
    const mutated = { ...MOCK_PREFIX_CATALOG, wolfie: { ahsw_range: "weapon_gte_1", mounted: true } };
    const prefixes = ["player", "attack", "plydie", "wolfie", "wolack"];
    const names = _ahswNamesFromRegistry(mutated, prefixes);
    const wolfieCount = names.filter(n => n.startsWith("wolfie-")).length;
    expect(wolfieCount).toBe(16);
  });
});

t.describe("_ahswNamesFromRegistry — prefix filtering", () => {
  t.it("produces only mounted-mode names when only player+wolfie+wolack requested", () => {
    const prefixes = ["player", "wolfie", "wolack"];
    const names = _ahswNamesFromRegistry(MOCK_PREFIX_CATALOG, prefixes);
    expect(names.length).toBe(65);  // 25 + 24 + 16
    const attackNames = names.filter(n => n.startsWith("attack-"));
    expect(attackNames.length).toBe(0);
  });

  t.it("produces 0 names for empty prefix list", () => {
    const names = _ahswNamesFromRegistry(MOCK_PREFIX_CATALOG, []);
    expect(names.length).toBe(0);
  });
});

t.describe("mounted mode filter — prefix_catalog derivation", () => {
  t.it("mounted filter selects player + mounted prefixes with ahsw_range", () => {
    const prefixes = Object.entries(MOCK_PREFIX_CATALOG)
      .filter(([key, spec]) => spec.ahsw_range && (key === "player" || spec.mounted))
      .map(([key]) => key);
    expect(prefixes.length).toBe(3);
    expect(prefixes).toContain("player");
    expect(prefixes).toContain("wolfie");
    expect(prefixes).toContain("wolack");
    expect(prefixes).toNotContain("attack");
    expect(prefixes).toNotContain("plydie");
    expect(prefixes).toNotContain("bigbee");
  });

  t.it("full_parity filter selects all prefixes with ahsw_range (excludes bigbee)", () => {
    const prefixes = Object.entries(MOCK_PREFIX_CATALOG)
      .filter(([, spec]) => spec.ahsw_range)
      .map(([key]) => key);
    expect(prefixes.length).toBe(5);
    expect(prefixes).toNotContain("bigbee");
  });
});

t.report();
