import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./kit";

interface Option { value: string; label: string; description?: string }

/** A select-only combobox using the app's menu styling. Focus stays on the trigger. */
export default function Select({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [position, setPosition] = useState<CSSProperties>({});
  const search = useRef({ text: "", at: 0 });
  const selected = options.findIndex((o) => o.value === value), current = options[selected];
  const place = () => {
    const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
    const below = window.innerHeight - rect.bottom - 14, above = rect.top - 14;
    const up = below < 220 && above > below, width = Math.min(Math.max(rect.width, 180), window.innerWidth - 24);
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width,
      maxHeight: Math.max(44, Math.min(320, up ? above : below)),
      ...(up ? { bottom: window.innerHeight - rect.top + 6, top: "auto" } : { top: rect.bottom + 6, bottom: "auto" }) });
  };
  const show = (index = Math.max(0, selected)) => { if (disabled || !options.length) return; place(); setActive(index); search.current = { text: "", at: 0 }; setOpen(true); };
  const choose = (index: number) => { if (options[index]) onChange(options[index].value); setOpen(false); };

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!trigger.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false); };
    const reposition = (e: Event) => { if (!menu.current?.contains(e.target as Node)) place(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition); window.addEventListener("scroll", reposition, true);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open]);
  useEffect(() => {
    const panel = menu.current, option = panel?.children[active] as HTMLElement | undefined;
    if (!open || !panel || !option) return;
    // Scroll only the menu, so reaching the last option cannot move the form behind it.
    const top = option.offsetTop - 6, bottom = option.offsetTop + option.offsetHeight + 6;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (bottom > panel.scrollTop + panel.clientHeight) panel.scrollTop = bottom - panel.clientHeight;
  }, [open, active]);

  const keyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !options.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) show(); else setActive(Math.max(0, Math.min(options.length - 1, active + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault(); const index = e.key === "Home" ? 0 : options.length - 1; if (open) setActive(index); else show(index);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); if (open) choose(active); else show();
    } else if (e.key === "Escape" && open) {
      e.preventDefault(); e.stopPropagation(); setOpen(false);
    } else if (e.key === "Tab" && open) choose(active);
    else if (e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const text = (Date.now() - search.current.at < 700 ? search.current.text : "") + e.key.toLowerCase();
      search.current = { text, at: Date.now() };
      const prefix = [...text].every((c) => c === text[0]) ? text[0] : text;
      const start = prefix.length === 1 ? (open ? active : selected) + 1 : 0;
      const index = options.map((_, i) => (i + start + options.length) % options.length).find((i) => options[i].label.toLowerCase().startsWith(prefix));
      if (index != null) { if (open) setActive(index); else onChange(options[index].value); }
    }
  };

  return <span className="app-select">
    <button ref={trigger} type="button" className="input select-trigger" role="combobox" aria-label={label} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled}
      title={current ? [current.label, current.description].filter(Boolean).join(" · ") : undefined}
      onClick={() => { if (open) setOpen(false); else show(); }} onKeyDown={keyDown} onBlur={() => setOpen(false)}>
      <span className="select-value">{current?.label ?? "Select…"}</span><Icon n="chev" s={16} />
    </button>
    {open && !disabled && createPortal(<div ref={menu} id={id} role="listbox" aria-label={label} className="pop select-menu" style={position}
      onMouseDown={(e) => e.preventDefault()}>
      {options.map((option, i) => <div key={option.value} id={`${id}-${i}`} role="option" aria-selected={i === selected}
        className={"opt" + (i === active ? " active" : "")} onPointerMove={() => setActive(i)} onClick={() => choose(i)}>
        <span className="select-option-text">{option.label}{option.description && <small>{option.description}</small>}</span>
        {i === selected && <Icon n="check" s={16} />}
      </div>)}
    </div>, document.body)}
  </span>;
}
