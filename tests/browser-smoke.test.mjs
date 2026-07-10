import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  values() { return new Set(String(this.owner.className || "").split(/\s+/).filter(Boolean)); }
  write(values) { this.owner.className = [...values].join(" "); }
  add(...names) { const values = this.values(); names.forEach((name) => values.add(name)); this.write(values); }
  remove(...names) { const values = this.values(); names.forEach((name) => values.delete(name)); this.write(values); }
  contains(name) { return this.values().has(name); }
  toggle(name, force) {
    const values = this.values();
    const next = force === undefined ? !values.has(name) : Boolean(force);
    next ? values.add(name) : values.delete(name);
    this.write(values);
    return next;
  }
}

class FakeElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.className = "";
    this.classList = new FakeClassList(this);
    this.value = "";
    this.textContent = "";
    this.checked = false;
    this.disabled = false;
    this.files = [];
    this.attributes = {};
  }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) { if (child) { child.parentNode = this; this.children.push(child); } return child; }
  append(...children) { children.forEach((child) => this.appendChild(typeof child === "string" ? new FakeElement("#text") : child)); }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); return child; }
  remove() { this.parentNode?.removeChild(this); }
  addEventListener() {}
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getBoundingClientRect() { return { width: this.tagName === "CANVAS" ? 600 : 200, height: this.tagName === "CANVAS" ? 260 : 40 }; }
  getContext() {
    return {
      setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {}, arc() {}, fill() {},
      scale() {}, drawImage() {}, fillRect() {},
      strokeStyle: "", fillStyle: "", lineWidth: 1, font: "",
    };
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const descendants = [];
    const walk = (node) => { for (const child of node.children) { descendants.push(child); walk(child); } };
    walk(this);
    const parts = selector.split(",").map((part) => part.trim());
    return descendants.filter((node) => parts.some((part) => {
      if (part.startsWith(".")) return node.classList.contains(part.slice(1));
      return node.tagName.toLowerCase() === part.toLowerCase();
    }));
  }
}

function installDOM() {
  const elements = new Map();
  const special = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id.toLowerCase().includes("chart") ? "canvas" : "div", id));
    return elements.get(id);
  };
  for (const id of ["weightChart", "scoreChart", "recoveryChart", "measureChart", "disciplineChart", "macroChart"]) {
    elements.set(id, new FakeElement("canvas", id));
  }
  for (const key of ["#trackingTable tbody", "#gymTable tbody", "#measureTable tbody", "meta[name=\"theme-color\"]"]) {
    special.set(key, new FakeElement(key.startsWith("meta") ? "meta" : "tbody"));
  }
  const documentElement = new FakeElement("html");
  const body = new FakeElement("body");
  globalThis.document = {
    documentElement,
    body,
    getElementById: get,
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => { const node = new FakeElement("#text"); node.textContent = String(text); return node; },
    querySelector: (selector) => special.get(selector) || null,
    querySelectorAll: () => [],
  };

  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  globalThis.window = {
    crypto: webcrypto,
    alert() {},
    confirm: () => true,
    addEventListener() {},
    devicePixelRatio: 1,
  };
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
  globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.URL.createObjectURL = () => "blob:smoke";
  globalThis.URL.revokeObjectURL = () => {};
  return { get, special };
}

test("app module initializes without a runtime exception in a minimal browser environment", async () => {
  const dom = installDOM();
  await import(`../assets/js/app.js?smoke=${Date.now()}`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(dom.special.get("#trackingTable tbody").children.length, 30);
  assert.match(dom.get("goalSummary").textContent, /80 kg/);
});
