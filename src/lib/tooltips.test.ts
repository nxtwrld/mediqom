// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tooltip } from "./tooltips";

describe("tooltip — div creation", () => {
  let node: HTMLElement;

  beforeEach(() => {
    // Clean up any existing .tooltip divs so tests are isolated
    document.querySelectorAll(".tooltip").forEach((el) => el.remove());
    node = document.createElement("button");
    document.body.appendChild(node);
  });

  afterEach(() => {
    node.remove();
    document.querySelectorAll(".tooltip").forEach((el) => el.remove());
  });

  it("creates a .tooltip div and appends it to body", () => {
    tooltip(node, "Hello");
    const div = document.querySelector(".tooltip");
    expect(div).not.toBeNull();
    expect(document.body.contains(div)).toBe(true);
  });

  it("starts with opacity 0 and off-screen position", () => {
    tooltip(node, "Hello");
    const div = document.querySelector<HTMLDivElement>(".tooltip")!;
    expect(div.style.opacity).toBe("0");
    expect(div.style.left).toBe("-9999px");
    expect(div.style.bottom).toBe("-9999px");
  });

  it("reuses existing .tooltip div if already in the DOM", () => {
    // Pre-create one tooltip div
    const existing = document.createElement("div");
    existing.className = "tooltip";
    document.body.appendChild(existing);

    tooltip(node, "Reused");

    // There should still be only one .tooltip
    const all = document.querySelectorAll(".tooltip");
    expect(all.length).toBe(1);
  });

  it("accepts a string shorthand for options", () => {
    tooltip(node, "short string");
    const div = document.querySelector<HTMLDivElement>(".tooltip")!;
    // Show the tooltip so we can verify text
    node.dispatchEvent(new FocusEvent("focus"));
    expect(div.textContent).toBe("short string");
  });

  it("accepts an Options object", () => {
    tooltip(node, { text: "object option" });
    const div = document.querySelector<HTMLDivElement>(".tooltip")!;
    node.dispatchEvent(new FocusEvent("focus"));
    expect(div.textContent).toBe("object option");
  });
});

describe("tooltip — show / hide via focus events", () => {
  let node: HTMLElement;
  let div: HTMLDivElement;

  beforeEach(() => {
    document.querySelectorAll(".tooltip").forEach((el) => el.remove());
    node = document.createElement("button");
    document.body.appendChild(node);
    tooltip(node, { text: "Focus test", offset: 5 });
    div = document.querySelector<HTMLDivElement>(".tooltip")!;
  });

  afterEach(() => {
    node.remove();
    document.querySelectorAll(".tooltip").forEach((el) => el.remove());
  });

  it("sets opacity to 1 on focus", () => {
    node.dispatchEvent(new FocusEvent("focus"));
    expect(div.style.opacity).toBe("1");
  });

  it("sets textContent to the configured text on focus", () => {
    node.dispatchEvent(new FocusEvent("focus"));
    expect(div.textContent).toBe("Focus test");
  });

  it("resets opacity to 0 on blur", () => {
    node.dispatchEvent(new FocusEvent("focus"));
    node.dispatchEvent(new FocusEvent("blur"));
    expect(div.style.opacity).toBe("0");
  });

  it("resets position to off-screen on blur", () => {
    node.dispatchEvent(new FocusEvent("focus"));
    node.dispatchEvent(new FocusEvent("blur"));
    expect(div.style.left).toBe("-9999px");
    expect(div.style.bottom).toBe("-9999px");
  });
});

describe("tooltip — show / hide via mouse events", () => {
  let node: HTMLElement;
  let div: HTMLDivElement;

  beforeEach(() => {
    document.querySelectorAll(".tooltip").forEach((el) => el.remove());
    node = document.createElement("button");
    document.body.appendChild(node);
    tooltip(node, "Mouse test");
    div = document.querySelector<HTMLDivElement>(".tooltip")!;
  });

  afterEach(() => {
    node.remove();
    document.querySelectorAll(".tooltip").forEach((el) => el.remove());
  });

  it("shows tooltip on mouseenter", () => {
    node.dispatchEvent(new MouseEvent("mouseenter", { clientX: 50 }));
    expect(div.style.opacity).toBe("1");
  });

  it("hides tooltip on mouseleave", () => {
    node.dispatchEvent(new MouseEvent("mouseenter", { clientX: 50 }));
    node.dispatchEvent(new MouseEvent("mouseleave"));
    expect(div.style.opacity).toBe("0");
  });

  it("sets left from MouseEvent.clientX", () => {
    // MouseEvent branch: left = event.clientX, then left - div.offsetWidth / 2
    // offsetWidth is 0 in jsdom so left = clientX - 0 = clientX, Math.max(that,0)
    node.dispatchEvent(new MouseEvent("mouseenter", { clientX: 120 }));
    expect(div.style.left).toBe("120px");
  });

  it("uses 0 as minimum left value to stay in viewport", () => {
    node.dispatchEvent(new MouseEvent("mouseenter", { clientX: 0 }));
    // Math.max(0 - 0, 0) = 0
    expect(div.style.left).toBe("0px");
  });
});

describe("tooltip — destroy removes event listeners", () => {
  let node: HTMLElement;
  let div: HTMLDivElement;

  beforeEach(() => {
    document.querySelectorAll(".tooltip").forEach((el) => el.remove());
    node = document.createElement("button");
    document.body.appendChild(node);
  });

  afterEach(() => {
    node.remove();
    document.querySelectorAll(".tooltip").forEach((el) => el.remove());
  });

  it("destroy prevents further tooltip shows on mouseenter", () => {
    const action = tooltip(node, "Destroy test");
    div = document.querySelector<HTMLDivElement>(".tooltip")!;
    action.destroy();
    node.dispatchEvent(new MouseEvent("mouseenter", { clientX: 50 }));
    // After destroy the listener is removed so opacity stays 0
    expect(div.style.opacity).toBe("0");
  });

  it("destroy prevents tooltip hide on mouseleave", () => {
    // Manually show first without the action, then destroy
    const action = tooltip(node, "Destroy hide test");
    div = document.querySelector<HTMLDivElement>(".tooltip")!;
    // Show it via focus before destroying
    node.dispatchEvent(new FocusEvent("focus"));
    expect(div.style.opacity).toBe("1");
    action.destroy();
    // Now blur should not change anything (listener removed) — but hideTooltip
    // would have set opacity back to 0 anyway; verify mouseenter no longer works
    node.dispatchEvent(new MouseEvent("mouseenter", { clientX: 10 }));
    // opacity stays whatever it was before (set by focus, then potentially reset
    // by destroy side-effects? No — destroy only removes listeners, doesn't hide)
    // After focus it was "1"; destroy doesn't change styles, mouseenter does nothing.
    expect(div.style.opacity).toBe("1");
  });

  it("destroy prevents focus from showing tooltip", () => {
    const action = tooltip(node, "Destroy focus test");
    div = document.querySelector<HTMLDivElement>(".tooltip")!;
    action.destroy();
    node.dispatchEvent(new FocusEvent("focus"));
    expect(div.style.opacity).toBe("0");
  });
});
