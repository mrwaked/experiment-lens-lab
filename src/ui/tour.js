import { createScope } from '../core/tween.js';
import { createPanel, createRail } from './panel.js';

const sameSets = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export function createTour({ chapters, ctx }) {
  let ci = -1;
  let entered = -1; // chapter whose enter() is live; -1 while a chapter change is mid-fade
  let si = 0;
  let token = 0;
  let chapterScope = null;
  let stepScope = null;
  const fadeEls = [document.getElementById('gl'), document.getElementById('labels'), document.getElementById('viewfinder')];

  const panel = createPanel({
    store: ctx.store,
    onExample: (ex) => runExample(ex),
    onPrev: () => prev(),
    onNext: () => next(),
    onDot: (i) => go(ci, i),
  });
  const rail = createRail(chapters, (i) => go(i, 0));
  ctx.panel = panel;

  function runExample(ex) {
    if (ex.params) ctx.store.set(ex.params, { animate: ex.animate ?? 1.2 });
    if (ex.view) ctx.flyTo(ex.view);
    ex.run?.(ctx);
  }

  function fade(out) {
    for (const el of fadeEls) el?.classList.toggle('dim', out);
    return new Promise((r) => setTimeout(r, out ? 260 : 0));
  }

  async function go(nci, nsi = 0, { replace = true } = {}) {
    nci = Math.max(0, Math.min(chapters.length - 1, nci));
    const ch = chapters[nci];
    nsi = Math.max(0, Math.min(ch.steps.length - 1, nsi));
    const my = ++token;
    if (nci !== entered) {
      const prevCh = chapters[entered];
      const setsChanged = !prevCh || !sameSets(prevCh.sets, ch.sets);
      stepScope?.dispose();
      stepScope = null;
      chapterScope?.dispose();
      chapterScope = null;
      ctx.hotspots.clear();
      prevCh?.exit?.(ctx);
      entered = -1;
      if (prevCh && setsChanged) {
        await fade(true);
        if (my !== token) return;
      }
      ci = entered = nci;
      ctx.chapter = ch;
      chapterScope = createScope(ctx.tweens);
      ctx.scope = chapterScope;
      ctx.stage.applySets(ch.sets);
      ctx.preview.setVisible(!!ch.preview);
      if (ch.params) ctx.store.set(ch.params);
      ch.enter?.(ctx);
      panel.renderChapter(ch, ci);
      rail.setActive(ci);
      if (ch.view && !ch.steps[nsi].view) ctx.flyTo(ch.view);
    }
    si = nsi;
    ctx.stepIndex = si;
    ctx.hotspots.clear();
    stepScope?.dispose();
    stepScope = createScope(ctx.tweens);
    ctx.stepScope = stepScope;
    const step = ch.steps[si];
    panel.renderStep(ch, si, { isFirst: ci === 0 && si === 0, isLast: ci === chapters.length - 1 && si === ch.steps.length - 1 });
    if (step.params) ctx.store.set(step.params, { animate: step.animate ?? 1.0 });
    step.apply?.(ctx, stepScope);
    if (step.view) ctx.flyTo(step.view);
    fade(false);
    const hash = `#${ch.id}${si ? `/${si + 1}` : ''}`;
    if (location.hash !== hash) {
      if (replace) history.replaceState(null, '', hash);
      else history.pushState(null, '', hash);
    }
  }

  function next() {
    const ch = chapters[ci];
    if (si < ch.steps.length - 1) go(ci, si + 1);
    else if (ci < chapters.length - 1) go(ci + 1, 0);
    else go(0, 0);
  }

  function prev() {
    if (si > 0) go(ci, si - 1);
    else if (ci > 0) go(ci - 1, chapters[ci - 1].steps.length - 1);
  }

  function fromHash() {
    const m = /^#([\w-]+)(?:\/(\d+))?$/.exec(location.hash);
    if (!m) return false;
    const i = chapters.findIndex((c) => c.id === m[1]);
    if (i < 0) return false;
    const s = m[2] ? Number(m[2]) - 1 : 0;
    if (i !== ci || s !== si) go(i, s);
    return true;
  }

  window.addEventListener('hashchange', fromHash);
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      prev();
    }
  });

  return {
    start() {
      if (!fromHash()) go(0, 0);
    },
    go: (i, s = 0) => go(i, s),
    goId(id) {
      const i = chapters.findIndex((c) => c.id === id);
      if (i >= 0) go(i, 0, { replace: false });
    },
    next,
    prev,
    update(dt) {
      chapters[entered]?.update?.(ctx, dt);
    },
    get index() {
      return ci;
    },
  };
}
