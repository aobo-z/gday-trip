import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import axiosClient from "../src/api/axiosClient";
import { server } from "./server";

/* Browser APIs jsdom doesn't have. Reduced motion is on, so dialogs close and lists update without waiting
   for animations (the app checks prefers-reduced-motion through matchMedia). */
const media = (query: string) => ({
  matches: query.includes("prefers-reduced-motion"), media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
});
Object.defineProperty(window, "matchMedia", { writable: true, value: media });

Object.assign(globalThis.CSS ?? (globalThis.CSS = {} as typeof CSS), { supports: () => false });
class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
Object.assign(globalThis, { ResizeObserver: Observer, IntersectionObserver: Observer });

HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
Element.prototype.animate = function animate() {
  return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null, addEventListener() {} } as unknown as Animation;
};
Element.prototype.scrollIntoView = function scrollIntoView() {};
Element.prototype.scrollTo = function scrollTo() {} as Element["scrollTo"];
window.scrollTo = (() => {}) as typeof window.scrollTo;
URL.createObjectURL = () => "blob:test";
URL.revokeObjectURL = () => {};
Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.resolve() } });

/* Every request goes to the in-memory backend instead of the network. */
axiosClient.defaults.adapter = (config) => server.handle(config);

beforeEach(() => { server.reset(); localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, "", "/"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
