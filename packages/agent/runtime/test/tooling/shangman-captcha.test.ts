import { afterEach, describe, expect, test } from "bun:test";
import {
  SHANGMAN_CAPTCHA_CHANNEL_TOKEN,
  SHANGMAN_CAPTCHA_CHANNEL_URL,
  ShangmanCaptchaBroker,
} from "../../src/tooling/shangman-captcha";

const image = "data:image/png;base64,Y2FwdGNoYQ==";

describe("Shangman captcha broker", () => {
  const brokers: ShangmanCaptchaBroker[] = [];
  afterEach(async () => {
    await Promise.all(brokers.splice(0).map(broker => broker.stop()));
  });

  test("keeps the image in an ephemeral session challenge and consumes the answer once", async () => {
    const changes: string[] = [];
    const broker = new ShangmanCaptchaBroker(sessionId => changes.push(sessionId));
    brokers.push(broker);
    const challenge = broker.createChallenge({
      sessionId: "session-1", turnId: "turn-1", captchaKey: "key-1", imageDataUrl: image,
    });
    expect(challenge.challenge_id).toBeString();
    expect(broker.snapshot("session-1")).toMatchObject({
      session_id: "session-1",
      challenge_id: challenge.challenge_id,
      image_data_url: image,
    });

    const waiting = broker.waitForAnswer("session-1", challenge.challenge_id, new AbortController().signal);
    expect(broker.consume("session-1", challenge.challenge_id)).toEqual({ status: "pending" });
    broker.answer("session-1", challenge.challenge_id, "A7x9");
    await waiting;
    expect(broker.consume("session-1", challenge.challenge_id)).toEqual({
      status: "ready",
      captcha_key: "key-1",
      captcha_code: "A7x9",
    });
    expect(broker.snapshot("session-1")).toBeUndefined();
    expect(changes).toEqual(["session-1", "session-1", "session-1"]);
  });

  test.skipIf(process.env.LXE_RUN_LOOPBACK_TESTS !== "1")("rejects non-loopback callers without the broker token and does not expose answer data in snapshots", async () => {
    const broker = new ShangmanCaptchaBroker();
    brokers.push(broker);
    await broker.start();
    const environment = broker.environmentFor("session-2");
    const response = await fetch(`${environment[SHANGMAN_CAPTCHA_CHANNEL_URL]}/v1/captcha/challenge`, {
      method: "POST",
      body: JSON.stringify({ session_id: "session-2", turn_id: "turn-2", captcha_key: "key-2", image }),
    });
    expect(response.status).toBe(401);

    const challenge = broker.createChallenge({ sessionId: "session-2", turnId: "turn-2", captchaKey: "key-2", imageDataUrl: image });
    broker.answer("session-2", challenge.challenge_id, "secret-code");
    expect(broker.snapshot("session-2")).not.toHaveProperty("answer");
  });
});
