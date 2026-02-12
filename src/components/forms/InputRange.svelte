<script lang="ts">
    interface Props {
        value?: number | string;
        id?: string;
        name?: string;
        min?: number;
        max?: number;
        step?: number;
        disabled?: boolean;
        readonly?: boolean;
        style?: string;
        class?: string;
        tabindex?: number;
        onchange?: (e: Event) => void;
        oninput?: (e: Event) => void;
        onblur?: (e: FocusEvent) => void;
        onfocus?: (e: FocusEvent) => void;
    }

    let {
        value = $bindable<number | string>(0),
        id = (window as any)?.crypto.getRandomValues(new Uint32Array(1))[0].toString(16),
        name = id,
        min = 0,
        max = 100,
        step = 1,
        disabled = false,
        readonly = false,
        style = '',
        class: className = '',
        tabindex = 0,
        onchange,
        oninput,
        onblur,
        onfocus
    }: Props = $props();

    // Calculate percentage for gradient background (handle string values)
    let numericValue = $derived(typeof value === 'string' ? parseFloat(value) || 0 : value);
    let percentage = $derived(((numericValue - min) / (max - min)) * 100);
</script>

<input
    type="range"
    {id}
    {name}
    class="input-range {className}"
    {tabindex}
    {disabled}
    {readonly}
    bind:value
    {min}
    {max}
    {step}
    {style}
    style:--range-progress="{percentage}%"
    {onchange}
    {oninput}
    {onblur}
    {onfocus}
/>

<style>
    .input-range {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: calc(var(--input-height) / 2);
        background: linear-gradient(
            to right,
            var(--color-blue) 0%,
            var(--color-blue) var(--range-progress, 0%),
            var(--color-gray-500) var(--range-progress, 0%),
            var(--color-gray-500) 100%
        );
        border-radius: var(--radius-8);
        outline: none;
        border: 1px solid var(--color-gray-600);
        cursor: pointer;
        transition: background 0.1s ease;
    }

    .input-range:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .input-range:focus {
        border-color: var(--color-blue);
        box-shadow: 0 0 0 2px rgba(53, 113, 255, 0.2);
    }

    /* Webkit (Chrome, Safari, Edge) */
    .input-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: calc(var(--input-height) / 2);
        height: calc(var(--input-height) / 2);
        background: var(--color-blue);
        border-radius: var(--radius-8);
        transform: translateY(-5%);
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        border: 2px solid var(--color-white);
        transition: transform 0.1s ease, box-shadow 0.1s ease;
    }

    .input-range::-webkit-slider-thumb:hover {
        transform: scale(1.1);
        box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
    }

    .input-range::-webkit-slider-thumb:active {
        transform: scale(0.95);
    }

    .input-range:disabled::-webkit-slider-thumb {
        cursor: not-allowed;
        background: var(--color-gray-600);
    }

    /* Firefox */
    .input-range::-moz-range-thumb {
        width: 20px;
        height: 20px;
        background: var(--color-blue);
        border-radius: 50%;
        cursor: pointer;
        border: 2px solid var(--color-white);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        transition: transform 0.1s ease, box-shadow 0.1s ease;
    }

    .input-range::-moz-range-thumb:hover {
        transform: scale(1.1);
        box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
    }

    .input-range::-moz-range-track {
        height: 6px;
        border-radius: 3px;
        background: transparent;
    }

    .input-range:disabled::-moz-range-thumb {
        cursor: not-allowed;
        background: var(--color-gray-600);
    }

    /* Firefox doesn't support the gradient trick well, so we use a different approach */
    @-moz-document url-prefix() {
        .input-range {
            background: var(--color-gray-500);
        }
    }
</style>
