import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { OverlayContext, type ConfirmOptions, type Overlay } from "./overlayContext";
import { HoldButton, Icon } from "./kit";
import { still } from "../lib/theme";

/** Plays the exit animation, then really closes (keeps <dialog> semantics: focus trap, Esc, backdrop). */
function animateClose(d: HTMLDialogElement | null, done: () => void) {
  if (!d || !d.open) { done(); return; }
  if (still()) { d.close(); done(); return; }
  d.classList.add("closing");
  window.setTimeout(() => { d.classList.remove("closing"); d.close(); done(); }, d.classList.contains("peek") ? 170 : d.classList.contains("drawer") ? 220 : 150);
}

export function DlgHead({ title, onClose }: { title: ReactNode; onClose: () => void }) {
  return <div className="dlg-head"><h2>{title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon n="x" s={20} /></button></div>;
}

type ShowToast = (msg: string, undo?: () => void) => void;
const ToastContext = createContext<ShowToast | null>(null);

/**
 * The toast lives above the trip pages, so a message survives moving to another trip (leaving or deleting a
 * trip toasts, then opens the next one, which rebuilds everything inside the trip).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; undo?: () => void; seq: number } | null>(null);
  const [on, setOn] = useState(false);
  const timer = useRef(0), seq = useRef(0);
  const show = useCallback<ShowToast>((msg, undo) => {
    setToast({ msg, undo, seq: ++seq.current }); setOn(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), undo ? 5000 : 2600);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <ToastContext.Provider value={show}>
    {children}
    <div className={"toast" + (on ? " on" : "")} role="status" aria-live="polite" style={{ pointerEvents: on && toast?.undo ? "auto" : "none" }}>
      {toast && <><Icon n="check" s={18} /><span>{toast.msg}</span>
        {toast.undo && <button type="button" onClick={() => { const u = toast.undo; setOn(false); u?.(); }}>Undo</button>}</>}
    </div>
  </ToastContext.Provider>;
}

export default function OverlayProvider({ children }: { children: ReactNode }) {
  const dlg = useRef<HTMLDialogElement>(null), drw = useRef<HTMLDialogElement>(null);
  const [dialog, setDialog] = useState<{ node: ReactNode; wide?: boolean; lock?: boolean; seq: number } | null>(null);
  const [drawer, setDrawer] = useState<{ node: ReactNode; modal?: boolean; seq: number } | null>(null);
  const toast = useContext(ToastContext);
  const seq = useRef(0), confirmResolve = useRef<((v: boolean) => void) | null>(null);

  const closeDialog = useCallback(() => {
    const r = confirmResolve.current; confirmResolve.current = null; r?.(false);
    animateClose(dlg.current, () => setDialog(null));
  }, []);
  const closeDrawer = useCallback(() => animateClose(drw.current, () => setDrawer(null)), []);

  const api = useMemo<Overlay>(() => ({
    dialog: (node, opts) => {
      const r = confirmResolve.current; confirmResolve.current = null; r?.(false);
      dlg.current?.classList.remove("closing");
      setDialog({ node, wide: opts?.wide, lock: opts?.lock, seq: ++seq.current });
    },
    closeDialog,
    drawer: (node, opts) => {
      const d = drw.current; d?.classList.remove("closing");
      // Switching between the window and the side drawer (an avatar inside an activity) reopens it, so it animates in its new place.
      if (d?.open && !!opts?.modal !== d.classList.contains("peek")) d.close();
      setDrawer({ node, modal: opts?.modal, seq: ++seq.current });
    },
    closeDrawer,
    toast: (msg, undo) => { if (toast) toast(msg, undo); },
    confirm: (o: ConfirmOptions) => new Promise<boolean>((resolve) => {
      dlg.current?.classList.remove("closing");
      const done = (v: boolean) => { confirmResolve.current = null; resolve(v); animateClose(dlg.current, () => setDialog(null)); };
      setDialog({
        seq: ++seq.current, node: <div className="dlg-body">
          <DlgHead title={o.title} onClose={() => done(false)} />
          {o.body && <div className="muted" style={{ fontWeight: 600 }}>{o.body}</div>}
          <div className="dlg-foot"><button type="button" className="btn btn-ghost" onClick={() => done(false)}>Cancel</button>
            {o.danger ? <HoldButton label={o.label} onConfirm={() => done(true)} /> : <button type="button" className="btn btn-solid" autoFocus onClick={() => done(true)}>{o.label}</button>}</div>
        </div>,
      });
      confirmResolve.current = resolve;
    }),
  }), [closeDialog, closeDrawer, toast]);

  useEffect(() => { const d = dlg.current; if (dialog && d && !d.open) d.showModal(); }, [dialog]);
  useEffect(() => { const d = drw.current; if (drawer && d && !d.open) d.showModal(); }, [drawer]);

  return <OverlayContext.Provider value={api}>
    {children}
    <dialog ref={dlg} className={"dlg" + (dialog?.wide ? " wide" : "")}
      onCancel={(e) => { e.preventDefault(); if (!dialog?.lock) closeDialog(); }}
      onClick={(e) => { if (e.target === dlg.current && !dialog?.lock) closeDialog(); }}>
      {dialog && <div key={dialog.seq} style={{ display: "contents" }}>{dialog.node}</div>}
    </dialog>
    <dialog ref={drw} className={"drawer" + (drawer?.modal ? " peek" : "")} onCancel={(e) => { e.preventDefault(); closeDrawer(); }} onClick={(e) => { if (e.target === drw.current) closeDrawer(); }}>
      {drawer && <div className="dlg-body" key={drawer.seq}>{drawer.node}</div>}
    </dialog>
  </OverlayContext.Provider>;
}
