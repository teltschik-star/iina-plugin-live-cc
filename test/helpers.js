// Minimal assertion harness. No dependencies: the plugin has no build step and
// no runtime packages, and a test suite that needed `npm install` to run would
// not get run.

const results = { passed: 0, failed: 0, failures: [] };

function eq(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    results.passed++;
  } else {
    results.failed++;
    results.failures.push(`${name}\n      got  ${g}\n      want ${w}`);
  }
}

function ok(name, value) {
  eq(name, !!value, true);
}

/** Install a stub `iina` global so modules that destructure it can be loaded. */
function stubIina(overrides) {
  const base = {
    preferences: { get: () => undefined, set: () => {}, sync: () => {} },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    utils: { exec: async () => ({ status: 0, stdout: "", stderr: "" }), resolvePath: (p) => p, fileInPath: () => false },
    file: { read: () => undefined, write: () => {}, delete: () => {}, exists: () => false, list: () => [] },
    mpv: { getString: () => "", getNative: () => [] },
    http: { download: async () => {} },
  };
  global.iina = Object.assign(base, overrides || {});
  return global.iina;
}

module.exports = { eq, ok, results, stubIina };
