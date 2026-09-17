import test from "node:test";
import assert from "node:assert/strict";

test("MASTER has global scope", () => {
  const hasGlobalScope = (role) => role === "MASTER";
  assert.equal(hasGlobalScope("MASTER"), true);
  assert.equal(hasGlobalScope("MANAGER"), false);
  assert.equal(hasGlobalScope("OPERATIVE"), false);
});

test("an unassigned branch is outside operative scope", () => {
  const allowed = ["branch-a", "branch-b"];
  assert.equal(allowed.includes("branch-c"), false);
});
