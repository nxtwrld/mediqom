<script lang="ts">
    import { createBubbler } from 'svelte/legacy';
    import { t } from '$lib/i18n';

    const bubble = createBubbler();
    import InputDateTime from "./InputDateTime.svelte";
    import InputFile from "./InputFile.svelte";
    import InputRange from "./InputRange.svelte";



    interface Props {
        value?: string | number;
        checked?: boolean;
        group?: any;
        placeholder?: string;
        type?: string;
        id?: string;
        name?: string;
        required?: boolean;
        label?: string | undefined;
        style?: string;
        min?: string;
        max?: string;
        step?: string;
        disabled?: boolean;
        viewable?: boolean;
        readonly?: boolean;
        copyable?: boolean;
        autocomplete?: string;
        tabindex?: number;
        view?: boolean;
        class?: string;
        children?: import('svelte').Snippet;
    }

    let {
        value = $bindable(''),
        checked = $bindable(false),
        group = $bindable(''),
        placeholder = $t('app.forms.input'),
        type = 'text',
        id = (window as any)?.crypto.getRandomValues(new Uint32Array(1))[0].toString(16),
        name = id,
        required = false,
        label = undefined,
        style = '',
        min = '',
        max = '',
        step = '',
        disabled = false,
        viewable = true,
        readonly = false,
        copyable = false,
        autocomplete = 'off',
        tabindex = 0,
        view = $bindable(false),
        class: className = 'input',
        children
    }: Props = $props();

    // Cast autocomplete to proper type for HTML input
    const autocompleteAttr = autocomplete as any;
</script>

{#if (children || label) && type != 'checkbox' && type != 'radio'}
    <label class="label" for={id}>
        {#if label}
            {label}
        {:else}
            {@render children?.()}
        {/if}
    </label>
{/if}
<div class="input-field">
{#if type == 'text'}
    <input type="text" {id} {name} class={className} {tabindex} {disabled} bind:value {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} class:copyable={copyable}
        onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
{:else if type == 'password'}
    
        {#if view == false}
        <input type="password" {id} {name} class={className} {tabindex} {disabled} bind:value {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} class:copyable={copyable} class:viewable={viewable}
            onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
        {:else}
        <input type="text" {id} {name} class={className} {tabindex} {disabled} bind:value {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} class:copyable={copyable} class:viewable={viewable}
            onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
        {/if}

        {#if viewable}
            <button type="button" onclick={() => view = !view} class="input-tool input-show-password">
                {#if view == false}
                    <svg>
                        <use xlink:href="/sprite.svg#password-show"></use>
                    </svg>
                {:else}
                    <svg>
                        <use xlink:href="/sprite.svg#password-hide"></use>
                    </svg>
                {/if}
            </button>
        {/if}
{:else if type == 'search'}
    <input type="search" {id} {name} class={className} {tabindex} {disabled} bind:value {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} class:copyable={copyable}
        onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
{:else if type == 'email'}
    <input type="email" {id} {name} class={className} {tabindex} {disabled} bind:value {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} class:copyable={copyable}
        onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
{:else if type == 'number'}
    <input type="number" {id} {name} {step} class={className} {tabindex} {disabled} bind:value {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} class:copyable={copyable}
        {min} {max}
        onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
{:else if type == 'time'}
    <input type="time" {id} {name} class={className} {tabindex} {disabled} bind:value {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} class:copyable={copyable}
        onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
{:else if type == 'tel'}
    <input type="tel" {id} {name} class={className} {tabindex} {disabled} bind:value {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} class:copyable={copyable}
        onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
{:else if type == 'url'}
    <input type="url" {id} {name} class={className} {tabindex} {disabled} bind:value {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} class:copyable={copyable}
        onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
{:else if type == 'week'}
    <input type="week" {id} {name} class={className} {tabindex} {disabled} bind:value {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} class:copyable={copyable}
        onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
{:else if type == 'month'}
    <input type="month" {id} {name} class={className} {tabindex} {disabled} bind:value {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} class:copyable={copyable}
        onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
{:else if type == 'range'}
    <InputRange {id} {name} class={className} {tabindex} {disabled} bind:value {style} {readonly} min={parseFloat(min) || 0} max={parseFloat(max) || 100} step={parseFloat(step) || 1}
        onchange={bubble('change')} oninput={bubble('input')} onblur={bubble('blur')} onfocus={bubble('focus')}/>
{:else if type == 'file'}
    <InputFile {id} {name} class={className} {tabindex} {disabled} bind:value={value as string} {placeholder} {required} {style} autocomplete={autocomplete as any}
        onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')} onkeypress={bubble('keypress')} onkeyup={bubble('keyup')} onkeydown={bubble('keydown')}/>
{:else if type == 'datetime-local' || type == 'datetime' || type == 'date-local' || type == 'date' || type == 'time'}
    <InputDateTime {id} {name} class={className} {tabindex} {disabled} bind:value={value as string} {placeholder} {required} {style} autocomplete={autocomplete as any} {readonly} onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')}/>
{:else if type == 'checkbox'}
    <div class="input-line" class:checked={checked}>
        <input type="checkbox" {id} {name} class={className} {tabindex} {disabled} bind:checked={checked} {style} autocomplete={autocomplete as any} {readonly} onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')}/>
            {#if (children || label)}
            <label class="label" for={id}>
                {#if label}
                    {label}
                {:else}
                    {@render children?.()}
                {/if}
            </label>
        {/if}
    </div>
{:else if type == 'radio'}
    <div class="input-line" class:checked={checked}>
        <input type="radio" {id} {name} class={className} {tabindex} {disabled} bind:group={group} {value} {style} autocomplete={autocomplete as any} {readonly} onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')}/>
            {#if (children || label)}
            <label class="label" for={id}>
                {#if label}
                    {label}
                {:else}
                    {@render children?.()}
                {/if}
            </label>
        {/if}
    </div>
{/if}
{#if copyable}
    <button type="button" class="input-tool input-copy" onclick={() => navigator.clipboard.writeText(String(value))} disabled={value == ''}>
        <svg>
            <use xlink:href="/sprite.svg#copy"></use>
        </svg>
    </button>
{/if}
 </div>
<style>
    .input-line {
        display: flex;
        align-items: center;
        justify-content: flex-start;
    }
    .input-field {
        position: relative;
        width: 100%;
    }
    .input-field input.viewable,
    .input-field input.copyable {
        padding-right: 2rem;
        
    }
    .input-field input.copyable.viewable {
        padding-right: 4rem;
    }

    .input-tool {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        aspect-ratio: 1/1;
        padding: 0.5rem;
        border: none;
        pointer-events: all;
        background-color: transparent;
        color: var(--color-text);
        font-size: 0.8rem;
        cursor: pointer;
        z-index: 1;
        opacity: 0.5;
    }
    .input-tool:hover {
        opacity: 1;
    }

    .input-tool svg {
        width: 100%;
        height: 100%;
        fill: currentColor;
    }
    .input-tool:nth-last-child(2) {
        right: 2rem;
    }
</style>
