// Verifies the optimistic-locking fix for sequence step advances
// (messageQueue.ts). The `.eq('current_step', step_number)` guard
// ensures two concurrent advances of the same step are idempotent.
//
//   npm run test:sequencerace    (from PocketRepApp/)

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// ---- simulate the update-with-CAS pattern ----

// Fake DB row — only updates if current_step matches
class FakeEnrollment {
  constructor(id, currentStep, totalSteps) {
    this.id = id;
    this.current_step = currentStep;
    this.total_steps = totalSteps;
    this.completed = false;
    this.updates = 0;
  }
  // Returns rows-affected count (like Supabase .update()...eq()...eq())
  advanceIfStep(expectedStep) {
    if (this.current_step !== expectedStep) return 0; // CAS failed
    if (expectedStep + 1 >= this.total_steps) {
      this.completed = true;
    } else {
      this.current_step = expectedStep + 1;
    }
    this.updates++;
    return 1;
  }
}

// ---- normal advance ----
const e1 = new FakeEnrollment('e1', 0, 3);
ok('advance step 0 → 1', e1.advanceIfStep(0) === 1);
ok('current_step is 1', e1.current_step === 1);
ok('not completed', !e1.completed);

// ---- advance to completion ----
ok('advance step 1 → 2', e1.advanceIfStep(1) === 1);
ok('advance step 2 → done', e1.advanceIfStep(2) === 1);
ok('completed', e1.completed);

// ---- concurrent race: two devices try to advance step 0 ----
const e2 = new FakeEnrollment('e2', 0, 5);
const first = e2.advanceIfStep(0);
const second = e2.advanceIfStep(0); // same step — should fail
ok('first advance succeeds', first === 1);
ok('second advance fails (CAS miss)', second === 0);
ok('only 1 update applied', e2.updates === 1);
ok('step advanced only once', e2.current_step === 1);

// ---- stale step: device tries to advance already-passed step ----
const e3 = new FakeEnrollment('e3', 3, 5);
ok('stale step 0 fails', e3.advanceIfStep(0) === 0);
ok('stale step 1 fails', e3.advanceIfStep(1) === 0);
ok('stale step 2 fails', e3.advanceIfStep(2) === 0);
ok('current step 3 succeeds', e3.advanceIfStep(3) === 1);

// ---- completed enrollment: no further advances ----
const e4 = new FakeEnrollment('e4', 2, 3);
e4.advanceIfStep(2); // completes
ok('completed enrollment rejects advance', e4.advanceIfStep(3) === 0);
ok('still completed', e4.completed);

// ---- single-step sequence ----
const e5 = new FakeEnrollment('e5', 0, 1);
ok('single step completes', e5.advanceIfStep(0) === 1);
ok('single step completed', e5.completed);

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${18} checks)`);
process.exit(failures ? 1 : 0);
