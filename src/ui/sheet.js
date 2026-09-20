/**
 * Bottom sheets: DOM overlaid on the canvas, not canvas-drawn, so their text
 * is real, selectable, accessibility-scaling DOM text.
 *
 * `createSheetStack` is the pure half — a plain stack of "what's open" with
 * no DOM reference at all, so the ordering rule (dismissing one sheet
 * returns to the one underneath, not to nothing) is testable head-on.
 *
 * `mountSheetHost` is the DOM half: one backdrop + panel, driven by a
 * `createSheetStack`, showing only the top sheet (the ones underneath stay
 * in the stack but are not rendered — the player never sees more than one
 * sheet's content at a time). It slides up on open, and dismisses either by
 * dragging the panel down past a threshold or by tapping the backdrop
 * outside it.
 */
import { PALETTE } from '../render/palette.js';

/** Pure sheet stack: no DOM, fully unit-testable. */
export function createSheetStack() {
  const items = [];
  const listeners = new Set();

  function notify() {
    const snapshot = items.slice();
    for (const fn of listeners) fn(snapshot);
  }

  return {
    get stack() {
      return items.slice();
    },
    get top() {
      return items.length ? items[items.length - 1] : null;
    },
    get size() {
      return items.length;
    },
    open(item) {
      items.push(item);
      notify();
      return item;
    },
    dismiss() {
      if (!items.length) return null;
      const removed = items.pop();
      notify();
      return removed;
    },
    dismissAll() {
      if (!items.length) return;
      items.length = 0;
      notify();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .sheet-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease-out;
      z-index: 30;
    }
    .sheet-backdrop--open {
      opacity: 1;
      pointer-events: auto;
    }
    .sheet-panel {
      width: 100%;
      max-width: 480px;
      max-height: 82vh;
      background: ${PALETTE.UI_DARK};
      border-top: 2px solid ${PALETTE.UI_LIGHT};
      border-radius: 14px 14px 0 0;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      transform: translateY(100%);
      transition: transform 200ms ease-out;
      touch-action: none;
    }
    .sheet-backdrop--open .sheet-panel {
      transform: translateY(0);
    }
    .sheet-panel--dragging {
      transition: none;
    }
    .sheet-handle-row {
      display: flex;
      justify-content: center;
      padding: 10px 0 2px;
      flex: none;
    }
    .sheet-handle {
      width: 40px;
      height: 5px;
      border-radius: 3px;
      background: ${PALETTE.UI_LIGHT};
    }
    .sheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 12px 8px 18px;
      flex: none;
    }
    .sheet-title {
      color: ${PALETTE.WHITE};
      font-family: monospace;
      font-size: 17px;
      margin: 0;
    }
    .sheet-close {
      min-width: 44px;
      min-height: 44px;
      background: transparent;
      border: none;
      color: ${PALETTE.WHITE};
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
    }
    .sheet-body {
      overflow-y: auto;
      padding: 0 18px 28px;
      color: ${PALETTE.WHITE};
      font-family: monospace;
      font-size: 14px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Mounts a single backdrop + panel into `root`, driven by an internal
 * sheet stack. `open({ id, title, render, dismissible })` pushes a sheet;
 * `render(bodyEl, { close })` is called to fill its body with real DOM.
 */
export function mountSheetHost(root) {
  injectStyles();
  const stack = createSheetStack();

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';

  const panel = document.createElement('div');
  panel.className = 'sheet-panel';

  const handleRow = document.createElement('div');
  handleRow.className = 'sheet-handle-row';
  const handle = document.createElement('div');
  handle.className = 'sheet-handle';
  handleRow.appendChild(handle);

  const header = document.createElement('div');
  header.className = 'sheet-header';
  const titleEl = document.createElement('h2');
  titleEl.className = 'sheet-title';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sheet-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  header.append(titleEl, closeBtn);

  const body = document.createElement('div');
  body.className = 'sheet-body';

  panel.append(handleRow, header, body);
  backdrop.appendChild(panel);
  root.appendChild(backdrop);

  function dismiss() {
    stack.dismiss();
    renderTop();
  }

  closeBtn.addEventListener('click', () => dismiss());
  backdrop.addEventListener('click', (evt) => {
    if (evt.target === backdrop) dismiss();
  });

  // Drag-to-dismiss: grabbing the handle or header and pulling down past a
  // threshold of the panel's own height dismisses it; releasing short of
  // that threshold springs it back.
  let dragStartY = null;
  let dragDelta = 0;

  function onPointerDown(evt) {
    dragStartY = evt.clientY;
    dragDelta = 0;
    panel.classList.add('sheet-panel--dragging');
    panel.setPointerCapture?.(evt.pointerId);
  }
  function onPointerMove(evt) {
    if (dragStartY === null) return;
    dragDelta = Math.max(0, evt.clientY - dragStartY);
    panel.style.transform = `translateY(${dragDelta}px)`;
  }
  function onPointerUp() {
    if (dragStartY === null) return;
    panel.classList.remove('sheet-panel--dragging');
    panel.style.transform = '';
    const threshold = Math.max(64, panel.getBoundingClientRect().height * 0.28);
    const shouldDismiss = dragDelta > threshold;
    dragStartY = null;
    dragDelta = 0;
    if (shouldDismiss) dismiss();
  }

  handleRow.addEventListener('pointerdown', onPointerDown);
  header.addEventListener('pointerdown', onPointerDown);
  panel.addEventListener('pointermove', onPointerMove);
  panel.addEventListener('pointerup', onPointerUp);
  panel.addEventListener('pointercancel', onPointerUp);

  function renderTop() {
    const top = stack.top;
    if (!top) {
      backdrop.classList.remove('sheet-backdrop--open');
      body.replaceChildren();
      return;
    }
    titleEl.textContent = top.title ?? '';
    closeBtn.style.visibility = top.dismissible === false ? 'hidden' : '';
    body.replaceChildren();
    top.render?.(body, { close: dismiss });
    backdrop.classList.add('sheet-backdrop--open');
  }

  function open(def) {
    stack.open(def);
    renderTop();
    return def;
  }

  function dismissAll() {
    stack.dismissAll();
    renderTop();
  }

  return { stack, open, dismiss, dismissAll, elements: { backdrop, panel, body, titleEl } };
}
