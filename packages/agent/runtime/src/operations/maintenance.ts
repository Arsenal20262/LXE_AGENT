import { dirname, join } from "node:path";
import { hostname } from "node:os";
import { nativeCloudFetch, readCloudReceipt } from "../tooling/cloud-http";
import { createLogger, sanitizeLogValue } from "@lxe/core";
import type { JsonObject } from "@lxe/protocol";
import type { OneShotCliRunnerPort } from "../tooling/one-shot-cli";
import type { SqliteRuntimeStore } from "../state/storage";
import { resolveMachineIdentity } from "@lxe/core/machine-identity";

type Environment = Record<string, string | undefined>;
type DataServerTargetName = "cloud";

interface DataServerTarget {
  name: DataServerTargetName;
  serverUrl: string;
}

class DataServerUploadError extends Error {
  constructor(
    readonly target: DataServerTargetName,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DataServerUploadError";
  }
}

export interface MaintenanceClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(id: unknown): void;
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(id: unknown): void;
}

const systemClock: MaintenanceClock = {
  setTimeout: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    timer.unref?.();
    return timer;
  },
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  setInterval: (callback, delayMs) => {
    const timer = setInterval(callback, delayMs);
    timer.unref?.();
    return timer;
  },
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};

interface MaintenanceSchedulerOptions {
  environment: Environment;
  store: SqliteRuntimeStore;
  gatewayId: string;
  authRunner: OneShotCliRunnerPort;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  clock?: MaintenanceClock;
  stopTimeoutMs?: number;
  authEnabled?: boolean;
}

const envText = (env: Environment, name: string, fallback = ""): string => String(env[name] ?? fallback).trim();
const envBoolean = (env: Environment, name: string, fallback = false): boolean => {
  const value = envText(env, name).toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
};
const TURN_USAGE_RETENTION_SECONDS = 365 * 86_400;
const TURN_USAGE_BATCH_LIMIT = 200;
const TURN_USAGE_BATCH_TARGET_BYTES = 1024 * 1024;
const TURN_USAGE_MAX_BATCHES_PER_RUN = 10;
const TURN_USAGE_BACKLOG_DELAY_MS = 60_000;
const INITIAL_DATA_SYNC_DELAY_MS = 5 * 60_000;
const AUTH_REFRESH_INTERVAL_MS = 2 * 60 * 60_000;
const DATA_SYNC_INTERVAL_MS = 3_600_000;
const DATA_SERVER_REQUEST_TIMEOUT_MS = 30_000;

export class MaintenanceScheduler {
  private readonly logger = createLogger("runtime.maintenance");
  private readonly fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  private readonly clock: MaintenanceClock;
  private readonly intervalTimers: unknown[] = [];
  private readonly active = new Set<Promise<unknown>>();
  private readonly controllers = new Set<AbortController>();
  private readonly flights = new Map<"auth" | "data", { running?: Promise<void>; rerun: boolean }>();
  private readonly initialTimers: unknown[] = [];
  private backlogTimer: unknown | undefined;
  private stopped = true;
  private uploadFailures = 0;

  constructor(private readonly options: MaintenanceSchedulerOptions) {
    this.fetch = options.fetch ?? ((input, init) => nativeCloudFetch(String(input))(input, init));
    this.clock = options.clock ?? systemClock;
  }

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    const authEnabled = this.options.authEnabled ?? true;
    const dataEnabled = envBoolean(this.options.environment, "LXE_DATA_SERVER_ENABLED");
    this.logger.info("maintenance_configured", {
      auth_enabled: authEnabled,
      auth_interval_ms: AUTH_REFRESH_INTERVAL_MS,
      data_sync_enabled: dataEnabled,
      data_sync_interval_ms: DATA_SYNC_INTERVAL_MS,
    });
    if (authEnabled) {
      const authTimer = this.clock.setInterval(
        () => { void this.requestSingleFlight("auth", () => this.refreshAuth()); },
        AUTH_REFRESH_INTERVAL_MS,
      );
      this.intervalTimers.push(authTimer);
    }
    if (dataEnabled) {
      const syncTimer = this.clock.setInterval(
        () => { void this.requestSingleFlight("data", () => this.syncDataServer()); },
        DATA_SYNC_INTERVAL_MS,
      );
      this.intervalTimers.push(syncTimer);
    }
    if (authEnabled) {
      const timer = this.clock.setTimeout(() => {
        const index = this.initialTimers.indexOf(timer);
        if (index >= 0) this.initialTimers.splice(index, 1);
        if (this.stopped) return;
        void this.requestSingleFlight("auth", () => this.refreshAuth());
      }, 0);
      this.initialTimers.push(timer);
    }
    if (dataEnabled) {
      const timer = this.clock.setTimeout(() => {
        const index = this.initialTimers.indexOf(timer);
        if (index >= 0) this.initialTimers.splice(index, 1);
        if (this.stopped) return;
        void this.requestSingleFlight("data", () => this.syncDataServer());
      }, INITIAL_DATA_SYNC_DELAY_MS);
      this.initialTimers.push(timer);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const timer of this.initialTimers.splice(0)) this.clock.clearTimeout(timer);
    if (this.backlogTimer !== undefined) this.clock.clearTimeout(this.backlogTimer);
    this.backlogTimer = undefined;
    for (const timer of this.intervalTimers.splice(0)) this.clock.clearInterval(timer);
    for (const flight of this.flights.values()) flight.rerun = false;
    for (const controller of this.controllers) controller.abort(new Error("maintenance stopped"));
    const active = Promise.allSettled([...this.active]);
    const timeoutMs = Math.max(1, Math.trunc(this.options.stopTimeoutMs ?? 5_000));
    let timer: ReturnType<typeof setTimeout> | undefined;
    // This deadline is part of the awaited shutdown path, so it must remain
    // referenced until either the active work settles or the timeout wins.
    const completed = await Promise.race([
      active.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (!completed) this.logger.warn("maintenance_stop_timed_out", {
      timeout_ms: timeoutMs,
      active_tasks: this.active.size,
    });
  }

  async syncDataServer(): Promise<JsonObject> {
    const serverUrl = envText(this.options.environment, "LXE_DATA_SERVER_URL").replace(/\/+$/, "");
    if (!serverUrl) return { uploaded: false, skipped_reason: "missing_config" };
    if (this.backlogTimer !== undefined) this.clock.clearTimeout(this.backlogTimer);
    this.backlogTimer = undefined;
    try {
      const result = await this.syncTurnUsageTarget({ name: "cloud", serverUrl });
      this.uploadFailures = 0;
      return result;
    }
    catch (error) {
      // The server checks each attempt; a previous refusal must not latch locally.
      const delayMs = Math.min(300_000, 30_000 * 2 ** Math.min(this.uploadFailures++, 4));
      this.scheduleBacklogSync(delayMs);
      throw error;
    }
  }

  private async syncTurnUsageTarget(target: DataServerTarget): Promise<JsonObject> {
    const machineId = this.machineId();
    const cutoff = Date.now() / 1_000 - TURN_USAGE_RETENTION_SECONDS;
    let acceptedCount = 0;
    let acceptedThroughSequence = this.options.store.turnUsageAcknowledgedSequence(target.serverUrl) ?? 0;
    let batches = 0;
    let hasMore = false;
    for (; batches < TURN_USAGE_MAX_BATCHES_PER_RUN; batches += 1) {
      const exported = this.options.store.exportTurnUsageBatch(target.serverUrl, cutoff, TURN_USAGE_BATCH_LIMIT);
      if (exported.turns.length === 0) {
        hasMore = false;
        break;
      }
      const turns: JsonObject[] = [];
      let body = "";
      for (const turn of exported.turns) {
        const candidate = [...turns, turn];
        const candidateBody = JSON.stringify({
          protocol_version: 1,
          machine_id: machineId,
          gateway_id: this.options.gatewayId,
          hostname: hostname(),
          turns: candidate,
        });
        if (new TextEncoder().encode(candidateBody).byteLength > TURN_USAGE_BATCH_TARGET_BYTES) {
          if (turns.length === 0) {
            throw new DataServerUploadError(
              target.name,
              `${target.name} turn usage record exceeds 1 MiB client batch limit`,
              undefined,
            );
          }
          break;
        }
        turns.push(turn);
        body = candidateBody;
      }
      const lastSequence = Number(turns.at(-1)?.sequence ?? 0);
      const acknowledged = await this.uploadTurnUsageBatch(target, body, turns.length, lastSequence);
      this.options.store.acknowledgeTurnUsage(target.serverUrl, acknowledged.acceptedThroughSequence);
      acceptedCount += acknowledged.acceptedCount;
      acceptedThroughSequence = acknowledged.acceptedThroughSequence;
      hasMore = turns.length < exported.turns.length || exported.has_more;
      this.logger.info("data_sync_batch_uploaded", {
        target: target.name,
        turn_count: turns.length,
        batch_bytes: new TextEncoder().encode(body).byteLength,
        accepted_count: acknowledged.acceptedCount,
        accepted_through_sequence: acknowledged.acceptedThroughSequence,
      });
      if (!hasMore) {
        batches += 1;
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (hasMore) this.scheduleBacklogSync();
    if (batches === 0) {
      this.logger.info("data_sync_skipped", { reason: "no_turns", target: target.name });
      return { uploaded: false, target: target.name, skipped_reason: "no_turns", has_more: false };
    }
    const result: JsonObject = {
      uploaded: true,
      target: target.name,
      accepted_count: acceptedCount,
      accepted_through_sequence: acceptedThroughSequence,
      batches,
      has_more: hasMore,
    };
    this.logger.info("data_sync_uploaded", result);
    return result;
  }

  private async uploadTurnUsageBatch(
    target: DataServerTarget,
    body: string,
    turnCount: number,
    lastSequence: number,
  ): Promise<{ acceptedCount: number; acceptedThroughSequence: number }> {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(
      () => controller.abort(new Error("data server request timed out")),
      DATA_SERVER_REQUEST_TIMEOUT_MS,
    );
    try {
      let response: Response;
      try {
        response = await this.fetch(`${target.serverUrl}/api/v1/agent-data/turn-usage/batches`, {
          method: "POST",
          headers: { "X-LXE-Client": "cli", "content-type": "application/json" },
          redirect: "error",
          body,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted && this.stopped) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new DataServerUploadError(
          target.name,
          `${target.name} data server request failed: ${sanitizeLogValue(message)}`,
          undefined,
        );
      }
      const raw = await readCloudReceipt(response);
      if (!response.ok) {
        throw new DataServerUploadError(
          target.name,
          `${target.name} data server returned HTTP ${response.status}: ${sanitizeLogValue(raw.text)}`,
          response.status,
        );
      }
      let payload: Record<string, unknown>;
      try {
        if (raw.truncated) throw Error("response exceeded 1 MiB [truncated]");
        const value: unknown = JSON.parse(raw.text);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("ACK must be an object");
        payload = value as Record<string, unknown>;
      } catch (error) {
        throw new DataServerUploadError(target.name, `${target.name} data server returned an invalid ACK: ${sanitizeLogValue(String(error))}; response=${sanitizeLogValue(raw.text)}`);
      }
      const acceptedCount = Number(payload.accepted_count);
      const acceptedThroughSequence = Number(payload.accepted_through_sequence);
      if (!Number.isSafeInteger(acceptedCount) || acceptedCount !== turnCount ||
        !Number.isSafeInteger(acceptedThroughSequence) || acceptedThroughSequence !== lastSequence) {
        throw new DataServerUploadError(target.name, `${target.name} data server returned an invalid ACK: ${sanitizeLogValue(raw.text)}`, undefined);
      }
      return { acceptedCount, acceptedThroughSequence };
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }

  private scheduleBacklogSync(delayMs = TURN_USAGE_BACKLOG_DELAY_MS): void {
    if (this.stopped || this.backlogTimer !== undefined) return;
    this.backlogTimer = this.clock.setTimeout(() => {
      this.backlogTimer = undefined;
      if (!this.stopped) void this.requestSingleFlight("data", () => this.syncDataServer());
    }, delayMs);
  }

  private async refreshAuth(): Promise<void> {
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const response = await this.options.authRunner.execute(
        ["auth", "refresh"],
        controller.signal,
      );
      if (!response.ok) throw new Error(response.error?.message ?? "browser auth refresh failed");
      this.logger.info("auth_refresh_succeeded");
    } finally {
      this.controllers.delete(controller);
    }
  }

  private machineId(): string {
    const path = envText(this.options.environment, "LXE_DATA_SERVER_MACHINE_ID_PATH")
      || join(dirname(this.options.store.path), "machine_identity.json");
    try {
      return resolveMachineIdentity(path).machine_id;
    } catch (error) {
      this.logger.warn("machine_identity_unreadable", { path, error });
      throw error;
    }
  }

  private requestSingleFlight(
    kind: "auth" | "data",
    operation: () => Promise<unknown>,
  ): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const state = this.flights.get(kind) ?? { rerun: false };
    this.flights.set(kind, state);
    if (state.running) {
      if (!state.rerun) this.logger.debug("maintenance_single_flight_coalesced", { task: kind });
      state.rerun = true;
      return state.running;
    }
    const runOnce = async (): Promise<void> => {
      const startedAt = Date.now();
      this.logger.info("maintenance_task_started", { task: kind });
      try {
        await operation();
        this.logger.info("maintenance_task_completed", {
          task: kind,
          status: "completed",
          duration_ms: Date.now() - startedAt,
        });
      } catch (error) {
        this.logger.warn(kind === "auth" ? "auth_refresh_failed" : "data_sync_failed", {
          ...(kind === "data" && error instanceof DataServerUploadError
            ? { target: error.target }
            : {}),
          error,
        });
        this.logger.info("maintenance_task_completed", {
          task: kind,
          status: "failed",
          duration_ms: Date.now() - startedAt,
        });
      }
    };
    let tracked: Promise<void>;
    tracked = (async () => {
      await runOnce();
      if (!this.stopped && state.rerun) {
        state.rerun = false;
        this.logger.debug("maintenance_single_flight_rerun", { task: kind });
        await runOnce();
      }
    })().finally(() => {
      state.rerun = false;
      if (state.running === tracked) delete state.running;
      this.active.delete(tracked);
    });
    state.running = tracked;
    this.active.add(tracked);
    return tracked;
  }
}
