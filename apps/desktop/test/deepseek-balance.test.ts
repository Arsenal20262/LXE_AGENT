import { describe, expect, test } from "bun:test";
import { DeepSeekBalanceService, type DeepSeekBalanceCredential } from "../src/main/deepseek-balance";

// Shape and amounts captured from the official balance endpoint; no account identifiers.
const fixture = { is_available: true, balance_infos: [
  { currency: "CNY", total_balance: "5.72", granted_balance: "5.97", topped_up_balance: "-0.24" },
] };
const credential = (): DeepSeekBalanceCredential => ({ source: "cloud", key: "sk-fixture-only" });
const fetcher = (request: (url: string | URL | Request, init?: RequestInit) => Promise<Response>): typeof fetch => request as typeof fetch;

describe("DeepSeek balance", () => {
  test("queries the fixed official URL and returns only total balance, source and time", async () => {
    const service = new DeepSeekBalanceService(credential, fetcher(async (url, init) => {
      expect(url).toBe("https://api.deepseek.com/user/balance");
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-fixture-only");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json(fixture);
    }), () => 1234);
    expect(await service.getBalance()).toEqual({ status: "ready", source: "cloud",
      balances: [{ currency: "CNY", total_balance: "5.72" }], updated_at: 1234, error: null });
  });

  test("keeps the previous balance on failure with actual sanitized and truncated diagnostics", async () => {
    let failed = false;
    const service = new DeepSeekBalanceService(credential, fetcher(async () => failed
      ? new Response(`Authentication Fails: sk-fixture-only ${"x".repeat(2000)}`, { status: 401 })
      : Response.json(fixture)));
    const success = await service.getBalance();
    failed = true;
    const result = await service.getBalance();
    expect(result.status).toBe("error");
    expect(result.balances).toEqual(success.balances);
    expect(result.updated_at).toBe(success.updated_at);
    expect(result.error).toContain("HTTP 401: Authentication Fails: [redacted]");
    expect(result.error).toContain("[truncated]");
    expect(JSON.stringify(result)).not.toContain("sk-fixture-only");
  });

  test("does not contact the network when no credential exists", async () => {
    let called = false;
    const service = new DeepSeekBalanceService(() => ({ source: "local", key: null }), fetcher(async () => {
      called = true; return Response.json(fixture);
    }));
    expect(await service.getBalance()).toMatchObject({ status: "unconfigured", source: "local", balances: [] });
    expect(called).toBe(false);
  });

  test("does not retain another account's cached balance after key or source changes", async () => {
    let current = credential();
    let failure = false;
    const service = new DeepSeekBalanceService(() => current, fetcher(async () => {
      if (failure) throw new Error("connect ECONNRESET");
      return Response.json(fixture);
    }));
    await service.getBalance();
    current = { source: "local", key: "sk-another-account" };
    failure = true;
    expect(await service.getBalance()).toMatchObject({ status: "error", source: "local", balances: [],
      updated_at: null, error: "connect ECONNRESET" });
  });

  test("deduplicates overlapping queries and discards responses after revocation", async () => {
    let current = credential();
    let finish!: (response: Response) => void;
    let count = 0;
    const service = new DeepSeekBalanceService(() => current, fetcher(() => {
      count++;
      return new Promise(resolve => { finish = resolve; });
    }));
    const first = service.getBalance();
    const second = service.getBalance();
    expect(count).toBe(1);
    current = { source: "cloud", key: null };
    finish(Response.json(fixture));
    for (const result of await Promise.all([first, second])) {
      expect(result).toMatchObject({ status: "unconfigured", balances: [], updated_at: null });
    }
  });

  test("supports USD and genuine zero balances without computing from the components", async () => {
    const service = new DeepSeekBalanceService(credential, fetcher(async () => Response.json({
      is_available: false, balance_infos: [{ currency: "USD", total_balance: "0.00" }],
    })));
    expect(await service.getBalance()).toMatchObject({ status: "ready", balances: [{ currency: "USD", total_balance: "0.00" }] });
  });

  test.each([null, {}, { is_available: true, balance_infos: [] },
    { is_available: true, balance_infos: [{ currency: "CNY", total_balance: 12 }] },
    { is_available: true, balance_infos: [{ currency: "EUR", total_balance: "12" }] },
  ])("rejects malformed responses without inventing a zero balance: %j", async body => {
    const service = new DeepSeekBalanceService(credential, fetcher(async () => Response.json(body)));
    const result = await service.getBalance();
    expect(result.status).toBe("error");
    expect(result.balances).toEqual([]);
    expect(result.error).toContain(JSON.stringify(body));
  });
});
