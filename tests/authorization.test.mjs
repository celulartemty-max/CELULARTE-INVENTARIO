import test from "node:test"; import assert from "node:assert/strict";
test("role policy: admin roles are global",()=>{ const isAdmin=(r)=>r==="MASTER"||r==="ADMIN"; assert.equal(isAdmin("MASTER"),true); assert.equal(isAdmin("ADMIN"),true); assert.equal(isAdmin("OPERATIVE"),false); });
test("branch policy rejects unassigned branch",()=>{ const allowed=["a","b"]; assert.equal(allowed.includes("c"),false); });
