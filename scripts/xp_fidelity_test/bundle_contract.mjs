import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE_REGISTRY_PATH = path.join(REPO_ROOT, 'config', 'template_registry.json');
const EXPECTED_SCHEMA_VERSION = 2;

let cachedRegistry = null;

function readTemplateRegistry() {
  if (!cachedRegistry) {
    const registry = JSON.parse(fs.readFileSync(TEMPLATE_REGISTRY_PATH, 'utf-8'));
    if (registry.schema_version !== EXPECTED_SCHEMA_VERSION) {
      throw new Error(`Unsupported template registry schema_version: ${registry.schema_version}`);
    }
    cachedRegistry = registry;
  }
  return cachedRegistry;
}

function requireObject(value, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value;
}

function requireString(value, context, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${context} missing required field: ${fieldName}`);
  }
  return value.trim();
}

export function semanticFrameCountFromAnims(anims = []) {
  return Math.max(1, (Array.isArray(anims) ? anims : []).reduce((sum, value) => {
    const n = Number(value || 0);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0));
}

export function authoringFrameColsFromGeometry({ anims = [], source_projs = 1 } = {}) {
  return semanticFrameCountFromAnims(anims) * Math.max(1, Number(source_projs || 1));
}

export function exportFrameColsFromGeometry({ anims = [], projs = 1 } = {}) {
  return semanticFrameCountFromAnims(anims) * Math.max(1, Number(projs || 1));
}

export function getTemplateSetContract(templateSetKey) {
  const registry = readTemplateRegistry();
  const templateSet = registry.template_sets?.[templateSetKey];
  if (!templateSet) {
    throw new Error(`Unknown template_set_key: ${templateSetKey}`);
  }
  requireObject(templateSet, `template_set '${templateSetKey}'`);
  const actionSpecs = requireObject(templateSet.actions, `template_set '${templateSetKey}' actions`);

  const actions = {};
  for (const [actionKey, spec] of Object.entries(actionSpecs)) {
    const context = `template_set '${templateSetKey}' action '${actionKey}'`;
    const actionSpec = requireObject(spec, context);
    actions[actionKey] = {
      action_key: actionKey,
      angles: Number(actionSpec.angles || 1),
      anims: Array.isArray(actionSpec.frames) ? actionSpec.frames.map((n) => Number(n || 0)) : [1],
      source_projs: Math.max(1, Number(actionSpec.source_projs ?? actionSpec.projs ?? 1)),
      projs: Math.max(1, Number(actionSpec.projs || 1)),
      cell_w: Number(actionSpec.cell_w || 1),
      cell_h: Number(actionSpec.cell_h || 1),
      xp_dims: Array.isArray(actionSpec.xp_dims) ? actionSpec.xp_dims.map((n) => Number(n || 0)) : [0, 0],
      skin_family: requireString(actionSpec.skin_family, context, 'skin_family'),
      filename_prefix: requireString(actionSpec.filename_prefix, context, 'filename_prefix'),
      preview_xp: requireString(actionSpec.preview_xp, context, 'preview_xp'),
      preview_xp_sha256: requireString(actionSpec.preview_xp_sha256, context, 'preview_xp_sha256'),
      l0_ref: requireString(actionSpec.l0_ref, context, 'l0_ref'),
      l0_ref_sha256: requireString(actionSpec.l0_ref_sha256, context, 'l0_ref_sha256'),
      required: actionSpec.required !== false,
    };
  }

  return {
    template_set_key: templateSetKey,
    label: templateSet.label || templateSetKey,
    skin_family_scope: Array.isArray(templateSet.skin_family_scope) ? [...templateSet.skin_family_scope] : [],
    actionKeys: Object.keys(actions),
    actions,
  };
}

export function deriveAuthoringGeometryExpectation(templateAction, exportGeometry = null) {
  const anims = Array.isArray(exportGeometry?.anims) ? exportGeometry.anims : templateAction.anims;
  const angles = Number(exportGeometry?.angles ?? templateAction.angles ?? 1);
  const sourceProjs = Math.max(1, Number(templateAction.source_projs ?? exportGeometry?.source_projs ?? exportGeometry?.projs ?? 1));
  const exportProjs = Math.max(1, Number(templateAction.projs ?? exportGeometry?.projs ?? 1));
  const semanticFrameCols = semanticFrameCountFromAnims(anims);
  const xpCols = Number(templateAction.xp_dims?.[0] ?? 0);
  const xpRows = Number(templateAction.xp_dims?.[1] ?? 0);
  const frameCols = semanticFrameCols * sourceProjs;
  return {
    angles,
    anims,
    source_projs: sourceProjs,
    projs: exportProjs,
    semantic_frame_cols: semanticFrameCols,
    frame_rows: angles,
    frame_cols: frameCols,
    frame_w: xpCols > 0 ? Math.max(1, Math.floor(xpCols / Math.max(1, frameCols))) : Number(exportGeometry?.frame_w ?? templateAction.cell_w ?? 1),
    frame_h: xpRows > 0 ? Math.max(1, Math.floor(xpRows / Math.max(1, angles))) : Number(exportGeometry?.frame_h ?? templateAction.cell_h ?? 1),
  };
}
