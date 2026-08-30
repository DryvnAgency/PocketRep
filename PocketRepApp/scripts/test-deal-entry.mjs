/**
 * Executable regression tests for the pure deal-entry parser and validator.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

let passed = 0;
let failed = 0;
function ok(condition, label) {
  if (condition) { passed++; console.log(`PASS  ${label}`); }
  else { failed++; console.error(`FAIL  ${label}`); }
}

const root = path.resolve(new URL('..', import.meta.url).pathname);
const source = fs.readFileSync(path.join(root, 'lib/v2/dealValidation.ts'), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const loaded = { exports: {} };
new Function('module', 'exports', output.outputText)(loaded, loaded.exports);

const {
  MAX_DEAL_GROSS,
  parseGrossInput,
  roundCurrency,
  validateDealDraft,
} = loaded.exports;

const decimal = parseGrossInput('1000.55');
ok(decimal.error === null && decimal.input === '1000.55' && decimal.value === 1000.55,
  'decimal gross is preserved rather than multiplied by 100');

const pasted = parseGrossInput('$1,000.55');
ok(pasted.error === null && pasted.value === 1000.55,
  'formatted currency paste is normalized safely');

const trailingDecimal = parseGrossInput('1000.');
ok(trailingDecimal.error === null && trailingDecimal.input === '1000.',
  'trailing decimal remains editable');

const leadingDecimal = parseGrossInput('.5');
ok(leadingDecimal.error === null && leadingDecimal.input === '0.5' && leadingDecimal.value === 0.5,
  'leading decimal is normalized');

ok(parseGrossInput('').value === 0 && parseGrossInput('').error === null,
  'empty gross remains zero');
ok(parseGrossInput('-500').error !== null, 'negative gross is rejected instead of becoming positive');
ok(parseGrossInput('abc').error !== null, 'letters are rejected');
ok(parseGrossInput('10.2.3').error !== null, 'multiple decimal points are rejected');
ok(parseGrossInput('10.999').error !== null, 'more than two decimal places is rejected');
ok(parseGrossInput(String(MAX_DEAL_GROSS)).value === MAX_DEAL_GROSS, 'maximum gross is accepted');
ok(parseGrossInput(String(MAX_DEAL_GROSS + 0.01)).error !== null, 'gross above the maximum is rejected');
ok(roundCurrency(1000.555) === 1000.56, 'persisted currency rounds to cents');
ok(roundCurrency(0.001) === 0, 'sub-cent gross normalizes to zero before persistence validation');

const valid = {
  name: 'Jordan Weektest',
  stock: 'R1234',
  vehicle: '2026 Rogue SV',
  date: '2026-08-30',
  frontGross: 1000.55,
  backGross: 500.25,
  split: false,
  splitWith: '',
};
ok(validateDealDraft(valid) === null, 'complete valid deal passes validation');
ok(validateDealDraft({ ...valid, name: '' }) === 'Enter the customer name.', 'customer is required');
ok(validateDealDraft({ ...valid, stock: '' }) === 'Enter the stock number.', 'stock number is required');
ok(validateDealDraft({ ...valid, vehicle: '' }) === 'Enter the vehicle.', 'vehicle is required');
ok(validateDealDraft({ ...valid, date: '2026-02-30' })?.includes('valid delivery date'), 'impossible date is rejected');
ok(validateDealDraft({ ...valid, frontGross: 0, backGross: 0 }) === 'Enter front gross or back gross.', 'zero-gross deal is rejected');
ok(validateDealDraft({ ...valid, split: true, splitWith: '' })?.includes('co-rep'), 'split deal requires a co-rep');
ok(validateDealDraft({ ...valid, frontGross: Number.POSITIVE_INFINITY })?.includes('Front gross'), 'non-finite gross is rejected');

console.log();
if (failed) {
  console.error(`❌ ${failed} FAILED (${passed} passed)`);
  process.exit(1);
}
console.log(`✅ ALL PASSED (${passed} checks)`);
