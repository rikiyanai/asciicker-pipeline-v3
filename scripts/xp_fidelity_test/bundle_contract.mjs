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

function requireArray(value, context, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${context} missing required field: ${fieldName}`);
  }
  return value;
}

function getPrefixSpec(prefix) {
  const registry = readTemplateRegistry();
  const spec = registry.prefix_catalog?.[prefix];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new Error(`Unknown prefix_catalog entry: ${prefix}`);
  }
  return spec;
}

function findTemplateAction(prefixSpec, expectedTemplateSetKey, expectedActionKey) {
  const actions = Array.isArray(prefixSpec.template_actions) ? prefixSpec.template_actions : [];
  return actions.find((entry) => (
    entry
    && entry.template_set_key === expectedTemplateSetKey
    && entry.action_key === expectedActionKey
  )) || null;
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

export function getSemanticRuntimeParityContract() {
  const registry = readTemplateRegistry();
  const humanScope = requireObject(registry.skin_family_scope?.human, "skin_family_scope 'human'");
  const playerPrefix = getPrefixSpec('player');
  const attackPrefix = getPrefixSpec('attack');
  const deathPrefix = getPrefixSpec('plydie');

  const fullIdle = findTemplateAction(playerPrefix, 'player_native_full', 'idle');
  const fullAttack = findTemplateAction(attackPrefix, 'player_native_full', 'attack');
  const fullDeath = findTemplateAction(deathPrefix, 'player_native_full', 'death');

  const requiredRows = [
    {
      row_key: 'actor.on_foot_idle',
      y9_2_selector_slug: 'on_foot_idle',
      presentation_kind_slug: 'idle_walk',
      presentation_kind_id: 600,
      subject_kind: 'actor',
      semantic_inputs: {
        combat_states: ['neutral'],
        life_states: ['alive'],
        locomotion_states: ['idle'],
        mount_states: ['unmounted'],
        presentation_kinds: ['idle'],
      },
      pipeline_v3: {
        mapping_status: fullIdle ? 'mapped_to_authoring_action' : 'mapping_missing',
        template_set_key: fullIdle?.template_set_key || '',
        action_key: fullIdle?.action_key || '',
        filename_prefix: requireString(playerPrefix.filename_prefix, "prefix_catalog 'player'", 'filename_prefix'),
        runtime_role: requireString(playerPrefix.runtime_role, "prefix_catalog 'player'", 'runtime_role'),
        authorable: playerPrefix.authorable === true,
      },
    },
    {
      row_key: 'actor.on_foot_move',
      y9_2_selector_slug: 'on_foot_move',
      presentation_kind_slug: 'idle_walk',
      presentation_kind_id: 600,
      subject_kind: 'actor',
      semantic_inputs: {
        combat_states: ['neutral'],
        life_states: ['alive'],
        locomotion_states: ['move'],
        mount_states: ['unmounted'],
        presentation_kinds: ['move'],
      },
      pipeline_v3: {
        mapping_status: fullIdle ? 'mapped_to_authoring_action' : 'mapping_missing',
        template_set_key: fullIdle?.template_set_key || '',
        action_key: fullIdle?.action_key || '',
        filename_prefix: requireString(playerPrefix.filename_prefix, "prefix_catalog 'player'", 'filename_prefix'),
        runtime_role: requireString(playerPrefix.runtime_role, "prefix_catalog 'player'", 'runtime_role'),
        authorable: playerPrefix.authorable === true,
      },
    },
    {
      row_key: 'actor.melee_attack',
      y9_2_selector_slug: 'melee_attack',
      presentation_kind_slug: 'attack',
      presentation_kind_id: 601,
      subject_kind: 'actor',
      semantic_inputs: {
        combat_states: ['melee_attack'],
        life_states: ['alive'],
        locomotion_states: ['idle', 'move'],
        mount_states: ['unmounted'],
        presentation_kinds: ['attack'],
      },
      pipeline_v3: {
        mapping_status: fullAttack ? 'mapped_to_authoring_action' : 'mapping_missing',
        template_set_key: fullAttack?.template_set_key || '',
        action_key: fullAttack?.action_key || '',
        filename_prefix: requireString(attackPrefix.filename_prefix, "prefix_catalog 'attack'", 'filename_prefix'),
        runtime_role: requireString(attackPrefix.runtime_role, "prefix_catalog 'attack'", 'runtime_role'),
        authorable: attackPrefix.authorable === true,
      },
    },
    {
      row_key: 'actor.fall_dead.fall',
      y9_2_selector_slug: 'fall_dead',
      presentation_kind_slug: 'plydie',
      presentation_kind_id: 602,
      subject_kind: 'actor',
      semantic_inputs: {
        combat_states: ['neutral', 'melee_attack'],
        life_states: ['falling'],
        locomotion_states: ['falling'],
        mount_states: ['unmounted'],
        presentation_kinds: ['fall'],
      },
      pipeline_v3: {
        mapping_status: fullDeath ? 'mapped_to_authoring_action' : 'mapping_missing',
        template_set_key: fullDeath?.template_set_key || '',
        action_key: fullDeath?.action_key || '',
        filename_prefix: requireString(deathPrefix.filename_prefix, "prefix_catalog 'plydie'", 'filename_prefix'),
        runtime_role: requireString(deathPrefix.runtime_role, "prefix_catalog 'plydie'", 'runtime_role'),
        authorable: deathPrefix.authorable === true,
      },
    },
    {
      row_key: 'actor.fall_dead.dead',
      y9_2_selector_slug: 'fall_dead',
      presentation_kind_slug: 'plydie',
      presentation_kind_id: 602,
      subject_kind: 'actor',
      semantic_inputs: {
        combat_states: ['neutral', 'melee_attack'],
        life_states: ['dead'],
        locomotion_states: ['settled'],
        mount_states: ['unmounted'],
        presentation_kinds: ['dead'],
      },
      pipeline_v3: {
        mapping_status: fullDeath ? 'mapped_to_authoring_action' : 'mapping_missing',
        template_set_key: fullDeath?.template_set_key || '',
        action_key: fullDeath?.action_key || '',
        filename_prefix: requireString(deathPrefix.filename_prefix, "prefix_catalog 'plydie'", 'filename_prefix'),
        runtime_role: requireString(deathPrefix.runtime_role, "prefix_catalog 'plydie'", 'runtime_role'),
        authorable: deathPrefix.authorable === true,
      },
    },
    {
      row_key: 'item.world_item',
      y9_2_selector_slug: 'world_item',
      presentation_kind_slug: 'world_item',
      presentation_kind_id: 603,
      subject_kind: 'item',
      semantic_inputs: {
        item_surface_kind: 'world',
        state_flags: ['world_visible'],
      },
      pipeline_v3: {
        mapping_status: 'unmodeled_gap',
        blockers: [
          'no_item_surface_template',
          'no_item_definition_or_visual_style_registry',
          'no_world_item_semantic_verifier_lane',
        ],
      },
    },
    {
      row_key: 'item.inventory_grid',
      y9_2_selector_slug: 'inventory_grid',
      presentation_kind_slug: 'inventory_grid',
      presentation_kind_id: 604,
      subject_kind: 'item',
      semantic_inputs: {
        item_surface_kind: 'inventory',
        state_flags: ['inventory_visible'],
      },
      pipeline_v3: {
        mapping_status: 'unmodeled_gap',
        blockers: [
          'no_item_surface_template',
          'no_item_definition_or_visual_style_registry',
          'no_inventory_grid_semantic_verifier_lane',
        ],
      },
    },
  ];

  const fullReadinessExtensionRows = [
    {
      row_key: 'actor.mounted_idle_walk',
      y9_2_selector_slug: 'on_foot_move',
      presentation_kind_slug: 'idle_walk',
      presentation_kind_id: 600,
      subject_kind: 'actor',
      semantic_inputs: {
        combat_states: ['neutral'],
        life_states: ['alive'],
        locomotion_states: ['idle', 'move'],
        mount_states: ['wolf'],
        presentation_kinds: ['idle', 'move'],
      },
      pipeline_v3: {
        mapping_status: 'specified_not_authorable',
        filename_prefix: requireString(getPrefixSpec('wolfie').filename_prefix, "prefix_catalog 'wolfie'", 'filename_prefix'),
        runtime_role: requireString(getPrefixSpec('wolfie').runtime_role, "prefix_catalog 'wolfie'", 'runtime_role'),
        blockers: Array.isArray(getPrefixSpec('wolfie').authoring_blockers)
          ? [...getPrefixSpec('wolfie').authoring_blockers]
          : ['mounted_family_scope_not_enabled'],
      },
    },
    {
      row_key: 'actor.mounted_attack',
      y9_2_selector_slug: 'melee_attack',
      presentation_kind_slug: 'attack',
      presentation_kind_id: 601,
      subject_kind: 'actor',
      semantic_inputs: {
        combat_states: ['melee_attack'],
        life_states: ['alive'],
        locomotion_states: ['idle', 'move'],
        mount_states: ['wolf'],
        presentation_kinds: ['attack'],
      },
      pipeline_v3: {
        mapping_status: 'specified_not_authorable',
        filename_prefix: requireString(getPrefixSpec('wolack').filename_prefix, "prefix_catalog 'wolack'", 'filename_prefix'),
        runtime_role: requireString(getPrefixSpec('wolack').runtime_role, "prefix_catalog 'wolack'", 'runtime_role'),
        blockers: Array.isArray(getPrefixSpec('wolack').authoring_blockers)
          ? [...getPrefixSpec('wolack').authoring_blockers]
          : ['mounted_family_scope_not_enabled'],
      },
    },
  ];

  for (const row of requiredRows) {
    if (row.pipeline_v3.mapping_status === 'mapped_to_authoring_action') {
      if (!row.pipeline_v3.template_set_key || !row.pipeline_v3.action_key) {
        throw new Error(`Semantic runtime row '${row.row_key}' lost its authoring mapping`);
      }
    }
    if (row.pipeline_v3.mapping_status === 'unmodeled_gap') {
      requireArray(row.pipeline_v3.blockers, `semantic runtime row '${row.row_key}'`, 'blockers');
    }
  }

  for (const row of fullReadinessExtensionRows) {
    requireArray(row.pipeline_v3.blockers, `semantic runtime extension row '${row.row_key}'`, 'blockers');
  }

  const readinessBlockers = requiredRows
    .filter((row) => row.pipeline_v3.mapping_status !== 'mapped_to_authoring_action')
    .map((row) => `${row.row_key}:${row.pipeline_v3.mapping_status}`);

  readinessBlockers.push(...fullReadinessExtensionRows.map((row) => `${row.row_key}:${row.pipeline_v3.mapping_status}`));
  readinessBlockers.push('headed_semantic_gameplay_proof_missing');
  const minimumSemanticRuntimeRowsReady = requiredRows.every(
    (row) => row.pipeline_v3.mapping_status === 'mapped_to_authoring_action'
  );

  return {
    contract_version: '2026-04-26',
    registry_schema_version: registry.schema_version,
    scope_skin_family: requireString(humanScope.skin_family, "skin_family_scope 'human'", 'skin_family'),
    authorable_template_sets: Array.isArray(humanScope.authorable_template_sets)
      ? [...humanScope.authorable_template_sets]
      : [],
    minimum_semantic_runtime_rows_ready: minimumSemanticRuntimeRowsReady,
    generalized_bundle_port_ready: false,
    readiness_blockers: readinessBlockers,
    required_rows: requiredRows,
    full_readiness_extension_rows: fullReadinessExtensionRows,
  };
}
