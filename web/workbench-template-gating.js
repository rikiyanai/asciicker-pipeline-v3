/**
 * workbench-template-gating.js
 *
 * Pure template-action authorability logic extracted from workbench.js for
 * unit testing.  Functions here take registry/templateSetKey as explicit
 * parameters so they can be exercised without a live browser state closure.
 *
 * workbench.js keeps thin wrapper functions that forward state.templateRegistry
 * and state.templateSetKey into these pure implementations.
 *
 * Dual-export: browser (<script> tag sets window.__workbenchTemplateGating)
 *              Node.js  (module.exports for unit tests via require())
 */

"use strict";

// Canonical action order for bundle tabs and initial selection.
// Flask sorts JSON keys alphabetically; this restores the intended order.
const BUNDLE_ACTION_ORDER = ["idle", "attack", "death"];

/**
 * Pure implementation of the template-action authorability gate.
 *
 * Returns true iff the action described by (ts, actionKey, spec) is
 * authorable given the supplied registry snapshot and template-set key.
 *
 * @param {object|null}  ts             - Template-set descriptor (from registry.template_sets[key])
 * @param {string}       actionKey      - Action key (e.g. "idle", "attack")
 * @param {object|null}  spec           - Action spec from ts.actions[actionKey]
 * @param {object|null}  registry       - Full normalized template registry object
 * @param {string}       templateSetKey - Current state.templateSetKey
 * @returns {boolean}
 */
function isTemplateActionAuthorable(ts, actionKey, spec, registry, templateSetKey) {
  const prefix = String(spec?.filename_prefix || spec?.family || "").trim();
  const skinFamily = String(spec?.skin_family || "").trim();
  if (!prefix || !skinFamily) return false;

  const templateScope = Array.isArray(ts?.skin_family_scope)
    ? new Set(ts.skin_family_scope.map((value) => String(value || "").trim()).filter(Boolean))
    : null;
  if (templateScope !== null && (!templateScope.size || !templateScope.has(skinFamily))) return false;

  const familyScope = registry?.skin_family_scope?.[skinFamily];
  if (!familyScope || familyScope.authorable === false || familyScope.proof_only === true) return false;

  const prefixSpec = registry?.prefix_catalog?.[prefix];
  if (!prefixSpec) return false;
  if (String(prefixSpec.filename_prefix || "").trim() !== prefix) return false;
  if (String(prefixSpec.skin_family || "").trim() !== skinFamily) return false;
  if (prefixSpec.authorable === false) return false;

  const tsk = String(templateSetKey || "").trim();
  const templateActions = Array.isArray(prefixSpec.template_actions) ? prefixSpec.template_actions : [];
  if (templateActions.length) {
    if (!tsk) return false;
    const linked = templateActions.some((entry) => (
      String(entry?.template_set_key || "").trim() === tsk &&
      String(entry?.action_key || "").trim() === actionKey
    ));
    if (!linked) return false;
  }
  return true;
}

/**
 * Returns the subset of ts.actions that are authorable, in canonical order.
 *
 * @param {object|null}  ts             - Template-set descriptor
 * @param {object|null}  registry       - Full normalized template registry object
 * @param {string}       templateSetKey - Current state.templateSetKey
 * @returns {object}  Plain object keyed by action key, canonical order first
 */
function getEnabledActions(ts, registry, templateSetKey) {
  if (!ts || !ts.actions) return {};
  const unordered = {};
  for (const [key, spec] of Object.entries(ts.actions)) {
    if (isTemplateActionAuthorable(ts, key, spec, registry, templateSetKey)) unordered[key] = spec;
  }
  // Re-order to canonical order; any unlisted keys appear at the end.
  const out = {};
  for (const key of BUNDLE_ACTION_ORDER) {
    if (unordered[key]) out[key] = unordered[key];
  }
  for (const key of Object.keys(unordered)) {
    if (!out[key]) out[key] = unordered[key];
  }
  return out;
}

// ── exports ──────────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
  // Node.js / CommonJS (unit tests)
  module.exports = { BUNDLE_ACTION_ORDER, isTemplateActionAuthorable, getEnabledActions };
} else if (typeof window !== "undefined") {
  // Browser (<script src="/workbench-template-gating.js"> loaded before workbench.js)
  window.__workbenchTemplateGating = { BUNDLE_ACTION_ORDER, isTemplateActionAuthorable, getEnabledActions };
}
