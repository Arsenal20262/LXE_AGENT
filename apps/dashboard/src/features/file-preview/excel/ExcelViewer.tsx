import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { WorkbookInstance } from "@fortune-sheet/react";
import type { ReadingState } from "../reading-state";
import { Workbook } from "@fortune-sheet/react";
import fortuneCss from "@fortune-sheet/react/dist/index.css?inline";
import ExcelWorker from "./worker?worker";
import type { ExcelPreview } from "./model";
import { excelFormat } from "./format";
import { useUiText } from "../../../shared/i18n";
export default function ExcelViewer({ bytes, name, state }: { bytes: Uint8Array; name: string; state: ReadingState }) {
  const ui = useUiText(), t = ui.filePreview;
  const [value, setValue] = useState<ExcelPreview>(), [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null), workbook = useRef<WorkbookInstance>(null), restoring = useRef(false), activeName = useRef<string | undefined>(undefined);
  const currentSheet = () => {
    const name = ref.current?.querySelector(".luckysheet-sheets-item-active .luckysheet-sheets-item-name")?.textContent;
    if (name) activeName.current = name;
    return workbook.current?.getAllSheets().find(sheet => sheet.name === activeName.current);
  };
  const capture = () => {
    const api = workbook.current; if (!api || restoring.current) return;
    const sheet = currentSheet(); if (!sheet) return;
    state.excel.active = sheet.name;
    state.excel.sheets[sheet.name] = {
      zoom: sheet.zoomRatio ?? 1,
      selection: (api.getSelection() ?? []).map(r => ({ row: [...r.row], column: [...r.column] })),
      left: ref.current?.querySelector('.luckysheet-scrollbar-x')?.scrollLeft ?? 0,
      top: ref.current?.querySelector('.luckysheet-scrollbar-y')?.scrollTop ?? 0,
    };
  };
  const restore = () => {
    const api = workbook.current; if (!api) return;
    const sheet = currentSheet(); if (!sheet?.data) return;
    const saved = state.excel.sheets[sheet.name];
    if (saved) {
      api.setSelection(saved.selection.map(r => ({ row: r.row.map(v => Math.max(0, Math.min((sheet.row ?? 1) - 1, v))), column: r.column.map(v => Math.max(0, Math.min((sheet.column ?? 1) - 1, v))) })));
      api.scroll({ scrollLeft: saved.left, scrollTop: saved.top });
    }
    state.excel.active = sheet.name; restoring.current = false;
  };
  useLayoutEffect(() => {
    if (!value) return;
    restoring.current = true;
    let frame = requestAnimationFrame(restore), previous = activeName.current;
    const observer = new MutationObserver(() => {
      const name = ref.current?.querySelector(".luckysheet-sheets-item-active .luckysheet-sheets-item-name")?.textContent;
      if (!name || name === previous) return;
      previous = name; restoring.current = true;
      cancelAnimationFrame(frame); frame = requestAnimationFrame(restore);
    });
    if (ref.current) observer.observe(ref.current, { subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); restoring.current = false; capture(); };
  }, [value]);
  useEffect(() => {
    const worker = new ExcelWorker(), timer = setTimeout(() => { setError(t.timeout); worker.terminate(); }, 15000);
    setValue(undefined); setError("");
    worker.onmessage = event => {
      clearTimeout(timer);
      if (event.data.ok) {
        const parsed = event.data.value as ExcelPreview;
        const selected = parsed.sheets.find(s => !s.hide && s.name === state.excel.active) ?? parsed.sheets.find(s => !s.hide);
        activeName.current = selected?.name;
        const names = new Set(parsed.sheets.map(s => s.name));
        for (const name of Object.keys(state.excel.sheets)) if (!names.has(name)) delete state.excel.sheets[name];
        for (const sheet of parsed.sheets) { sheet.status = sheet === selected ? 1 : 0; const saved = state.excel.sheets[sheet.name]; if (saved) sheet.zoomRatio = saved.zoom; }
        setValue(parsed);
      }
      else setError([event.data.code === "tooLarge" ? t.size : event.data.code === "encoding" ? t.encoding : "", event.data.error].filter(Boolean).join("\n"));
      worker.terminate();
    };
    worker.onerror = event => { clearTimeout(timer); setError(event.message); worker.terminate(); };
    const copy = bytes.slice(); worker.postMessage({ bytes: copy, format: excelFormat(name), limits: { maxBytes: 16777216, maxCells: 250000, timeoutMs: 15000 } }, [copy.buffer]);
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [bytes, name, t]);
  useEffect(() => {
    if (!value || !ref.current) return;
    let frame = 0, width = -1, height = -1;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || (entry.contentRect.width === width && entry.contentRect.height === height)) return;
      ({ width, height } = entry.contentRect);
      // FortuneSheet measures and updates its canvas on resize. Defer that work
      // until after ResizeObserver delivery to avoid a synchronous layout loop.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
    observer.observe(ref.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value]);
  if (error) return <pre className="file-preview-error" role="alert">{error}</pre>;
  if (!value) return <p role="status">{t.loading}</p>;
  const features = { charts: t.chart, images: t.image, shapes: t.shape, conditionalFormatting: t.conditional };
  return <section className="file-excel" data-lxe-excel>
    <style>{`@scope ([data-lxe-excel]) { ${fortuneCss} }`}</style>
    {value.missingResults ? <div className="file-preview-note">{t.missing}</div> : null}
    {value.sheets.some(s => s.celldata?.some(c => c.v?.f)) ? <span className="file-formula-note" title={t.formulas} aria-label={t.formulas}><Info size={13} /></span> : null}
    {value.unsupportedFeatures.length ? <div className="file-preview-note">{t.omitted}{value.unsupportedFeatures.map(f => features[f]).join("、")}</div> : null}
    <div className="file-excel-workbook" ref={ref} onScrollCapture={capture} onPointerUp={() => requestAnimationFrame(capture)} onKeyUp={capture}><Workbook ref={workbook} hooks={{ beforeActivateSheet: () => { capture(); restoring.current = true; return true; }, afterActivateSheet: () => { requestAnimationFrame(restore); }, afterSelectionChange: () => requestAnimationFrame(capture) }} onChange={() => requestAnimationFrame(() => restoring.current ? restore() : capture())} data={value.sheets} lang={ui.language.label === "Language" ? "en" : "zh"} allowEdit={false} showToolbar={false} showFormulaBar showSheetTabs forceCalculation={false} cellContextMenu={["copy"]} headerContextMenu={[]} sheetTabContextMenu={[]} filterContextMenu={[]} /></div>
  </section>;
}
