import { expect, test } from "bun:test";
import { parseDashboardRpcCall } from "../src/dashboard-rpc";

test("permission and approval RPCs validate modes and never accept client replacement operations", () => {
  for (const permission_mode of ["read-only", "workspace-write", "danger-full-access"] as const) {
    const call = { operation: "sessions.permission.set", input: { session_id: "s", permission_mode } } as const;
    expect(parseDashboardRpcCall(call)).toEqual(call);
  }
  expect(parseDashboardRpcCall({ operation: "sessions.approvals", input: {} })).toEqual({ operation: "sessions.approvals", input: {} });
  for (const decision of ["allow", "deny"] as const) {
    const call = { operation: "sessions.approval.decide", input: { session_id: "s", request_id: "request", decision } } as const;
    expect(parseDashboardRpcCall(call)).toEqual(call);
    expect(() => parseDashboardRpcCall({ ...call, input: { ...call.input, arguments: { command: "different" } } })).toThrow();
  }
  expect(() => parseDashboardRpcCall({ operation: "sessions.permission.set", input: { session_id: "s", permission_mode: "bogus" } })).toThrow();
  expect(() => parseDashboardRpcCall({ operation: "sessions.approval.decide", input: { session_id: "s", request_id: "request", decision: "always" } })).toThrow();
});
