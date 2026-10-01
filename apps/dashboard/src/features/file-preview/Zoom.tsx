import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Minus, Plus, Maximize } from "lucide-react";
import { useUiText } from "../../shared/i18n";
import type { ReadingState } from "./reading-state";
export const clampZoom = (value: number) => Math.min(400, Math.max(25, value));
export function useZoom(state: ReadingState, viewport: RefObject<HTMLDivElement | null>, fitPercent: number) {
  const [zoom, setZoom] = useState(state.zoom);
  const anchor = useRef<{ target: Element; x: number; y: number; fractionX: number; fractionY: number } | null>(null);
  const current = useRef(zoom); current.current = zoom;
  const change = (value: number, point?: { x: number; y: number }) => {
    const element = viewport.current, next = value === 0 ? 0 : clampZoom(value);
    if (element) {
      const rect = element.getBoundingClientRect(), x = point?.x ?? rect.left + element.clientWidth / 2, y = point?.y ?? rect.top + element.clientHeight / 2;
      const targets = [...element.querySelectorAll('.file-pdf-page, img')];
      const target = targets.find(target => target.getBoundingClientRect().bottom >= y) ?? targets.at(-1);
      if (target) { const box = target.getBoundingClientRect(); anchor.current = { target, x, y, fractionX: (x - box.left) / Math.max(1, box.width), fractionY: (y - box.top) / Math.max(1, box.height) }; }
    }
    state.zoom = next; current.current = next; setZoom(next);
  };
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault(); event.stopPropagation();
      change((current.current || fitPercent) * Math.exp(-event.deltaY * 0.01), { x: event.clientX, y: event.clientY });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [viewport, fitPercent]);
  useLayoutEffect(() => {
    const element = viewport.current, value = anchor.current;
    if (element && value) { const box = value.target.getBoundingClientRect(); element.scrollLeft += box.left + box.width * value.fractionX - value.x; element.scrollTop += box.top + box.height * value.fractionY - value.y; anchor.current = null; }
  }, [zoom]);
  return { zoom, change };
}
export function ZoomBar({ zoom, fitPercent, change }: { zoom: number; fitPercent: number; change(value: number): void }) {
  const t = useUiText().filePreview, effective = zoom || fitPercent;
  const presets = [...new Set([25, 50, 75, 100, 125, 150, 200, 300, 400, ...(zoom ? [zoom] : [])])].sort((a, b) => a - b);
  return <div className="file-zoom-bar" role="toolbar" aria-label={t.zoom}>
    <button aria-label={t.fit} title={t.fit} onClick={() => change(0)}><Maximize size={15} /></button>
    <button aria-label={t.zoomOut} disabled={effective <= 25} onClick={() => change(effective - 25)}><Minus size={15} /></button>
    <select aria-label={t.zoom} value={zoom} onChange={e => change(Number(e.target.value))}><option value={0}>{t.fit}</option>{presets.map(z => <option key={z} value={z}>{Math.round(z)}%</option>)}</select>
    <button aria-label={t.zoomIn} disabled={effective >= 400} onClick={() => change(effective + 25)}><Plus size={15} /></button>
  </div>;
}
