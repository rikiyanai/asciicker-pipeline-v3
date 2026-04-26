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

test('semantic runtime parity contract keeps item and mounted rows as explicit blockers', async () => {
  const { getSemanticRuntimeParityContract } = await loadBundleContract('semantic-runtime-blockers');
  const contract = getSemanticRuntimeParityContract();
  const requiredRows = Object.fromEntries(contract.required_rows.map((row) => [row.row_key, row]));
  const extensionRows = Object.fromEntries(contract.full_readiness_extension_rows.map((row) => [row.row_key, row]));

  assert.equal(requiredRows['item.world_item'].pipeline_v3.mapping_status, 'unmodeled_gap');
  assert.match(requiredRows['item.world_item'].pipeline_v3.blockers.join(','), /no_world_item_semantic_verifier_lane/);
  assert.equal(requiredRows['item.inventory_grid'].pipeline_v3.mapping_status, 'unmodeled_gap');
  assert.match(requiredRows['item.inventory_grid'].pipeline_v3.blockers.join(','), /no_inventory_grid_semantic_verifier_lane/);

  assert.equal(extensionRows['actor.mounted_idle_walk'].pipeline_v3.mapping_status, 'specified_not_authorable');
  assert.equal(extensionRows['actor.mounted_idle_walk'].pipeline_v3.filename_prefix, 'wolfie');
  assert.equal(extensionRows['actor.mounted_attack'].pipeline_v3.mapping_status, 'specified_not_authorable');
  assert.equal(extensionRows['actor.mounted_attack'].pipeline_v3.filename_prefix, 'wolack');

  assert.match(contract.readiness_blockers.join('\n'), /item\.world_item:unmodeled_gap/);
  assert.match(contract.readiness_blockers.join('\n'), /item\.inventory_grid:unmodeled_gap/);
  assert.match(contract.readiness_blockers.join('\n'), /actor\.mounted_idle_walk:specified_not_authorable/);
  assert.match(contract.readiness_blockers.join('\n'), /headed_semantic_gameplay_proof_missing/);
});
