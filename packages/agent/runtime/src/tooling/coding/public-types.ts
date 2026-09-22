import type { JsonObject } from "@lxe/protocol";
import type { ExecShellAdapter } from "../exec-shell";
import type { LxeSkillRuntimeStatus } from "../../operations/lxeskill-runtime";
import type { LxeSkillCommandConfirmation } from "../lxeskill-command";

export interface LxeSkillRecoveryCommand {
  command: string;
  module?: string;
  ownerSkills: readonly string[];
  attributionSkill?: string;
  confirmation?: LxeSkillCommandConfirmation;
}

export type ProcessStatus = "running" | "completed" | "failed" | "killed";

export interface ZhihuiTmsProgressEvent {
  execId: string;
  sessionId: string;
  turnId: string;
  toolCallId: string;
  message: string;
}

export interface CodingToolOptions {
  repositorySkillsRoot?: string;
  userSkillsRoot?: string;
  artifactRoot?: string;
  homeDirectory?: string;
  /** Bytes of process output kept in memory and shown to the model at once. */
  maxOutputBytes?: number;
  /** Called once when an exec that already yielded reaches a terminal state. */
  onExecComplete?: (snapshot: JsonObject) => Promise<void> | void;
  onZhihuiTmsProgress?: (event: ZhihuiTmsProgressEvent) => Promise<void> | void;
  ripgrepPath?: string | null;
  fdPath?: string | null;
  businessCommands?: ReadonlyMap<string, readonly string[]>;
  businessCommandCatalog?: readonly LxeSkillRecoveryCommand[];
  execShell?: ExecShellAdapter;
  execEnv?: (context: {
    skillNames: readonly string[];
    sessionId: string;
    turnId: string;
  }) => Record<string, string>;
  lxeSkillStatus?: () => LxeSkillRuntimeStatus;
  confirmLxeSkillCommand?: (input: {
    confirmation: LxeSkillCommandConfirmation;
    command: string;
    commandId: string;
    sessionId: string;
    turnId: string;
    toolCallId: string;
    platform?: string;
    signal: AbortSignal;
  }) => Promise<boolean>;
}
