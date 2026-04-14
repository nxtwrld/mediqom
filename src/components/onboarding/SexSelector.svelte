<script lang="ts">
    import { SexEnum } from '$lib/types.d';
    import { t } from '$lib/i18n';

    interface Props {
        value: SexEnum | undefined;
    }

    let { value = $bindable() }: Props = $props();

    function select(sex: SexEnum) {
        value = sex;
    }
</script>

<fieldset class="sex-selector">
    <legend class="label">{$t('profile.health.props.biologicalSex')}</legend>
    <div class="sex-cards">
        <button
            type="button"
            class="sex-card"
            class:-selected={value === SexEnum.male}
            onclick={() => select(SexEnum.male)}
        >
            <svg class="sex-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="10.5" cy="13.5" r="5.5" />
                <line x1="14.5" y1="9.5" x2="20" y2="4" />
                <line x1="16" y1="4" x2="20" y2="4" />
                <line x1="20" y1="4" x2="20" y2="8" />
            </svg>
            <span class="sex-label">{$t('medical.prop-values.biologicalSex.male')}</span>
        </button>

        <button
            type="button"
            class="sex-card"
            class:-selected={value === SexEnum.female}
            onclick={() => select(SexEnum.female)}
        >
            <svg class="sex-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="9" r="5.5" />
                <line x1="12" y1="14.5" x2="12" y2="21" />
                <line x1="9" y1="18" x2="15" y2="18" />
            </svg>
            <span class="sex-label">{$t('medical.prop-values.biologicalSex.female')}</span>
        </button>
    </div>
</fieldset>

<style>
    .sex-selector {
        border: none;
        padding: 0;
        margin: 0;
    }

    .label {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        margin-bottom: var(--ui-pad-small);
        display: block;
    }

    .sex-cards {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--ui-pad-medium);
    }

    .sex-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ui-pad-small);
        padding: var(--ui-pad-large) var(--ui-pad-medium);
        background-color: var(--color-surface);
        border: 2px solid transparent;
        border-radius: var(--ui-radius-large);
        cursor: pointer;
        transition: all 0.2s ease;
        color: var(--color-text-secondary);
    }

    .sex-card:hover {
        border-color: var(--color-border);
    }

    .sex-card.-selected {
        border-color: var(--color-highlight);
        color: var(--color-highlight);
        box-shadow: 0 0 12px color-mix(in srgb, var(--color-highlight) 25%, transparent);
    }

    .sex-icon {
        width: 3rem;
        height: 3rem;
    }

    .sex-label {
        font-size: 0.9rem;
        font-weight: 500;
    }
</style>
