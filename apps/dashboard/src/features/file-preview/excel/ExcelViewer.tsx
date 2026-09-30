import { useEffect, useRef, useState } from "react";
import { Workbook } from "@fortune-sheet/react";
import fortuneCss from "@fortune-sheet/react/dist/index.css?inline";
import ExcelWorker from "./worker?worker";
import type { ExcelPreview } from "./model";
import { excelFormat } from "./format";
import { useUiText } from "../../../shared/i18n";
export default function ExcelViewer({ bytes, name }: { bytes: Uint8Array; name: string }) {
  const ui = useUiText(), t = ui.filePreview;
  const [value, setValue] = useState<ExcelPreview>(), [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const worker = new ExcelWorker(), timer = setTimeout(() => { setError(t.timeout); worker.terminate(); }, 15000);
    setValue(undefined); setError("");
    worker.onmessage = event => {
      clearTimeout(timer);
      if (event.data.ok) setValue(event.data.value);
      else setError([event.data.code === "tooLarge" ? t.size : event.data.code === "encoding" ? t.encoding : "", event.data.error].filter(Boolean).join("\n"));
      worker.terminate();
    };
    worker.onerror = event => { clearTimeout(timer); setError(event.message); worker.terminate(); };
    const copy = bytes.slice(); worker.postMessage({ bytes: copy, format: excelFormat(name), limits: { maxBytes: 16777216, maxCells: 250000, timeoutMs: 15000 } }, [copy.buffer]);
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [bytes, name, t]);
  useEffect(() => {
    if (!value || !ref.current) return;
    const observer = new ResizeObserver(() => window.dispatchEvent(new Event("resize")));
    observer.observe(ref.current); return () => observer.disconnect();
  }, [value]);
  if (error) return <pre className="file-preview-error" role="alert">{error}</pre>;
  if (!value) return <p role="status">{t.loading}</p>;
  const features = { charts: t.chart, images: t.image, shapes: t.shape, conditionalFormatting: t.conditional };
  return <section className="file-excel" data-lxe-excel>
    <style>{`@scope ([data-lxe-excel]) { ${fortuneCss} }`}</style>
    {value.sheets.some(s => s.celldata?.some(c => c.v?.f)) ? <div className="file-preview-note">{t.formulas} {value.missingResults ? t.missing : ""}</div> : null}
    {value.unsupportedFeatures.length ? <div className="file-preview-note">{t.omitted}{value.unsupportedFeatures.map(f => features[f]).join("、")}</div> : null}
    <div className="file-excel-workbook" ref={ref}><Workbook data={value.sheets} lang={ui.language.label === "Language" ? "en" : "zh"} allowEdit={false} showToolbar={false} showFormulaBar showSheetTabs forceCalculation={false} cellContextMenu={["copy"]} headerContextMenu={[]} sheetTabContextMenu={[]} filterContextMenu={[]} /></div>
  </section>;
}
