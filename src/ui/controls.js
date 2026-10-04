import { PARAMS, LENSES, FOCUS_INFINITY } from '../state.js';

// Shared "user is dragging" flag so the preview can drop quality while interacting.
export const interaction = { active: false, until: 0 };

function markInteracting() {
  interaction.active = true;
  interaction.until = performance.now() + 250;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function toSlider(def, v) {
  if (def.type === 'stops') {
    let best = 0;
    def.stops.forEach((s, i) => {
      if (Math.abs(Math.log(s / v)) < Math.abs(Math.log(def.stops[best] / v))) best = i;
    });
    return best;
  }
  if (def.log) return (Math.log(v / def.min) / Math.log(def.max / def.min)) * 1000;
  return ((v - def.min) / (def.max - def.min)) * 1000;
}

function fromSlider(def, x) {
  if (def.type === 'stops') return def.stops[Math.round(x)];
  let v = def.log ? def.min * (def.max / def.min) ** (x / 1000) : def.min + ((def.max - def.min) * x) / 1000;
  if (def.step) v = Math.round(v / def.step) * def.step;
  return v;
}

export function createControl(key, store, opts = {}) {
  const def = { ...PARAMS[key], ...(opts.override ?? {}) };
  const fmt = def.format ?? ((v) => String(v));
  let root;
  let refresh;

  if (def.type === 'range' || def.type === 'stops') {
    root = el('div', 'ctl ctl-range');
    const head = el('div', 'ctl-head');
    const label = el('label', 'ctl-label', def.label);
    const out = el('output', 'ctl-value');
    head.append(label, out);
    const input = el('input');
    input.type = 'range';
    input.min = 0;
    input.max = def.type === 'stops' ? def.stops.length - 1 : 1000;
    input.step = 1;
    input.id = `ctl-${key}-${Math.random().toString(36).slice(2, 7)}`;
    label.htmlFor = input.id;
    root.append(head, input);
    if (def.type === 'stops') {
      const ticks = el('div', 'ctl-ticks');
      for (const s of def.stops) if ([1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22].includes(s)) ticks.append(el('span', null, s));
      root.append(ticks);
    }
    input.addEventListener('input', () => {
      markInteracting();
      let v = fromSlider(def, Number(input.value));
      if (key === 'focus' && Number(input.value) >= 999) v = FOCUS_INFINITY;
      store.set({ [key]: v });
    });
    input.addEventListener('pointerdown', markInteracting);
    refresh = () => {
      const v = store.get(key);
      if (document.activeElement !== input || !interaction.active) input.value = toSlider(def, v);
      out.textContent = fmt(v);
      const pct = (Number(input.value) / Number(input.max)) * 100;
      input.style.setProperty('--fill', `${pct}%`);
    };
  } else if (def.type === 'segmented' || def.type === 'lens') {
    root = el('div', 'ctl ctl-seg');
    root.append(el('div', 'ctl-head', `<span class="ctl-label">${def.label}</span>`));
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', def.label);
    const options =
      def.type === 'lens'
        ? Object.values(LENSES)
            .filter((l) => !l.hidden)
            .map((l) => l.id)
        : def.options;
    const buttons = options.map((o) => {
      const b = el('button', 'seg-btn', def.type === 'lens' ? LENSES[o].short : def.labels?.[o] ?? o);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => store.set({ [key]: o }));
      seg.append(b);
      return [o, b];
    });
    root.append(seg);
    refresh = () => {
      for (const [o, b] of buttons) {
        const on = store.get(key) === o;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      }
    };
  } else if (def.type === 'toggle') {
    root = el('label', 'ctl ctl-toggle');
    const input = el('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    root.append(el('span', 'ctl-label', def.label), input, el('span', 'switch'));
    input.addEventListener('change', () => store.set({ [key]: input.checked }));
    refresh = () => {
      input.checked = !!store.get(key);
    };
  } else throw new Error(`Unknown control type ${def.type}`);

  refresh();
  const unsub = store.subscribe([key], refresh);
  if (!def.dynamic || opts.override) return { el: root, dispose: unsub };
  const base = { min: def.min, max: def.max };
  const applyDynamic = () => {
    const d = def.dynamic(store.values);
    root.hidden = !!d.hidden;
    def.min = d.min ?? base.min;
    def.max = d.max ?? base.max;
    refresh();
  };
  applyDynamic();
  const unsubAll = store.subscribe(null, applyDynamic);
  return {
    el: root,
    dispose: () => {
      unsub();
      unsubAll();
    },
  };
}
