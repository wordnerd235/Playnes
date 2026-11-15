// Tiny DOM helper: h("div.card", { onclick }, [children]).

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  sel: K | `${K}.${string}` | `${K}#${string}`,
  props: Partial<Record<string, unknown>> = {},
  children: Child[] | Child = [],
): HTMLElementTagNameMap[K] {
  const [tagAndId, ...classes] = sel.split(".");
  const [tag, id] = tagAndId.split("#");
  const e = document.createElement(tag as K);
  if (id) e.id = id;
  if (classes.length) e.className = classes.join(" ");
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v as EventListener);
    else if (k === "html") e.innerHTML = String(v);
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k === "dataset" && typeof v === "object") Object.assign(e.dataset, v);
    else if (k in e && k !== "list") (e as unknown as Record<string, unknown>)[k] = v;
    else e.setAttribute(k, String(v));
  }
  for (const c of Array.isArray(children) ? children : [children]) {
    if (c === null || c === undefined || c === false) continue;
    e.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

export function clear(e: HTMLElement): void {
  while (e.firstChild) e.removeChild(e.firstChild);
}

// ----- Write-if-changed helpers for things updated every frame (gauges, the HUD). Even writing the
// same value makes the browser recheck styles; skipping unchanged writes saves that work 60
// times a second. Only use these for elements that nothing else writes to.
const last = new WeakMap<Element, Map<string, string>>();

function changed(el: Element, key: string, v: string): boolean {
  let m = last.get(el);
  if (!m) {
    m = new Map();
    last.set(el, m);
  }
  if (m.get(key) === v) return false;
  m.set(key, v);
  return true;
}

export function setText(el: Element, v: string): void {
  if (changed(el, "#text", v)) el.textContent = v;
}

export function setAttr(el: Element, name: string, v: string): void {
  if (changed(el, `@${name}`, v)) el.setAttribute(name, v);
}

/** `prop` in CSS form: "width", "left", "bottom"... */
export function setStyle(el: HTMLElement, prop: string, v: string): void {
  if (changed(el, prop, v)) el.style.setProperty(prop, v);
}
