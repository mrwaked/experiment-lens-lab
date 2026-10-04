import { createControl } from './controls.js';

const $ = (id) => document.getElementById(id);

export function createPanel({ store, onExample, onPrev, onNext, onDot }) {
  const card = $('card');
  const scroll = card.querySelector('.card-scroll');
  const num = $('card-num');
  const stepLabel = $('card-step');
  const title = $('card-title');
  const body = $('card-body');
  const readout = $('card-readout');
  const figure = $('card-figure');
  const tryEl = $('card-try');
  const controlsEl = tryEl.querySelector('.controls');
  const exEl = $('card-examples');
  const chipsEl = exEl.querySelector('.chips');
  const deep = $('card-deep');
  const deepBody = deep.querySelector('.prose');
  const dots = $('step-dots');
  const prev = $('prev');
  const next = $('next');
  let disposers = [];

  prev.addEventListener('click', () => onPrev());
  next.addEventListener('click', () => onNext());

  function renderChapter(ch, index) {
    num.textContent = String(index + 1).padStart(2, '0');
    title.innerHTML = ch.title;
    deep.hidden = !ch.deepDive;
    deep.open = false;
    deepBody.innerHTML = ch.deepDive ?? '';
    card.classList.remove('enter');
    void card.offsetWidth;
    card.classList.add('enter');
  }

  function renderStep(ch, si, { isFirst, isLast }) {
    const step = ch.steps[si];
    stepLabel.textContent = ch.steps.length > 1 ? `Step ${si + 1} / ${ch.steps.length}` : ch.kicker ?? '';
    body.innerHTML = step.html;
    body.classList.remove('fade-in');
    void body.offsetWidth;
    body.classList.add('fade-in');

    for (const d of disposers) d();
    disposers = [];
    controlsEl.replaceChildren();
    const keys = step.controls ?? ch.controls ?? [];
    for (const key of keys) {
      const c = createControl(key, store, { override: step.controlOverrides?.[key] ?? ch.controlOverrides?.[key] });
      controlsEl.append(c.el);
      disposers.push(c.dispose);
    }
    tryEl.hidden = keys.length === 0;

    chipsEl.replaceChildren();
    const examples = step.examples ?? ch.examples ?? [];
    for (const ex of examples) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.innerHTML = `<span class="chip-title">${ex.label}</span>${ex.sub ? `<span class="chip-sub">${ex.sub}</span>` : ''}`;
      b.addEventListener('click', () => {
        for (const c of chipsEl.children) c.classList.remove('on');
        b.classList.add('on');
        onExample(ex, b);
      });
      chipsEl.append(b);
    }
    exEl.hidden = examples.length === 0;

    dots.replaceChildren();
    ch.steps.forEach((_, i) => {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = `dot${i === si ? ' on' : ''}${i < si ? ' done' : ''}`;
      d.setAttribute('aria-label', `Step ${i + 1}`);
      d.addEventListener('click', () => onDot(i));
      dots.append(d);
    });
    prev.disabled = isFirst;
    next.innerHTML = isLast ? 'Start over <span>↺</span>' : si === ch.steps.length - 1 ? 'Next chapter <span>→</span>' : 'Next <span>→</span>';
    setReadout('');
    figure.replaceChildren();
    figure.hidden = true;
    scroll.scrollTop = 0;
  }

  let lastReadout = '';
  function setReadout(html) {
    if (html === lastReadout) return;
    lastReadout = html;
    readout.innerHTML = html;
    readout.hidden = !html;
  }

  // Returns an empty host element for a chart (cleared on every step change).
  function figureHost() {
    figure.replaceChildren();
    figure.hidden = false;
    const host = document.createElement('div');
    figure.append(host);
    return host;
  }

  return { renderChapter, renderStep, setReadout, figureHost };
}

export function createRail(chapters, onGo) {
  const list = $('chapter-list');
  const items = chapters.map((ch, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="rail-num">${String(i + 1).padStart(2, '0')}</span><span class="rail-title">${ch.short}</span>`;
    b.addEventListener('click', () => onGo(i));
    li.append(b);
    list.append(li);
    return li;
  });
  return {
    setActive(i) {
      items.forEach((li, k) => {
        li.classList.toggle('on', k === i);
        li.classList.toggle('done', k < i);
      });
      const bar = document.getElementById('rail-progress');
      if (bar) bar.style.setProperty('--p', `${((i + 1) / chapters.length) * 100}%`);
    },
  };
}
