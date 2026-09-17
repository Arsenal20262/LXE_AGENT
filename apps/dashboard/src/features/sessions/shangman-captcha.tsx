import React, { useEffect, useState } from "react";
import type { PendingShangmanCaptcha } from "@lxe/desktop-protocol";
import { Check, RefreshCw } from "lucide-react";
import { useShangmanCaptchaActions } from "../../api/queries";
import { useUiText } from "../../shared/i18n";

export function ShangmanCaptchaGate({
  captcha,
  onAnswered,
  children,
}: {
  captcha?: PendingShangmanCaptcha;
  onAnswered?: () => void;
  children: React.ReactNode;
}) {
  return captcha ? (
    <ShangmanCaptchaCard key={captcha.challenge_id} captcha={captcha} onAnswered={onAnswered} />
  ) : children;
}

function ShangmanCaptchaCard({
  captcha,
  onAnswered,
}: {
  captcha: PendingShangmanCaptcha;
  onAnswered?: () => void;
}) {
  const t = useUiText().shangmanCaptcha;
  const actions = useShangmanCaptchaActions();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCode("");
    setSubmitting(false);
    setAccepted(false);
    setError("");
  }, [captcha.challenge_id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = code.trim();
    if (!value || submitting || accepted) return;
    setSubmitting(true);
    setError("");
    try {
      await actions.submit({
        session_id: captcha.session_id,
        challenge_id: captcha.challenge_id,
        code: value,
      });
      setCode("");
      setAccepted(true);
      onAnswered?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="shangman-captcha-card" onSubmit={submit} aria-label={t.title}>
      <div className="shangman-captcha-copy">
        <span className="shangman-captcha-eyebrow">{t.eyebrow}</span>
        <h3>{accepted ? t.accepted : t.title}</h3>
        <p>{accepted ? t.acceptedHint : t.hint}</p>
      </div>
      {!accepted ? (
        <div className="shangman-captcha-panel">
          <img src={captcha.image_data_url} alt={t.imageAlt} draggable={false} />
          <label>
            <span>{t.inputLabel}</span>
            <input
              value={code}
              onChange={event => setCode(event.target.value)}
              maxLength={128}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </label>
        </div>
      ) : (
        <div className="shangman-captcha-accepted" role="status"><Check size={18} />{t.accepted}</div>
      )}
      {error ? <div className="shangman-captcha-error" role="alert">{error}</div> : null}
      <footer className="shangman-captcha-actions">
        <small>{t.noStorage}</small>
        {!accepted ? (
          <button type="submit" disabled={!code.trim() || submitting}>
            {submitting ? t.submitting : <><RefreshCw size={15} />{t.submit}</>}
          </button>
        ) : null}
      </footer>
    </form>
  );
}
