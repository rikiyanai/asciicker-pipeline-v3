import assert from 'node:assert/strict';
import test from 'node:test';

async function loadBundleContract(tag) {
  const moduleUrl = new URL('../../scripts/xp_fidelity_test/bundle_contract.mjs', import.meta.url);
  moduleUrl.searchParams.set('case', tag);
  return import(moduleUrl.href);
}

test('semantic runtime parity contract models the minimum 7 Y9-2 rows', async () => {
  const { getSemanticRuntimeParityContract } = await loadBundleContract('semantic-runtime-minimum');
  const contract = getSemanticRuntimeParityContract();

  assert.equal(contract.generalized_bundle_port_ready, false);
  assert.equal(contract.runtime_identity_ready, true);
  assert.equal(contract.minimum_semantic_runtime_rows_ready, false);
  assert.deepEqual(
    contract.required_rows.map((row) => row.row_key),
    [
      'actor.on_foot_idle',
      'actor.on_foot_move',
      'actor.melee_attack',
      'actor.fall_dead.fall',
      'actor.fall_dead.dead',
      'item.world_item',
      'item.inventory_grid',
    ]
  );
});

test('semantic runtime parity contract maps actor rows to current authoring actions', async () => {
  const { getSemanticRuntimeParityContract } = await loadBundleContract('semantic-runtime-actor-mapping');
  const contract = getSemanticRuntimeParityContract();
  const rows = Object.fromEntries(contract.required_rows.map((row) => [row.row_key, row]));

  assert.equal(rows['actor.on_foot_idle'].pipeline_v3.mapping_status, 'mapped_to_authoring_action');
  assert.equal(rows['actor.on_foot_idle'].pipeline_v3.action_key, 'idle');
  assert.equal(rows['actor.on_foot_idle'].pipeline_v3.filename_prefix, 'player');

  assert.equal(rows['actor.on_foot_move'].pipeline_v3.mapping_status, 'mapped_to_authoring_action');
  assert.equal(rows['actor.on_foot_move'].pipeline_v3.action_key, 'idle');
  assert.equal(rows['actor.on_foot_move'].pipeline_v3.runtime_role, 'on_foot_idle_walk');

  assert.equal(rows['actor.melee_attack'].pipeline_v3.mapping_status, 'mapped_to_authoring_action');
  assert.equal(rows['actor.melee_attack'].pipeline_v3.action_key, 'attack');
  assert.equal(rows['actor.melee_attack'].pipeline_v3.filename_prefix, 'attack');

  assert.equal(rows['actor.fall_dead.fall'].pipeline_v3.mapping_status, 'mapped_to_authoring_action');
  assert.equal(rows['actor.fall_dead.fall'].pipeline_v3.action_key, 'death');
  assert.equal(rows['actor.fall_dead.dead'].pipeline_v3.mapping_status, 'mapped_to_authoring_action');
  assert.equal(rows['actor.fall_dead.dead'].pipeline_v3.action_key, 'death');
});

test('semantic runtime parity contract keeps item rows as explicit blockers and maps mounted rows with V2 IDs', async () => {
  const { getSemanticRuntimeParityContract } = await loadBundleContract('semantic-runtime-blockers');
  const contract = getSemanticRuntimeParityContract();
  const requiredRows = Object.fromEntries(contract.required_rows.map((row) => [row.row_key, row]));
  const extensionRows = Object.fromEntries(contract.full_readiness_extension_rows.map((row) => [row.row_key, row]));

  assert.equal(requiredRows['item.world_item'].pipeline_v3.mapping_status, 'unmodeled_gap');
  assert.match(requiredRows['item.world_item'].pipeline_v3.blockers.join(','), /no_world_item_semantic_verifier_lane/);
  assert.equal(requiredRows['item.inventory_grid'].pipeline_v3.mapping_status, 'unmodeled_gap');
  assert.match(requiredRows['item.inventory_grid'].pipeline_v3.blockers.join(','), /no_inventory_grid_semantic_verifier_lane/);

  assert.equal(extensionRows['actor.mounted_idle_walk'].pipeline_v3.mapping_status, 'mapped_to_authoring_action');
  assert.equal(extensionRows['actor.mounted_idle_walk'].pipeline_v3.filename_prefix, 'wolfie');
  assert.equal(extensionRows['actor.mounted_idle_walk'].pipeline_v3.skin_definition_id, 100);
  assert.equal(extensionRows['actor.mounted_idle_walk'].pipeline_v3.presentation_kind_id, 600);
  assert.equal(extensionRows['actor.mounted_idle_walk'].pipeline_v3.layer_definition_id, 760);
  assert.equal(extensionRows['actor.mounted_attack'].pipeline_v3.mapping_status, 'mapped_to_authoring_action');
  assert.equal(extensionRows['actor.mounted_attack'].pipeline_v3.filename_prefix, 'wolack');
  assert.equal(extensionRows['actor.mounted_attack'].pipeline_v3.skin_definition_id, 100);
  assert.equal(extensionRows['actor.mounted_attack'].pipeline_v3.presentation_kind_id, 601);
  assert.equal(extensionRows['actor.mounted_attack'].pipeline_v3.layer_definition_id, 761);

  assert.match(contract.readiness_blockers.join('\n'), /item\.world_item:unmodeled_gap/);
  assert.match(contract.readiness_blockers.join('\n'), /item\.inventory_grid:unmodeled_gap/);
  assert.match(contract.readiness_blockers.join('\n'), /headed_semantic_gameplay_proof_missing/);
});

test('semantic runtime parity requires V2 IDs before rows can claim mappings', async () => {
  const { getSemanticRuntimeParityContract } = await loadBundleContract('semantic-runtime-identity-gate');
  const contract = getSemanticRuntimeParityContract();

  assert.equal(contract.runtime_identity_ready, true);
  assert.deepEqual(
    contract.runtime_identity_required_ids,
    ['skin_definition_id', 'presentation_kind_id', 'layer_definition_id']
  );
  assert.equal(contract.generalized_bundle_port_ready, false);

  assert.doesNotMatch(contract.readiness_blockers.join('\n'), /runtime_identity:missing_/);

  for (const row of [...contract.required_rows, ...contract.full_readiness_extension_rows]) {
    if (row.pipeline_v3.mapping_status !== 'mapped_to_authoring_action') continue;
    assert.ok(Number.isInteger(row.pipeline_v3.skin_definition_id));
    assert.ok(Number.isInteger(row.pipeline_v3.presentation_kind_id));
    assert.ok(Number.isInteger(row.pipeline_v3.layer_definition_id));
  }
});

test('mounted authoring proof contract requires generated XP through runtime selection', async () => {
  const { getSemanticRuntimeParityContract } = await loadBundleContract('mounted-authoring-e2e-proof');
  const contract = getSemanticRuntimeParityContract();

  assert.equal(contract.mounted_authoring_proof.mode, 'mounted_authoring_e2e');
  assert.equal(contract.mounted_authoring_proof.status, 'blocked');
  assert.equal(
    contract.mounted_authoring_proof.existing_wrapper_inventory_smoke_label,
    'existing wrapper inventory OK'
  );

  assert.deepEqual(contract.mounted_authoring_proof.required_evidence, [
    'pipeline_v3_generated_mounted_xp',
    'semantic_anchors_bound_to_generated_output',
    'y9_2_bundle_rows_with_server_owned_v2_ids',
    'runtime_parser_acceptance',
    'runtime_selection_of_generated_rows',
    'no_legacy_sprite_fallback',
  ]);

  assert.match(
    contract.readiness_blockers.join('\n'),
    /mounted_authoring_e2e:missing_pipeline_v3_generated_mounted_xp/
  );
  assert.match(
    contract.readiness_blockers.join('\n'),
    /mounted_authoring_e2e:missing_server_owned_v2_bundle_rows/
  );
  assert.match(
    contract.readiness_blockers.join('\n'),
    /mounted_authoring_e2e:missing_no_legacy_sprite_fallback_proof/
  );
});
