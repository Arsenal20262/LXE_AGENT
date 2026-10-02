import { useEffect, useRef, useState } from "react";
import { useUiText } from "../../../shared/i18n";
import { filesApi } from "../api";
import { htmlReferences } from "./references";

export default function HtmlViewer({ handle, bytes, reload, failed }: {
  handle: string; bytes: Uint8Array; reload(): void; failed(error: unknown): void;
}) {
  const t = useUiText().filePreview, [url, setUrl] = useState("");
  const callbacks = useRef({ reload, failed }); callbacks.current = { reload, failed };
  useEffect(() => {
    let active = true, version: string | undefined, checking = false;
    setUrl("");
    void (async () => {
      const references = htmlReferences(bytes);
      const prepared = await filesApi().call({ operation: "html.prepare", input: { handle, references } });
      if (!active) return;
      version = prepared.version; setUrl(prepared.url);
    })().catch(error => { if (active) callbacks.current.failed(error); });
    const check = async () => {
      if (!active || !version || checking) return;
      checking = true;
      try {
        const next = await filesApi().call({ operation: "html.version", input: { handle } });
        if (active && next.version !== version) { version = undefined; callbacks.current.reload(); }
      } catch (error) { if (active) { version = undefined; callbacks.current.failed(error); } }
      finally { checking = false; }
    };
    const focus = () => { void check(); }, timer = setInterval(() => { if (!document.hidden) void check(); }, 1500);
    window.addEventListener("focus", focus);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [handle, bytes]);
  return url
    ? <iframe key={url} className="file-html-preview" src={url} title={t.html} sandbox="allow-scripts" referrerPolicy="no-referrer" />
    : <p className="file-preview-loading" role="status">{t.loading}</p>;
}
