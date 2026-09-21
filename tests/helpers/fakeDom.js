/**
 * A minimal fake DOM, just enough of `document.createElement` for the UI
 * modules to run headless. They never read layout, style computation or
 * CSS matching — only element creation, property/attribute assignment,
 * text content, append/replaceChildren, and click/input events — so this
 * stub covers them without pulling in a real DOM dependency.
 *
 * Importing this module installs `globalThis.document`, which has to
 * happen before any UI module is imported. Test files therefore import
 * this first and then `await import(...)` the module under test.
 */
class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.style = {};
    this._listeners = {};
    this._text = '';
  }
  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  append(...items) {
    for (const item of items) {
      this.appendChild(typeof item === 'string' ? fakeDocument.createTextNode(item) : item);
    }
  }
  replaceChildren(...items) {
    this.children = [];
    this.append(...items);
  }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i !== -1) this.parentNode.children.splice(i, 1);
  }
  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  }
  dispatch(type, evt = {}) {
    for (const fn of this._listeners[type] ?? []) fn(evt);
  }
  click() {
    this.dispatch('click', {});
  }
  fireInput() {
    this.dispatch('input', {});
  }
  get textContent() {
    if (this.tagName === '#text') return this._text;
    if (this.children.length === 0) return this._text;
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this.children = [];
    this._text = v;
  }
  // Buttons/inputs found by walking the tree, since these tests don't have
  // a real querySelector.
  findAll(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const c of this.children) c.findAll(pred, out);
    return out;
  }
}

const fakeDocument = {
  createElement: (tag) => new FakeNode(tag),
  createTextNode: (text) => {
    const n = new FakeNode('#text');
    n._text = text;
    return n;
  },
  head: new FakeNode('head'),
};

globalThis.document = fakeDocument;

export { FakeNode, fakeDocument };

/** A stand-in for the sheet host every sheet is opened against: renders
 * the sheet body into a detached tree the test can walk. */
export function fakeSheetHost() {
  let body = null;
  return {
    open(def) {
      body = new FakeNode('div');
      def.render(body);
    },
    dismiss() {},
    get body() {
      return body;
    },
  };
}

/** Every button in a rendered tree, in document order. */
export function buttons(root) {
  return root.findAll((n) => n.tagName === 'button');
}

/** The full visible text of a rendered tree. */
export function textOf(root) {
  return root.textContent;
}
