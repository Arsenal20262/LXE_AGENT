import { createLogger, type Logger } from "@lxe/core";
import type { OneShotCliRunnerPort } from "../tooling/one-shot-cli";

export type LxeSkillRuntimeState = "unchecked" | "ready" | "unavailable";

export interface LxeSkillRuntimeStatus {
  state: LxeSkillRuntimeState;
  available: boolean;
  message: string;
  recovery: string;
}

export interface LxeSkillRuntimeServiceOptions {
  runner?: OneShotCliRunnerPort;
  recovery: string;
  unavailableMessage?: string;
  probeTimeoutMs?: number;
  logger?: Logger;
}

export class LxeSkillRuntimeService {
  private readonly logger: Logger;
  private status: LxeSkillRuntimeStatus;
  private started = false;

  constructor(private readonly options: LxeSkillRuntimeServiceOptions) {
    this.logger = options.logger ?? createLogger("runtime.lxeskill");
    this.status = {
      state: "unchecked",
      available: false,
      message: "LXE Skill CLI has not been checked",
      recovery: options.recovery,
    };
  }

  snapshot(): LxeSkillRuntimeStatus {
    return { ...this.status };
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const runner = this.options.runner;
    if (!runner) {
      this.markUnavailable(this.options.unavailableMessage ?? "LXE Skill CLI executable is unavailable");
      return;
    }

    const controller = new AbortController();
    try {
      const result = await runner.execute(
        ["list"],
        controller.signal,
        this.options.probeTimeoutMs ?? 30_000,
      );
      if (!result.ok) {
        throw new Error(result.error?.message || "lxeskill list reported failure");
      }
      this.status = { state: "ready", available: true, message: "", recovery: "" };
      this.logger.info("lxeskill_runtime_ready");
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      this.markUnavailable(error.message);
      return;
    }
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  private markUnavailable(reason: string): void {
    const detail = String(reason || "unknown error").trim();
    const message = `LXE Skill CLI is unavailable: ${detail}. ${this.options.recovery}`;
    this.status = {
      state: "unavailable",
      available: false,
      message,
      recovery: this.options.recovery,
    };
    this.logger.warn("lxeskill_runtime_unavailable", { reason: detail });
  }
}
