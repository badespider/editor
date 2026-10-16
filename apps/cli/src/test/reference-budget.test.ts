import assert from 'node:assert/strict';
import test from 'node:test';
import { Command } from 'commander';
import { registerReferenceWorkbenchCommands } from '../reference.ts';

test('comparison CLI keeps an explicit numeric duration option and its original 1200-second default', async t => {
  const output: string[] = [], exitCode = process.exitCode;
  t.mock.method(console, 'log', (value: unknown) => { output.push(String(value)); });
  const command = () => { const reference = new Command('reference').exitOverride(); registerReferenceWorkbenchCommands(reference); return reference; };
  const comparison = command().commands.find(item => item.name() === 'compare'); assert.ok(comparison);
  const option = comparison.options.find(item => item.long === '--max-duration'); assert.ok(option);
  assert.equal(option.defaultValue, '1200');
  try {
    for (const [maxDuration, invalidBudget] of [['7201', true], ['0', true], ['nope', true], ['1201', false]] as const) {
      process.exitCode = undefined; output.length = 0;
      await command().parseAsync(['compare', 'missing-reference-budget-test.mp4', 'missing-render-budget-test.mp4',
        '--times', '0', '--max-duration', maxDuration, '-o', 'unused-reference-budget-test-output'], { from: 'user' });
      assert.equal(process.exitCode, 1); assert.equal(output.length, 1);
      const result = JSON.parse(output[0]); assert.equal(result.externalModelCalls, 0);
      if (invalidBudget) assert.match(result.error, /maxDuration|finite nonnegative number/);
      else assert.match(result.error, /ENOENT/, 'a valid value was converted to a number and passed schema validation before local file resolution');
    }
  } finally { process.exitCode = exitCode; }
});
