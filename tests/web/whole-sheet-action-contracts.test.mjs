import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const generatorPath = path.join(repoRoot, 'scripts', 'xp_fidelity_test', 'generate_whole_sheet_action_contracts.mjs');

test('whole-sheet contract generator inventories the shipped control surface', async () => {
  const { buildWholeSheetContractReport } = await import(`file://${generatorPath}`);
  const report = buildWholeSheetContractReport();

  assert.ok(report.summary.extractedControlCount >= 25, 'expected a broad whole-sheet control inventory');
  assert.ok(report.summary.mappedControlCount >= 20, 'expected most whole-sheet controls to map to contract semantics');
  assert.ok(report.summary.variantCount >= 40, 'expected action-local state variants to be generated');
  assert.ok(report.observableStateFields.includes('activeTool'), 'expected activeTool to be observable');
  assert.ok(report.observableStateFields.includes('browseSelectedId'), 'expected browseSelectedId to be observable');
});

test('whole-sheet contract generator includes key section-1 controls', async () => {
  const { buildWholeSheetContractReport } = await import(`file://${generatorPath}`);
  const report = buildWholeSheetContractReport();
  const bySelector = new Map(report.actions.map((action) => [action.selector || action.controlId, action]));

  assert.equal(bySelector.get('#wsToolOval')?.mapped, true, 'Oval tool button should be covered');
  assert.equal(bySelector.get('#wsToolText')?.mapped, true, 'Text tool button should be covered');
  assert.equal(bySelector.get('#wsResizeBtn')?.mapped, true, 'Resize button should be covered');
  assert.equal(bySelector.get('#wsBrowseDelete')?.mapped, true, 'Browse delete button should be covered');
  assert.equal(bySelector.get('#layerSelect')?.mapped, true, 'Wrapper layer select bridge should be covered');
  assert.equal(bySelector.get('#layerVisibility input[data-layer]')?.mapped, true, 'Wrapper layer visibility bridge should be covered');
});
