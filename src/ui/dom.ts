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
