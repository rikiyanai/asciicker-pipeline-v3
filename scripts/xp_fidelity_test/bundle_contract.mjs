import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE_REGISTRY_PATH = path.join(REPO_ROOT, 'config', 'template_registry.json');

let cachedRegistry = null;

function readTemplateRegistry() {
  if (!cachedRegistry) {
    cachedRegistry = JSON.parse(fs.readFileSync(TEMPLATE_REGISTRY_PATH, 'utf-8'));
  }
  return cachedRegistry;
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

  const actions = {};
  for (const [actionKey, spec] of Object.entries(templateSet.actions || {})) {
    actions[actionKey] = {
      action_key: actionKey,
      angles: Number(spec.angles || 1),
      anims: Array.isArray(spec.frames) ? spec.frames.map((n) => Number(n || 0)) : [1],
      source_projs: Math.max(1, Number(spec.source_projs ?? spec.projs ?? 1)),
      projs: Math.max(1, Number(spec.projs || 1)),
      cell_w: Number(spec.cell_w || 1),
      cell_h: Number(spec.cell_h || 1),
      xp_dims: Array.isArray(spec.xp_dims) ? spec.xp_dims.map((n) => Number(n || 0)) : [0, 0],
      skin_family: spec.skin_family || '',
      filename_prefix: spec.filename_prefix || '',
      preview_xp: spec.preview_xp || '',
      preview_xp_sha256: spec.preview_xp_sha256 || '',
      l0_ref: spec.l0_ref || '',
      l0_ref_sha256: spec.l0_ref_sha256 || '',
      required: spec.required !== false,
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
