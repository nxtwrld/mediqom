<script lang="ts">
    import markdown from 'nano-markdown';
    import DOMPurify from 'dompurify';
    interface Props {
        text: any;
    }

    let { text }: Props = $props();


</script>


    <div class="markdown">
        {@html DOMPurify.sanitize(markdown(text).replace(/\n/gm, '<br/>' ))}
    </div>


<style>

    .markdown {
        user-select: text;
        cursor: text;
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
        background-color: var(--color-background-panel);
        border-left: 4px solid var(--color-primary);
    }
    .markdown :global(pre) {
        margin: 1em 0;
        padding: 1em;
        background-color: var(--color-background-panel);
        border: 1px solid var(--color-primary);
        border-radius: var(--border-radius);
        overflow-x: auto;
    }
    .markdown :global(code) {
        font-family: monospace;
        background-color: var(--color-background-panel);
        padding: 0 .5em;
        border: 1px solid var(--color-primary);
        border-radius: var(--border-radius);
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
        color: var(--color-primary);
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
    }
    .markdown :global(th) {
        background-color: var(--color-background-panel);
        border: 1px solid var(--color-primary);
        padding: .5em;
    }
    .markdown :global(td) {
        border: 1px solid var(--color-primary);
        padding: .5em;
    }
    .markdown :global(tr:nth-child(2n)) {
        background-color: var(--color-background-panel);
    }
    .markdown :global(tr:hover) {
        background-color: var(--color-background-panel);
    }
    .markdown :global(hr) {
        border: 0;
        border-top: 1px solid var(--color-primary);
        margin: 1em 0;
    }

    .markdown :global(strong) {
        font-weight: bold;
    }
    
</style>