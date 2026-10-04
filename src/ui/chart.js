// Small SVG charts for the tutorial card. Palette validated for the dark card surface (#121317).
export const SERIES = { total: '#c98500', blue: '#3987e5', magenta: '#d55181' };
const STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
}

function frame(host, title, subtitle) {
  host.replaceChildren();
  host.classList.add('chart');
  const head = document.createElement('div');
  head.className = 'chart-head';
  head.innerHTML = `<span class="chart-title">${title}</span>${subtitle ? `<span class="chart-sub">${subtitle}</span>` : ''}`;
  host.append(head);
  const wrap = document.createElement('div');
  wrap.className = 'chart-plot';
  host.append(wrap);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  wrap.append(tip);
  return { wrap, tip };
}

// Line chart over f-number (log x); series: [{ key, label, color, fn(N) }].
export function fNumberLineChart(host, { title, subtitle, series, format = (v) => v.toFixed(1), yMax }) {
  const { wrap, tip } = frame(host, title, subtitle);
  const W = 320;
  const H = 168;
  const m = { l: 34, r: 60, t: 8, b: 26 };
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title }, wrap);
  const xs = (N) => m.l + ((Math.log2(N) - Math.log2(1.4)) / (Math.log2(22) - Math.log2(1.4))) * (W - m.l - m.r);
  const samples = [];
  for (let i = 0; i <= 80; i++) samples.push(1.4 * (22 / 1.4) ** (i / 80));
  const top = yMax ?? Math.max(...series.flatMap((s) => samples.map((N) => s.fn(N)))) * 1.08;
  const ys = (v) => H - m.b - (Math.min(v, top) / top) * (H - m.t - m.b);

  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const y = ys(top * t);
    svgEl('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: 'grid' }, svg);
    if (t > 0) svgEl('text', { x: m.l - 6, y: y + 3, class: 'tick', 'text-anchor': 'end' }, svg).textContent = format(top * t);
  }
  for (const N of STOPS) {
    svgEl('text', { x: xs(N), y: H - 8, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = N;
  }

  const lastLabels = [];
  for (const s of series) {
    const d = samples.map((N, i) => `${i ? 'L' : 'M'}${xs(N).toFixed(1)},${ys(s.fn(N)).toFixed(1)}`).join('');
    svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.key === 'total' ? 2.4 : 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': s.dash ?? '' }, svg);
    const yEnd = ys(s.fn(22));
    lastLabels.push({ y: yEnd, s });
  }
  lastLabels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < lastLabels.length; i++) lastLabels[i].y = Math.max(lastLabels[i].y, lastLabels[i - 1].y + 12);
  for (const { y, s } of lastLabels) {
    svgEl('circle', { cx: W - m.r + 6, cy: y - 3, r: 3, fill: s.color }, svg);
    svgEl('text', { x: W - m.r + 12, y, class: 'direct' }, svg).textContent = s.label;
  }

  const markerLine = svgEl('line', { y1: m.t, y2: H - m.b, class: 'marker-line' }, svg);
  const markerDot = svgEl('circle', { r: 4.5, class: 'marker-dot', fill: series[0].color }, svg);
  const markerText = svgEl('text', { class: 'marker-text', 'text-anchor': 'middle' }, svg);
  const cross = svgEl('line', { y1: m.t, y2: H - m.b, class: 'cross' }, svg);
  cross.style.display = 'none';

  const hit = svgEl('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
  hit.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const t = (x - m.l) / (W - m.l - m.r);
    const N = 1.4 * (22 / 1.4) ** Math.min(1, Math.max(0, t));
    cross.style.display = '';
    cross.setAttribute('x1', xs(N));
    cross.setAttribute('x2', xs(N));
    tip.hidden = false;
    tip.innerHTML = `<b>f/${N.toFixed(1)}</b>${series.map((s) => `<span><i style="background:${s.color}"></i>${s.label} ${format(s.fn(N))}</span>`).join('')}`;
    const px = ((xs(N) / W) * r.width);
    tip.style.left = `${Math.min(Math.max(px - 60, 0), r.width - 150)}px`;
  });
  hit.addEventListener('pointerleave', () => {
    cross.style.display = 'none';
    tip.hidden = true;
  });

  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  legend.innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('');
  host.append(legend);

  return {
    setMarker(N) {
      const x = xs(N);
      const y = ys(series[0].fn(N));
      markerLine.setAttribute('x1', x);
      markerLine.setAttribute('x2', x);
      markerDot.setAttribute('cx', x);
      markerDot.setAttribute('cy', y);
      markerText.setAttribute('x', Math.min(Math.max(x, m.l + 24), W - m.r - 24));
      markerText.setAttribute('y', Math.max(y - 10, m.t + 10));
      markerText.textContent = format(series[0].fn(N));
    },
  };
}

/** Single-series columns per full stop. value(N) → number; label(v) → text. */
export function stopColumnChart(host, { title, subtitle, value, label, color = '#3987e5' }) {
  const { wrap, tip } = frame(host, title, subtitle);
  const W = 320;
  const H = 150;
  const m = { l: 8, r: 8, t: 18, b: 24 };
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title }, wrap);
  const band = (W - m.l - m.r) / STOPS.length;
  const barW = Math.min(24, band * 0.62);
  const max = Math.max(...STOPS.map(value));
  svgEl('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'grid' }, svg);
  const bars = STOPS.map((N, i) => {
    const v = value(N);
    const h = Math.max(1.5, (v / max) * (H - m.t - m.b));
    const x = m.l + band * i + (band - barW) / 2;
    const y = H - m.b - h;
    const r = Math.min(4, h / 2, barW / 2);
    const d = `M${x},${H - m.b} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${H - m.b} Z`;
    const p = svgEl('path', { d, fill: color, class: 'col' }, svg);
    svgEl('text', { x: x + barW / 2, y: H - 8, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = N;
    const hitRect = svgEl('rect', { x: m.l + band * i, y: m.t - 12, width: band, height: H - m.t - m.b + 12, fill: 'transparent' }, svg);
    hitRect.addEventListener('pointerenter', () => {
      tip.hidden = false;
      tip.innerHTML = `<b>f/${N}</b><span>${label(v)}</span>`;
      const r = svg.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(((x + barW / 2) / W) * r.width - 50, 0), r.width - 120)}px`;
    });
    hitRect.addEventListener('pointerleave', () => (tip.hidden = true));
    return { N, p, x, y };
  });
  const capText = svgEl('text', { class: 'marker-text', 'text-anchor': 'middle' }, svg);
  return {
    setMarker(N) {
      let best = bars[0];
      for (const b of bars) if (Math.abs(Math.log(b.N / N)) < Math.abs(Math.log(best.N / N))) best = b;
      for (const b of bars) b.p.classList.toggle('dim', b !== best);
      capText.setAttribute('x', best.x + barW / 2);
      capText.setAttribute('y', best.y - 5);
      capText.textContent = label(value(best.N));
    },
  };
}
