/**
 * Custom MDsveX configuration with Mermaid support
 */

export function createMermaidHighlighter() {
  /**
   * @param {string} code
   * @param {string} lang
   * @param {string} meta
   * @returns {string}
   */
  return (code, lang, meta) => {
    if (lang === "mermaid") {
      // Return a special div that will be processed by our Svelte component
      const encodedCode = encodeURIComponent(code.trim());
      return `<div class="mermaid-placeholder" data-code="${encodedCode}">${code}</div>`;
    }

    // For other languages, return standard highlighting
    return `<pre><code class="language-${lang || ""}">${escapeHtml(code)}</code></pre>`;
  };
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (/** @type {string} */ m) => map[m]);
}
