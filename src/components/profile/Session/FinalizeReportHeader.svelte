<script lang="ts">
    import { profile } from '$lib/profiles';
    import { t } from '$lib/i18n';


    interface Props {
        report: any;
    }

    let { report = $bindable() }: Props = $props();
    report.date = new Date();
</script>



<div class="report-header">

    <h1>{$t('session.report.title')}</h1>

<div><strong>{$t('session.report.patient')}</strong> {$profile.fullName} </div>
<div><strong>{$t('session.report.residence')}</strong> {$profile.vcard?.address?.[0]} </div>
<br/>
<div><strong>{$t('session.report.date')}</strong> {report.date.toLocaleDateString()}</div>
</div>


<style>

    .report-header {
        margin-bottom: 2rem;
        font-family: var(--font-face-print);
    }
    strong {
        font-weight: 800;
    }

    h1 {
        font-size: 2rem;
        margin-bottom: 1rem;

    }
</style>