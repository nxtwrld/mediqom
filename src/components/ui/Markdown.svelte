<script lang="ts">
    import { marked } from 'marked';
    import DOMPurify from 'dompurify';
    interface Props {
        text: any;
    }

    let { text }: Props = $props();

    // Configure marked for GFM tables and line breaks
    marked.use({ gfm: true, breaks: true });

    /** Add data-label attributes to <td> cells for responsive stacked layout */
    function addTableDataLabels(html: string): string {
        return html.replace(/<table>([\s\S]*?)<\/table>/g, (_match, inner) => {
            const headers: string[] = [];
            inner.replace(/<th[^>]*>([\s\S]*?)<\/th>/g, (_m: string, content: string) => {
                headers.push(content.replace(/<[^>]+>/g, '').trim());
            });
            if (headers.length === 0) return `<table>${inner}</table>`;

            let colIdx = 0;
            const labeled = inner.replace(/<td([^>]*)>/g, (_m: string, attrs: string) => {
                const label = headers[colIdx % headers.length] || '';
                colIdx++;
                return `<td${attrs} data-label="${label}">`;
            });
            return `<table>${labeled}</table>`;
        });
    }

</script>


    <div class="markdown">
        {@html DOMPurify.sanitize(addTableDataLabels(marked.parse(text || '') as string), { ADD_ATTR: ['data-label'] })}
    </div>


<style>

    .markdown {
        user-select: text;
        cursor: text;
        container-type: inline-size;
    }
    .markdown :global(p) {
        display: block;
        margin: .5em 0;
        line-height: 1.5em;
        padding: 0;
    }
    .markdown :global(h1) {
        font-size: 1.5em;
        margin: 1em 0;
    }
    .markdown :global(h2) {
        font-size: 1.25em;
        margin: 1em 0;
    }
    .markdown :global(h3) {
        font-size: 1.1em;
        margin: 1em 0;
    }
    .markdown :global(h4) {
        font-size: 1em;
        margin: 1em 0;
    }
    .markdown :global(h5) {
        font-size: .9em;
        margin: 1em 0;
    }
    .markdown :global(h6) {
        font-size: .8em;
        margin: 1em 0;
    }
    .markdown :global(b),
    .markdown :global(strong) {
        font-weight: bold;
    }
    .markdown :global(em) {
        font-style: italic;
    }
    .markdown :global(blockquote) {
        margin: 1em 0;
        padding: 1em;
        background-color: var(--color-surface);
        border-left: 4px solid var(--color-interactivity);
    }
    .markdown :global(pre) {
        margin: 1em 0;
        padding: 1em;
        background-color: var(--color-surface);
        border: 1px solid var(--color-interactivity);
        border-radius: var(--radius-16);
        overflow-x: auto;
    }
    .markdown :global(code) {
        font-family: monospace;
        background-color: var(--color-surface);
        padding: 0 .5em;
        border: 1px solid var(--color-interactivity);
        border-radius: var(--radius-16);
    }
    .markdown :global(ul) {
        margin: 1em 0;
        padding: 0 0 0 1em;
        list-style-type: disc;
    }
    .markdown :global(ol) {
        margin: 1em 0;
        padding: 0 0 0 1em;
    }
    .markdown :global(li) {
        margin: .5em 0;
    }
    .markdown :global(a) {
        color: var(--color-interactivity);
        text-decoration: none;
    }
    .markdown :global(a:hover) {
        text-decoration: underline;
    }
    .markdown :global(img) {
        max-width: 100%;
        height: auto;
    }
    .markdown :global(table) {
        width: 100%;
        border-collapse: collapse;
        font-size: .9em;
    }
    .markdown :global(th) {
        background-color: var(--color-surface);
        border: 1px solid var(--color-interactivity);
        padding: .5em;
    }
    .markdown :global(td) {
        border: 1px solid var(--color-interactivity);
        padding: .5em;
    }
    .markdown :global(tr:nth-child(2n)) {
        background-color: var(--color-surface);
    }
    .markdown :global(tr:hover) {
        background-color: var(--color-surface);
    }

    /* Responsive table: horizontal scroll on narrow containers */
    @container (max-width: 400px) {
        .markdown :global(table) {
            display: block;
            overflow-x: auto;
            font-size: .8em;
            white-space: nowrap;
        }
        .markdown :global(thead),
        .markdown :global(tbody),
        .markdown :global(tr) {
            display: revert;
        }
        .markdown :global(th),
        .markdown :global(td) {
            padding: .3em .5em;
        }
    }
    .markdown :global(hr) {
        border: 0;
        border-top: 1px solid var(--color-interactivity);
        margin: 1em 0;
    }

    .markdown :global(strong) {
        font-weight: bold;
    }
    
</style>