/** Tiny DOM helper. Text always goes through textContent, never innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; attrs?: Record<string, string> } = {},
  children: (Node | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.append(c);
  return node;
}

export const img = (src: string, alt = "", cls?: string): HTMLImageElement =>
  el("img", { class: cls, attrs: { src, alt, draggable: "false" } });
