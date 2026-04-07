/** @type {import('svelte/action').Action}  */

type Options = {
  text: string;
  delay?: number;
  offset?: number;
};

const defaultOptions: Options = {
  text: "",
  delay: 0,
  offset: 10,
};

export function tooltip(node: HTMLElement, options: string | Options) {
  // the node has been mounted in the DOM

  if (typeof options === "string") {
    options = { text: options };
  }
  const opts: Options = { ...defaultOptions, ...options };

  let found: HTMLDivElement | null = document.querySelector(".tooltip");

  let div: HTMLDivElement =
    found != null ? found : document.createElement("div");
  div.className = "tooltip";
  div.style.opacity = "0";
  div.style.left = "-9999px";
  div.style.bottom = "-9999px";
  document.body.appendChild(div);

  function showTooltip(event: MouseEvent | FocusEvent | TouchEvent) {
    // get pointer position
    let { left, bottom, width, height } = node.getBoundingClientRect();

    if (event instanceof MouseEvent) {
      left = event.clientX;
    } else if (event instanceof TouchEvent) {
      left = event.touches[0].clientX;
    }
    div.textContent = opts.text;

    // place left to the middle of the element
    left = left - div.offsetWidth / 2;

    // if the tooltip is too wide to fit in the viewport, move it to the left
    //left = (document.documentElement.clientWidth - width < left) ? document.documentElement.clientWidth - width : left;

    div.style.left = Math.max(left, 0) + "px";
    div.style.bottom =
      document.documentElement.clientHeight -
      bottom +
      height +
      (opts.offset || 10) +
      "px";

    div.style.opacity = "1";
  }

  function hideTooltip() {
    div.style.opacity = "0";
    div.style.left = "-9999px";
    div.style.bottom = "-9999px";
  }

  node.addEventListener("mouseenter", showTooltip, { passive: true });
  node.addEventListener("mouseleave", hideTooltip, { passive: true });

  node.addEventListener("focus", showTooltip, { passive: true });
  node.addEventListener("blur", hideTooltip, { passive: true });
  // touch devices
  node.addEventListener("touchstart", showTooltip, { passive: true });
  node.addEventListener("touchend", hideTooltip, { passive: true });

  return {
    destroy() {
      //observer.disconnect();
      node.removeEventListener("mouseenter", showTooltip);
      node.removeEventListener("mouseleave", hideTooltip);
      node.removeEventListener("focus", showTooltip);
      node.removeEventListener("blur", hideTooltip);
      node.removeEventListener("touchstart", showTooltip);
      node.removeEventListener("touchend", hideTooltip);
    },
  };
}
