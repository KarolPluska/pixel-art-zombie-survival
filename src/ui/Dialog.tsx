import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Art";

export function Dialog({ title, eyebrow, onClose, children, wide = false }: {
  title: string; eyebrow: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => { el?.close(); };
  }, []);
  return <dialog ref={ref} className={`field-dialog ${wide ? "wide" : ""}`} aria-label={title}
    onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => {
      if (e.target !== e.currentTarget) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
    }}>
    <header className="dialog-heading">
      <div><div className="micro dialog-kicker"><i className="short-line" />{eyebrow}</div><h2>{title}</h2></div>
      <button type="button" className="square-btn" aria-label="Zamknij okno" onClick={onClose}><Icon name="close" /></button>
    </header>
    {children}
  </dialog>;
}