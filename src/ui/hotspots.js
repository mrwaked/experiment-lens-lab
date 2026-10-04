import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export function makeLabel(html, className = 'label3d') {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = html;
  const obj = new CSS2DObject(el);
  obj.center.set(0, 0.5);
  return obj;
}

// Pulsing, clickable markers anchored to 3D objects, with a shared popover.
export function createHotspots({ popover, onNavigate }) {
  const active = new Set();
  let openFor = null;

  function hidePopover() {
    popover.hidden = true;
    popover.classList.remove('show');
    openFor?.classList.remove('open');
    openFor = null;
  }

  function showPopover(button, { title, text, chapter, chapterLabel }) {
    if (openFor === button) return hidePopover();
    hidePopover();
    openFor = button;
    button.classList.add('open');
    popover.innerHTML = `<h4>${title}</h4><div class="pop-body">${text}</div>${
      chapter ? `<button class="pop-link" type="button" data-go="${chapter}">${chapterLabel ?? 'Explore this'} →</button>` : ''
    }`;
    popover.hidden = false;
    const r = button.getBoundingClientRect();
    const pw = Math.min(300, window.innerWidth - 24);
    let x = r.right + 14;
    if (x + pw > window.innerWidth - 420) x = Math.max(12, r.left - pw - 14);
    const y = Math.min(Math.max(12, r.top - 20), window.innerHeight - 220);
    popover.style.left = `${x}px`;
    popover.style.top = `${y}px`;
    requestAnimationFrame(() => popover.classList.add('show'));
    popover.querySelector('[data-go]')?.addEventListener('click', () => {
      hidePopover();
      onNavigate?.(chapter);
    });
  }

  window.addEventListener('pointerdown', (e) => {
    if (openFor && !popover.contains(e.target) && !openFor.contains(e.target)) hidePopover();
  });

  function add(parent, position, info) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `hotspot ${info.side === 'left' ? 'left' : ''}`;
    button.setAttribute('aria-label', info.title);
    button.innerHTML = `<span class="hs-dot"><span>${info.number ?? ''}</span></span><span class="hs-label">${info.title}</span>`;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      showPopover(button, info);
    });
    button.addEventListener('pointerdown', (e) => e.stopPropagation());
    const obj = new CSS2DObject(button);
    obj.position.copy(position);
    obj.center.set(0.5, 0.5);
    if (info.layer != null) obj.layers.set(info.layer);
    parent.add(obj);
    active.add(obj);
    button.style.animationDelay = `${active.size * 0.08}s`;
    return obj;
  }

  function clear() {
    hidePopover();
    for (const o of active) {
      o.parent?.remove(o);
      o.element.remove();
    }
    active.clear();
  }

  return { add, clear, hidePopover };
}
