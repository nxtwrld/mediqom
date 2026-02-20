<script lang="ts">
    import { t } from '$lib/i18n';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();
    // Check if we have procedure data
    let hasProcedures = $derived(data && (
        data.hasProcedures || 
        data.procedures?.length > 0
    ));
    
    // Extract procedure sections
    let procedures = $derived(data?.procedures || []);
    let surgicalTeam = $derived(data?.surgicalTeam || []);
    let location = $derived(data?.location);
    
    // Helper functions with proper typing
    function getOutcomeClass(outcome: string): string {
        const outcomeClasses: Record<string, string> = {
            'successful': 'outcome-success',
            'completed': 'outcome-success',
            'partial': 'outcome-partial',
            'complicated': 'outcome-complicated',
            'failed': 'outcome-failed',
            'cancelled': 'outcome-cancelled',
            'unknown': 'outcome-unknown'
        };
        return outcomeClasses[outcome?.toLowerCase()] || 'outcome-unknown';
    }
    
    function formatDuration(duration: number): string {
        if (!duration) return '';
        const hours = Math.floor(duration / 60);
        const minutes = duration % 60;
        
        if (hours > 0 && minutes > 0) {
            return `${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h`;
        } else {
            return `${minutes}m`;
        }
    }
    
    function formatTimeRange(startTime: string, endTime: string): string {
        if (!startTime && !endTime) return '';
        if (startTime && endTime) {
            return `${startTime} - ${endTime}`;
        }
        return startTime || endTime || '';
    }
    
    function getRoleClass(role: string): string {
        const roleClasses: Record<string, string> = {
            'surgeon': 'role-surgeon',
            'assistant': 'role-assistant',
            'anesthesiologist': 'role-anesthesiologist',
            'nurse': 'role-nurse',
            'resident': 'role-resident',
            'technician': 'role-technician'
        };
        return roleClasses[role?.toLowerCase()] || 'role-general';
    }
</script>

{#if hasProcedures}
    <h3 class="h3 heading -sticky">{$t('report.procedures')}</h3>
    
    <!-- Procedures List -->
    {#if procedures.length > 0}
        <h4 class="section-title-sub">{$t('report.performed-procedures')}</h4>
        <ul class="list-items">
            {#each procedures as procedure}
                <li class="panel procedure-item">
                    <div class="procedure-header">
                        <h5 class="item-name">{procedure.name}</h5>
                        {#if procedure.cptCode}
                            <span class="cpt-code">{procedure.cptCode}</span>
                        {/if}
                    </div>
                    
                    <div class="item-details">
                        {#if procedure.technique}
                            <div class="detail-item">
                                <span class="label">{$t('report.technique')}:</span>
                                <span class="value">{procedure.technique}</span>
                            </div>
                        {/if}
                        
                        {#if procedure.duration}
                            <div class="detail-item">
                                <span class="label">{$t('report.duration')}:</span>
                                <span class="value">{formatDuration(procedure.duration)}</span>
                            </div>
                        {/if}
                        
                        {#if procedure.startTime || procedure.endTime}
                            <div class="detail-item">
                                <span class="label">{$t('report.time')}:</span>
                                <span class="value">{formatTimeRange(procedure.startTime, procedure.endTime)}</span>
                            </div>
                        {/if}
                        
                        {#if procedure.outcome}
                            <div class="detail-item">
                                <span class="label">{$t('report.outcome')}:</span>
                                <span class="value outcome-value {getOutcomeClass(procedure.outcome)}">{$t(`medical.enums.procedure_outcomes.${procedure.outcome}`)}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if procedure.findings}
                        <div class="item-notes">
                            <span class="label">{$t('report.findings')}:</span>
                            <p>{procedure.findings}</p>
                        </div>
                    {/if}
                    
                    {#if procedure.complications?.length > 0}
                        <div class="complications">
                            <span class="label">{$t('report.complications')}:</span>
                            <div class="complications-list">
                                {#each procedure.complications as complication}
                                    <span class="complication-tag">{complication}</span>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Surgical Team -->
    {#if surgicalTeam.length > 0}
        <h4 class="section-title-sub">{$t('report.surgical-team')}</h4>
        <ul class="list-items">
            {#each surgicalTeam as member}
                <li class="panel team-member {getRoleClass(member.role)}">
                    <div class="member-header">
                        <span class="member-name">{member.name}</span>
                        <span class="member-role">{$t(`medical.enums.professional_roles.${member.role}`)}</span>
                    </div>
                    {#if member.credentials}
                        <div class="member-credentials">
                            <span class="credentials">{member.credentials}</span>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Location -->
    {#if location}
        <h4 class="section-title-sub">{$t('report.location')}</h4>
        <ul class="list-items">
            <li class="panel location-item">
                <span class="location-name">{location}</span>
            </li>
        </ul>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.procedures')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-procedure-data')}</p>
    </div>
{/if}

<style>
    /* SectionProcedures specific panel types */
    
    /* Panel type variations */
    .procedure-item {
        border-left-color: var(--color-primary);
    }
    
    .team-member {
        border-left-color: var(--color-info);
    }
    
    .role-surgeon {
        border-left-color: var(--color-primary);
    }
    
    .role-anesthesiologist {
        border-left-color: var(--color-warning);
    }
    
    .role-assistant {
        border-left-color: var(--color-success);
    }
    
    .location-item {
        border-left-color: var(--color-secondary);
    }
    
    /* Content styling */
    .procedure-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }
    
    .procedure-name {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .cpt-code {
        background-color: var(--color-primary-light);
        color: var(--color-primary-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        font-family: monospace;
    }
    
    /* procedure-details now uses global .item-details styles */
    
    .outcome-value {
        font-weight: 600;
    }
    
    .outcome-success {
        color: var(--color-success-dark);
    }
    
    .outcome-partial {
        color: var(--color-warning-dark);
    }
    
    .outcome-complicated,
    .outcome-failed {
        color: var(--color-danger-dark);
    }
    
    .outcome-cancelled {
        color: var(--color-text-secondary);
    }
    
    /* procedure-findings now uses global .item-notes styles */
    
    .complications {
        margin-bottom: 0.75rem;
    }
    
    .complications-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        margin-top: 0.25rem;
    }
    
    .complication-tag {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
    }
    
    /* Surgical Team */
    .member-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    
    .member-name {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .member-role {
        background-color: var(--color-background-secondary);
        color: var(--color-text-secondary);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: capitalize;
    }
    
    .member-credentials {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
    }
    
    .credentials {
        font-style: italic;
    }
    
    /* Location */
    .location-name {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    /* Uses global .no-data styles */
</style>