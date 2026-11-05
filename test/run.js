// Runs every *.test.js in this directory and reports a single summary.
const fs = require("fs");
const path = require("path");
const { results } = require("./helpers.js");

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".test.js")).sort();

for (const f of files) {
  const before = results.passed + results.failed;
  require(path.join(dir, f));
  const run = results.passed + results.failed - before;
  console.log(`  ${f.padEnd(26)} ${run} assertions`);
}

console.log("");
if (results.failed) {
  for (const f of results.failures) console.log(`  FAIL ${f}`);
  console.log(`\n${results.failed} failed, ${results.passed} passed`);
  process.exit(1);
}
console.log(`${results.passed} assertions passed`);
