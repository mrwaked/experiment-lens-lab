export const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ease = {
  linear: (t) => t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t * t * t,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  outExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
};

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class Tweens {
  constructor() {
    this.items = new Set();
  }

  add({ duration = 1, delay = 0, ease: easing = ease.inOutCubic, update, complete }) {
    const scale = reducedMotion ? 0.25 : 1;
    const item = { t: -delay * scale, duration: Math.max(1e-3, duration * scale), easing, update, complete };
    item.promise = new Promise((resolve) => (item.resolve = resolve));
    this.items.add(item);
    const handle = {
      promise: item.promise,
      cancel: () => {
        if (this.items.delete(item)) item.resolve(false);
      },
    };
    return handle;
  }

  update(dt) {
    for (const it of [...this.items]) {
      it.t += dt;
      if (it.t < 0) continue;
      const k = Math.min(1, it.t / it.duration);
      it.update?.(it.easing(k), k);
      if (k >= 1 && this.items.delete(it)) {
        it.complete?.();
        it.resolve(true);
      }
    }
  }
}

export function disposeDeep(object) {
  object.traverse?.((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (!m.userData?.shared) m.dispose();
    }
    if (o.isCSS2DObject) o.element.remove();
  });
}

// Collects everything a chapter/step creates so it can be torn down in one call.
export function createScope(tweens) {
  const disposers = [];
  const handles = new Set();
  let alive = true;
  return {
    get alive() {
      return alive;
    },
    add(fn) {
      disposers.push(fn);
      return fn;
    },
    tween(opts) {
      const h = tweens.add(opts);
      handles.add(h);
      h.promise.then(() => handles.delete(h));
      return h;
    },
    animate(duration, update, opts = {}) {
      return this.tween({ duration, update, ...opts });
    },
    wait(seconds) {
      return this.tween({ duration: seconds, ease: ease.linear }).promise;
    },
    on(target, type, fn, options) {
      target.addEventListener(type, fn, options);
      disposers.push(() => target.removeEventListener(type, fn, options));
    },
    attach(parent, obj) {
      parent.add(obj);
      disposers.push(() => {
        parent.remove(obj);
        disposeDeep(obj);
      });
      return obj;
    },
    dispose() {
      alive = false;
      for (const h of handles) h.cancel();
      handles.clear();
      while (disposers.length) disposers.pop()();
    },
  };
}
