import { createContext, useContext, type ReactNode } from "react";

export interface ConfirmOptions { title: string; body?: ReactNode; label: string; danger?: boolean }
export interface Overlay {
  /** One modal at a time; opening another replaces it. */
  dialog(node: ReactNode, opts?: { wide?: boolean; lock?: boolean }): void;
  closeDialog(): void;
  /** A side drawer, or with `modal` a large centred window (the activity views). */
  drawer(node: ReactNode, opts?: { modal?: boolean }): void;
  closeDrawer(): void;
  toast(msg: string, undo?: () => void): void;
  /** Resolves true when confirmed. Danger actions use hold-to-confirm. */
  confirm(o: ConfirmOptions): Promise<boolean>;
}
export const OverlayContext = createContext<Overlay | null>(null);
export function useOverlay() {
  const o = useContext(OverlayContext);
  if (!o) throw new Error("useOverlay outside OverlayProvider");
  return o;
}
