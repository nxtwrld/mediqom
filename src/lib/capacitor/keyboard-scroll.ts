import { keyboardHeight } from './keyboard-store';

/**
 * Svelte action for scrollable containers that hold form inputs.
 *
 * Attach to any scrollable element that contains inputs or textareas.
 * When the keyboard appears it:
 *   1. Adds padding-bottom equal to the keyboard height so bottom inputs
 *      remain reachable.
 *   2. Scrolls the currently focused input into the center of the visible
 *      area.
 *
 * Usage:
 *   <div class="form-scroll" use:keyboardScroll>
 *     <input ... />
 *     <textarea ... />
 *   </div>
 */
export function keyboardScroll(node: HTMLElement) {
  let currentHeight = 0;

  function scrollFocusedIntoView() {
    const focused = document.activeElement as HTMLElement | null;
    if (focused && node.contains(focused)) {
      setTimeout(() => {
        focused.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }

  function onFocusIn() {
    if (currentHeight > 0) scrollFocusedIntoView();
  }

  const unsubscribe = keyboardHeight.subscribe((height) => {
    currentHeight = height;
    if (height > 0) {
      node.style.paddingBottom = `${height}px`;
      scrollFocusedIntoView();
    } else {
      node.style.paddingBottom = '';
    }
  });

  node.addEventListener('focusin', onFocusIn);

  return {
    destroy() {
      unsubscribe();
      node.removeEventListener('focusin', onFocusIn);
      node.style.paddingBottom = '';
    },
  };
}
