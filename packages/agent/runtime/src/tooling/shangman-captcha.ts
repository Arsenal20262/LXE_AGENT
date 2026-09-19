import { randomBytes, randomUUID } from "node:crypto";
import type { JsonObject } from "@lxe/protocol";
import { ToolExecutionError, type ToolRegistry } from "./registry";

export const SHANGMAN_CAPTCHA_SKILL = "shangman-goods-export-workflow-map";
export const SHANGMAN_CAPTCHA_CHANNEL_URL = "LXE_SHANGMAN_CAPTCHA_CHANNEL_URL";
export const SHANGMAN_CAPTCHA_CHANNEL_TOKEN = "LXE_SHANGMAN_CAPTCHA_CHANNEL_TOKEN";
export const SHANGMAN_CAPTCHA_CHALLENGE_ID = "LXE_SHANGMAN_CAPTCHA_CHALLENGE_ID";
const CAPTCHA_TTL_MS = 5 * 60_000;
const MAX_IMAGE_BYTES = 2_000_000;
const MAX_CODE_LENGTH = 128;

export interface PendingShangmanCaptcha {
  session_id: string;
  challenge_id: string;
  image_data_url: string;
  expires_at: number;
}

export interface ShangmanCaptchaEnvironment {
  [SHANGMAN_CAPTCHA_CHANNEL_URL]: string;
  [SHANGMAN_CAPTCHA_CHANNEL_TOKEN]: string;
  [SHANGMAN_CAPTCHA_CHALLENGE_ID]: string;
}

export type ShangmanCaptchaState = "expired" | "not_found" | "invalid_answer";

export class ShangmanCaptchaStateError extends Error {
  constructor(readonly state: ShangmanCaptchaState, message: string) {
    super(message);
    this.name = "ShangmanCaptchaStateError";
  }
}

interface Challenge {
  id: string;
  sessionId: string;
  turnId: string;
  captchaKey: string;
  imageDataUrl: string;
  expiresAt: number;
  answer?: string;
  waiters: Set<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>;
}

const text = (value: unknown): string => String(value ?? "").trim();

const json = (body: JsonObject, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

const isImageDataUrl = (value: string): boolean => {
  if (value.length > MAX_IMAGE_BYTES) return false;
  return /^data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/u.test(value);
};

const hasControlCharacter = (value: string): boolean => /[\u0000-\u001f\u007f]/u.test(value);

export class ShangmanCaptchaBroker {
  private readonly challenges = new Map<string, Challenge>();
  private readonly token = randomBytes(32).toString("base64url");
  private server: ReturnType<typeof Bun.serve> | undefined;
  private changed: (sessionId: string) => void = () => {};

  constructor(onChanged?: (sessionId: string) => void) {
    if (onChanged) this.changed = onChanged;
  }

  async start(): Promise<void> {
    if (this.server) return;
    let lastError: unknown;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const port = 45_000 + (randomBytes(2).readUInt16BE(0) % 10_000);
      try {
        this.server = Bun.serve({
          hostname: "127.0.0.1",
          port,
          fetch: request => this.handleRequest(request),
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Shangman captcha broker could not bind a loopback port");
  }

  async stop(): Promise<void> {
    for (const challenge of this.challenges.values()) this.rejectWaiters(challenge, "Captcha broker stopped");
    this.challenges.clear();
    this.server?.stop(true);
    this.server = undefined;
  }

  environmentFor(sessionId: string): ShangmanCaptchaEnvironment {
    const server = this.server;
    if (!server) throw new Error("Shangman captcha broker is not started");
    this.expire(sessionId);
    return {
      [SHANGMAN_CAPTCHA_CHANNEL_URL]: `http://127.0.0.1:${server.port}`,
      [SHANGMAN_CAPTCHA_CHANNEL_TOKEN]: this.token,
      [SHANGMAN_CAPTCHA_CHALLENGE_ID]: this.challenges.get(sessionId)?.id ?? "",
    };
  }

  hasSession(sessionId: string): boolean {
    this.expire(sessionId);
    return this.challenges.has(sessionId);
  }

  snapshot(sessionId: string): PendingShangmanCaptcha | undefined {
    this.expire(sessionId);
    const challenge = this.challenges.get(sessionId);
    if (!challenge) return undefined;
    return {
      session_id: challenge.sessionId,
      challenge_id: challenge.id,
      image_data_url: challenge.imageDataUrl,
      expires_at: challenge.expiresAt,
    };
  }

  createChallenge(input: {
    sessionId: string;
    turnId: string;
    captchaKey: string;
    imageDataUrl: string;
  }): { challenge_id: string; expires_at: number } {
    const sessionId = text(input.sessionId);
    const turnId = text(input.turnId);
    const captchaKey = text(input.captchaKey);
    const imageDataUrl = text(input.imageDataUrl);
    if (!sessionId || !turnId || !captchaKey || !isImageDataUrl(imageDataUrl)) {
      throw new Error("invalid Shangman captcha challenge");
    }
    this.expire(sessionId);
    const existing = this.challenges.get(sessionId);
    if (existing) return { challenge_id: existing.id, expires_at: existing.expiresAt };
    const challenge: Challenge = {
      id: randomUUID(),
      sessionId,
      turnId,
      captchaKey,
      imageDataUrl,
      expiresAt: Date.now() + CAPTCHA_TTL_MS,
      waiters: new Set(),
    };
    this.challenges.set(sessionId, challenge);
    this.changed(sessionId);
    return { challenge_id: challenge.id, expires_at: challenge.expiresAt };
  }

  answer(sessionId: string, challengeId: string, code: string): { accepted: true; challenge_id: string } {
    const challenge = this.find(sessionId, challengeId);
    const normalized = text(code);
    if (!normalized || normalized.length > MAX_CODE_LENGTH || hasControlCharacter(normalized)) {
      throw new ShangmanCaptchaStateError("invalid_answer", "Captcha answer must be non-empty bounded text");
    }
    if (challenge.answer && challenge.answer !== normalized) {
      throw new ShangmanCaptchaStateError("invalid_answer", "Captcha answer was already submitted");
    }
    challenge.answer = normalized;
    for (const waiter of challenge.waiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve();
    }
    challenge.waiters.clear();
    this.changed(sessionId);
    return { accepted: true, challenge_id: challenge.id };
  }

  consume(sessionId: string, challengeId: string):
    | { status: "pending" }
    | { status: "expired" }
    | { status: "ready"; captcha_key: string; captcha_code: string } {
    const challenge = this.findOrExpired(sessionId, challengeId);
    if (!challenge) return { status: "expired" };
    if (!challenge.answer) return { status: "pending" };
    this.challenges.delete(sessionId);
    this.changed(sessionId);
    const answer = challenge.answer;
    delete challenge.answer;
    return { status: "ready", captcha_key: challenge.captchaKey, captcha_code: answer };
  }

  async waitForAnswer(sessionId: string, challengeId: string, signal: AbortSignal): Promise<void> {
    const challenge = this.find(sessionId, challengeId);
    if (challenge.answer) return;
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          challenge.waiters.delete(waiter);
          this.expire(sessionId);
          reject(new ShangmanCaptchaStateError("expired", "Captcha input expired"));
        }, Math.max(1, challenge.expiresAt - Date.now())),
      };
      const abort = () => {
        challenge.waiters.delete(waiter);
        signal.removeEventListener("abort", abort);
        clearTimeout(waiter.timeout);
        reject(signal.reason instanceof Error ? signal.reason : new Error("Captcha input cancelled"));
      };
      signal.addEventListener("abort", abort, { once: true });
      challenge.waiters.add(waiter);
      if (challenge.answer) {
        challenge.waiters.delete(waiter);
        signal.removeEventListener("abort", abort);
        clearTimeout(waiter.timeout);
        resolve();
      }
    });
  }

  forgetSession(sessionId: string): void {
    const challenge = this.challenges.get(sessionId);
    if (!challenge) return;
    this.rejectWaiters(challenge, "Captcha input ended because its session closed");
    this.challenges.delete(sessionId);
    this.changed(sessionId);
  }

  private find(sessionId: string, challengeId: string): Challenge {
    const challenge = this.findOrExpired(sessionId, challengeId);
    if (!challenge) throw new ShangmanCaptchaStateError("not_found", "Captcha challenge is no longer available");
    return challenge;
  }

  private findOrExpired(sessionId: string, challengeId: string): Challenge | undefined {
    this.expire(sessionId);
    const challenge = this.challenges.get(text(sessionId));
    return challenge && challenge.id === text(challengeId) ? challenge : undefined;
  }

  private expire(sessionId: string): void {
    const challenge = this.challenges.get(sessionId);
    if (!challenge || challenge.expiresAt > Date.now()) return;
    this.rejectWaiters(challenge, "Captcha input expired");
    this.challenges.delete(sessionId);
    this.changed(sessionId);
  }

  private rejectWaiters(challenge: Challenge, message: string): void {
    const error = new ShangmanCaptchaStateError("expired", message);
    for (const waiter of challenge.waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    challenge.waiters.clear();
  }

  private authorized(request: Request): boolean {
    const header = request.headers.get("authorization") ?? "";
    return header.startsWith("Bearer ") && header.slice("Bearer ".length) === this.token;
  }

  private async handleRequest(request: Request): Promise<Response> {
    if (!this.authorized(request)) return json({ error: "unauthorized" }, 401);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const url = new URL(request.url);
    let body: Record<string, unknown>;
    try {
      const raw = await request.text();
      if (raw.length > MAX_IMAGE_BYTES + 100_000) return json({ error: "request_too_large" }, 413);
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const sessionId = text(body.session_id);
    if (!sessionId) return json({ error: "session_id_required" }, 400);
    try {
      if (url.pathname === "/v1/captcha/challenge") {
        const result = this.createChallenge({
          sessionId,
          turnId: text(body.turn_id),
          captchaKey: text(body.captcha_key),
          imageDataUrl: text(body.image),
        });
        return json({ status: "input_required", ...result });
      }
      if (url.pathname === "/v1/captcha/consume") {
        const result = this.consume(sessionId, text(body.challenge_id));
        return json(result);
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      if (error instanceof ShangmanCaptchaStateError) {
        const status = error.state === "expired" ? "expired" : "not_found";
        return json({ status }, error.state === "expired" ? 410 : 404);
      }
      return json({ error: "invalid_request" }, 400);
    }
  }
}

export function registerShangmanCaptchaTool(
  registry: ToolRegistry,
  broker: ShangmanCaptchaBroker,
): void {
  registry.register({
    name: "shangman_captcha",
    platforms: ["desktop"],
    exposure: "deferred",
    ownerSkills: [SHANGMAN_CAPTCHA_SKILL],
    description: "Wait for the Desktop operator to enter the displayed Shangman captcha. Pass only the opaque challenge_id from the latest shangman export result; never ask for or echo the captcha image or code.",
    input_schema: {
      type: "object",
      required: ["challenge_id"],
      additionalProperties: false,
      properties: {
        challenge_id: { type: "string", minLength: 1, maxLength: 200 },
      },
    },
    execute: async (input, context) => {
      const challengeId = text(input.challenge_id);
      if (!challengeId || challengeId.length > 200) {
        throw new ToolExecutionError("invalid_argument", "challenge_id must be bounded non-empty text");
      }
      try {
        await broker.waitForAnswer(context.session_id, challengeId, context.handle.signal);
      } catch (error) {
        const state = error instanceof ShangmanCaptchaStateError ? error.state : "not_found";
        throw new ToolExecutionError(
          state === "expired" ? "failed_precondition" : "unavailable",
          state === "expired" ? "Shangman captcha input expired" : "Shangman captcha challenge is unavailable",
          {
            type: "shangman_captcha",
            challenge_id: challengeId,
            state,
            next_action: "rerun the canonical Shangman export command to request a new captcha",
          },
          "shangman_captcha",
        );
      }
      return { content: [{ type: "text", text: JSON.stringify({ accepted: true, challenge_id: challengeId }) }] };
    },
  });
}
