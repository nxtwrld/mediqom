<script lang="ts">
    import { t } from '$lib/i18n';

    export const ready: boolean = true;
    
    interface Props {
        data: {};
        profileForm: HTMLFormElement;
    }

    let { data, profileForm }: Props = $props();
</script>


    <h2 class="h2">{ $t('app.onboarding.you-account-is-almost-ready') }</h2>
<div class="result-icon">
<svg>
    <use href="/icons-o.svg#registration-form" />
</svg>
</div>
<h2 class="h2">{ $t('app.onboarding.hit-save-to-start') }</h2>

<style>

    .h2 {
        text-align: center;
    }
    .result-icon {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-grow: 1;
        margin: 8rem 0;
    }
    .result-icon svg {
        width: 17.6rem;
        height: 17.6rem;
        fill: var(--color-interactivity);
        animation: pulsate 2s infinite;
    }

    @keyframes pulsate {
        0% {
            opacity: .7;
        }
        50% {
            opacity: 1;
        }
        100% {
            opacity: .7;
        }
    }
</style>