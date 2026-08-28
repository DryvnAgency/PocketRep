// P2-R5: assert the model picked the expected Rex action.
//
// This mirrors how the app's rexActions.parseAction reads a brain reply: take the
// ```json fenced block (falling back to the raw body), JSON.parse it, and read
// `action` (or legacy `type`). promptfoo calls this for every case with the model
// `output` and a `context` whose `vars.expected_action` is the row's label.
//
// Returns a promptfoo GradingResult: { pass, score, reason }.
module.exports = (output, context) => {
  const expected = context && context.vars && context.vars.expected_action;
  const text = String(output == null ? '' : output);
  const fence =
    /```json\s*([\s\S]*?)```/i.exec(text) || /```\s*([\s\S]*?)```/.exec(text);
  const jsonText = fence ? fence[1] : text;

  let action = null;
  try {
    const obj = JSON.parse(String(jsonText).trim());
    action = obj && (obj.action || obj.type);
  } catch (e) {
    return {
      pass: false,
      score: 0,
      reason: `No parseable JSON action block (expected "${expected}")`,
    };
  }

  const pass = action === expected;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? `action=${action}` : `expected "${expected}", got "${action}"`,
  };
};
