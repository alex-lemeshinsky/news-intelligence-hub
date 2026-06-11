import { strict as assert } from "node:assert";
import test from "node:test";
import { isWorkspaceNavItemActive } from "./workspace-nav-state";

test("marks the workspace feed item active only on the feed route", () => {
  assert.equal(isWorkspaceNavItemActive("/workspace", "/workspace"), true);
  assert.equal(isWorkspaceNavItemActive("/workspace/graph", "/workspace"), false);
});

test("marks nested workspace pages active for their section", () => {
  assert.equal(
    isWorkspaceNavItemActive("/workspace/graph", "/workspace/graph"),
    true,
  );
  assert.equal(
    isWorkspaceNavItemActive("/workspace/graph/article-mentions", "/workspace/graph"),
    true,
  );
});
