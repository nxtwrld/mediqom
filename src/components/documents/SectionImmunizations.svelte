<script lang="ts">
    import { t } from '$lib/i18n';
    import AskButton from '$components/chat/AskButton.svelte';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();

    let hasImmunizations = $derived(data && data.hasImmunizations);
    
    let immunizations = $derived(data?.immunizations || []);
    let immunizationSchedule = $derived(data?.immunizationSchedule || []);
    let contraindications = $derived(data?.contraindications || []);
    let adverseReactions = $derived(data?.adverseReactions || []);
    let immunizationStatus = $derived(data?.immunizationStatus || {});
    let travelVaccinations = $derived(data?.travelVaccinations || []);
    let recommendations = $derived(data?.recommendations || []);
    
    function getStatusClass(status: string): string {
        const statusClasses: Record<string, string> = {
            'current': 'status-current',
            'overdue': 'status-overdue',
            'up_to_date': 'status-up-to-date',
            'incomplete': 'status-incomplete',
            'contraindicated': 'status-contraindicated',
            'declined': 'status-declined',
            'unknown': 'status-unknown'
        };
        return statusClasses[status] || 'status-unknown';
    }
    
    function getReactionSeverityClass(severity: string): string {
        const severityClasses: Record<string, string> = {
            'mild': 'reaction-mild',
            'moderate': 'reaction-moderate',
            'severe': 'reaction-severe',
            'life_threatening': 'reaction-critical'
        };
        return severityClasses[severity] || 'reaction-unknown';
    }
    
    function getRouteClass(route: string): string {
        const routeClasses: Record<string, string> = {
            'intramuscular': 'route-im',
            'subcutaneous': 'route-sc',
            'oral': 'route-oral',
            'nasal': 'route-nasal',
            'intradermal': 'route-id'
        };
        return routeClasses[route] || 'route-other';
    }
    
    function getPriorityClass(priority: string): string {
        const priorityClasses: Record<string, string> = {
            'routine': 'priority-routine',
            'recommended': 'priority-recommended',
            'required': 'priority-required',
            'urgent': 'priority-urgent'
        };
        return priorityClasses[priority] || 'priority-routine';
    }
    
    function formatDate(dateString: string): string {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString();
        } catch {
            return dateString;
        }
    }
    
    function calculateAge(birthDate: string, vaccinationDate: string): string {
        if (!birthDate || !vaccinationDate) return '';
        
        try {
            const birth = new Date(birthDate);
            const vaccination = new Date(vaccinationDate);
            
            const ageMs = vaccination.getTime() - birth.getTime();
            const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
            
            if (ageDays < 30) {
                return `${ageDays} days`;
            } else if (ageDays < 365) {
                const months = Math.floor(ageDays / 30);
                return `${months} month${months !== 1 ? 's' : ''}`;
            } else {
                const years = Math.floor(ageDays / 365);
                return `${years} year${years !== 1 ? 's' : ''}`;
            }
        } catch {
            return '';
        }
    }
</script>

{#if hasImmunizations}
    <h3 class="h3 heading -sticky">{$t('report.immunizations')}</h3>
    
    <!-- Immunization Status Overview -->
    {#if Object.keys(immunizationStatus).length > 0}
        <h4 class="section-title-sub">{$t('report.immunization-status')}</h4>
        <div class="page -block">
            <div class="status-overview">
                {#if immunizationStatus.overallStatus}
                    <div class="status-item">
                        <span class="status-label">{$t('report.overall-status')}:</span>
                        <span class="status-value {getStatusClass(immunizationStatus.overallStatus)}">
                            {$t(`medical.enums.immunization_status.${immunizationStatus.overallStatus}`)}
                        </span>
                    </div>
                {/if}
                
                {#if immunizationStatus.lastUpdated}
                    <div class="status-item">
                        <span class="status-label">{$t('report.last-updated')}:</span>
                        <span class="status-value">{formatDate(immunizationStatus.lastUpdated)}</span>
                    </div>
                {/if}
                
                {#if immunizationStatus.nextDue}
                    <div class="status-item">
                        <span class="status-label">{$t('report.next-due')}:</span>
                        <span class="status-value next-due">{formatDate(immunizationStatus.nextDue)}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Immunization History -->
    {#if immunizations.length > 0}
        <h4 class="section-title-sub">{$t('report.immunization-history')}</h4>
        <ul class="list-items">
            {#each immunizations as immunization}
                <li class="panel immunization-item {getStatusClass(immunization.status)}">
                    <div class="immunization-header">
                        <div class="immunization-main">
                            <h5 class="vaccine-name">{immunization.vaccineName}</h5>
                            {#if immunization.doseNumber}
                                <span class="dose-number">{$t('report.dose')} {immunization.doseNumber}</span>
                            {/if}
                        </div>
                        
                        <div class="immunization-badges">
                            {#if immunization.status}
                                <span class="status-badge {getStatusClass(immunization.status)}">
                                    {$t(`medical.enums.immunization_status.${immunization.status}`)}
                                </span>
                            {/if}
                            {#if immunization.route}
                                <span class="route-badge {getRouteClass(immunization.route)}">
                                    {$t(`medical.enums.administration_routes.${immunization.route}`)}
                                </span>
                            {/if}
                            <AskButton
                                type="immunization"
                                label={immunization.vaccineName}
                                data={immunization}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    <div class="immunization-details">
                        {#if immunization.dateGiven}
                            <div class="detail-item">
                                <span class="label">{$t('report.date-given')}:</span>
                                <span class="value">{formatDate(immunization.dateGiven)}</span>
                            </div>
                        {/if}
                        
                        {#if immunization.ageAtVaccination}
                            <div class="detail-item">
                                <span class="label">{$t('report.age-at-vaccination')}:</span>
                                <span class="value">{immunization.ageAtVaccination}</span>
                            </div>
                        {/if}
                        
                        {#if immunization.manufacturer}
                            <div class="detail-item">
                                <span class="label">{$t('report.manufacturer')}:</span>
                                <span class="value">{immunization.manufacturer}</span>
                            </div>
                        {/if}
                        
                        {#if immunization.lotNumber}
                            <div class="detail-item">
                                <span class="label">{$t('report.lot-number')}:</span>
                                <span class="value">{immunization.lotNumber}</span>
                            </div>
                        {/if}
                        
                        {#if immunization.expirationDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.expiration-date')}:</span>
                                <span class="value">{formatDate(immunization.expirationDate)}</span>
                            </div>
                        {/if}
                        
                        {#if immunization.site}
                            <div class="detail-item">
                                <span class="label">{$t('report.site')}:</span>
                                <span class="value">{immunization.site}</span>
                            </div>
                        {/if}
                        
                        {#if immunization.provider}
                            <div class="detail-item">
                                <span class="label">{$t('report.provider')}:</span>
                                <span class="value">{immunization.provider}</span>
                            </div>
                        {/if}
                        
                        {#if immunization.facility}
                            <div class="detail-item">
                                <span class="label">{$t('report.facility')}:</span>
                                <span class="value">{immunization.facility}</span>
                            </div>
                        {/if}
                        
                        {#if immunization.nextDueDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.next-due-date')}:</span>
                                <span class="value next-due">{formatDate(immunization.nextDueDate)}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if immunization.notes}
                        <div class="immunization-notes">
                            <span class="label">{$t('report.notes')}:</span>
                            <p class="notes-text">{immunization.notes}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Immunization Schedule -->
    {#if immunizationSchedule.length > 0}
        <h4 class="section-title-sub">{$t('report.immunization-schedule')}</h4>
        <div class="page -block">
            <div class="schedule-table">
                <div class="schedule-header">
                    <div class="schedule-col-vaccine">{$t('report.vaccine')}</div>
                    <div class="schedule-col-age">{$t('report.recommended-age')}</div>
                    <div class="schedule-col-status">{$t('report.status')}</div>
                    <div class="schedule-col-due">{$t('report.due-date')}</div>
                </div>
                
                {#each immunizationSchedule as scheduleItem}
                    <div class="schedule-row {getStatusClass(scheduleItem.status)}">
                        <div class="schedule-col-vaccine">
                            <span class="vaccine-name">{scheduleItem.vaccineName}</span>
                            {#if scheduleItem.doseNumber}
                                <span class="dose-info">{$t('report.dose')} {scheduleItem.doseNumber}</span>
                            {/if}
                        </div>
                        
                        <div class="schedule-col-age">
                            <span class="age-info">{scheduleItem.recommendedAge}</span>
                        </div>
                        
                        <div class="schedule-col-status">
                            <span class="status-badge {getStatusClass(scheduleItem.status)}">
                                {$t(`medical.enums.immunization_status.${scheduleItem.status}`)}
                            </span>
                        </div>
                        
                        <div class="schedule-col-due">
                            {#if scheduleItem.dueDate}
                                <span class="due-date">{formatDate(scheduleItem.dueDate)}</span>
                            {:else}
                                <span class="no-due">—</span>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
    
    <!-- Travel Vaccinations -->
    {#if travelVaccinations.length > 0}
        <h4 class="section-title-sub">{$t('report.travel-vaccinations')}</h4>
        <ul class="list-items">
            {#each travelVaccinations as travelVac}
                <li class="panel travel-vaccination-item">
                    <div class="travel-header">
                        <div class="travel-main">
                            <h5 class="vaccine-name">{travelVac.vaccineName}</h5>
                            {#if travelVac.destination}
                                <span class="destination">{$t('report.for')}: {travelVac.destination}</span>
                            {/if}
                        </div>
                        
                        {#if travelVac.priority}
                            <span class="priority-badge {getPriorityClass(travelVac.priority)}">
                                {$t(`medical.enums.priority_levels.${travelVac.priority}`)}
                            </span>
                        {/if}
                    </div>
                    
                    <div class="travel-details">
                        {#if travelVac.dateGiven}
                            <div class="detail-item">
                                <span class="label">{$t('report.date-given')}:</span>
                                <span class="value">{formatDate(travelVac.dateGiven)}</span>
                            </div>
                        {/if}
                        
                        {#if travelVac.validUntil}
                            <div class="detail-item">
                                <span class="label">{$t('report.valid-until')}:</span>
                                <span class="value">{formatDate(travelVac.validUntil)}</span>
                            </div>
                        {/if}
                        
                        {#if travelVac.certificate}
                            <div class="detail-item">
                                <span class="label">{$t('report.certificate')}:</span>
                                <span class="value certificate-info">{travelVac.certificate}</span>
                            </div>
                        {/if}
                        
                        {#if travelVac.requirements}
                            <div class="detail-item">
                                <span class="label">{$t('report.requirements')}:</span>
                                <span class="value">{travelVac.requirements}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Contraindications -->
    {#if contraindications.length > 0}
        <h4 class="section-title-sub">{$t('report.contraindications')}</h4>
        <ul class="list-items">
            {#each contraindications as contraindication}
                <li class="panel contraindication-item">
                    <div class="contraindication-header">
                        <span class="vaccine-name">{contraindication.vaccineName}</span>
                        <div class="contraindication-header-actions">
                            <span class="contraindication-type">{$t(`medical.enums.contraindication_types.${contraindication.type}`)}</span>
                            <AskButton
                                type="immunization-contraindication"
                                label={contraindication.vaccineName}
                                data={contraindication}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    <div class="contraindication-details">
                        <p class="contraindication-reason">{contraindication.reason}</p>
                        
                        {#if contraindication.dateIdentified}
                            <div class="detail-item">
                                <span class="label">{$t('report.date-identified')}:</span>
                                <span class="value">{formatDate(contraindication.dateIdentified)}</span>
                            </div>
                        {/if}
                        
                        {#if contraindication.temporary}
                            <div class="detail-item">
                                <span class="label">{$t('report.temporary')}:</span>
                                <span class="value">{contraindication.temporary ? $t('report.yes') : $t('report.no')}</span>
                            </div>
                        {/if}
                        
                        {#if contraindication.reviewDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.review-date')}:</span>
                                <span class="value">{formatDate(contraindication.reviewDate)}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Adverse Reactions -->
    {#if adverseReactions.length > 0}
        <h4 class="section-title-sub">{$t('report.adverse-reactions')}</h4>
        <ul class="list-items">
            {#each adverseReactions as reaction}
                <li class="panel adverse-reaction-item {getReactionSeverityClass(reaction.severity)}">
                    <div class="reaction-header">
                        <div class="reaction-main">
                            <h5 class="vaccine-name">{reaction.vaccineName}</h5>
                            <span class="reaction-type">{reaction.reactionType}</span>
                        </div>
                        
                        {#if reaction.severity}
                            <span class="severity-badge {getReactionSeverityClass(reaction.severity)}">
                                {$t(`medical.enums.reaction_severity.${reaction.severity}`)}
                            </span>
                        {/if}
                    </div>
                    
                    <div class="reaction-details">
                        <p class="reaction-description">{reaction.description}</p>
                        
                        {#if reaction.dateOccurred}
                            <div class="detail-item">
                                <span class="label">{$t('report.date-occurred')}:</span>
                                <span class="value">{formatDate(reaction.dateOccurred)}</span>
                            </div>
                        {/if}
                        
                        {#if reaction.onsetTime}
                            <div class="detail-item">
                                <span class="label">{$t('report.onset-time')}:</span>
                                <span class="value">{reaction.onsetTime}</span>
                            </div>
                        {/if}
                        
                        {#if reaction.duration}
                            <div class="detail-item">
                                <span class="label">{$t('report.duration')}:</span>
                                <span class="value">{reaction.duration}</span>
                            </div>
                        {/if}
                        
                        {#if reaction.treatment}
                            <div class="detail-item">
                                <span class="label">{$t('report.treatment')}:</span>
                                <span class="value">{reaction.treatment}</span>
                            </div>
                        {/if}
                        
                        {#if reaction.reportedTo}
                            <div class="detail-item">
                                <span class="label">{$t('report.reported-to')}:</span>
                                <span class="value">{reaction.reportedTo}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Recommendations -->
    {#if recommendations.length > 0}
        <h4 class="section-title-sub">{$t('report.recommendations')}</h4>
        <ul class="list-items">
            {#each recommendations as recommendation}
                <li class="panel recommendation-item {getPriorityClass(recommendation.priority)}">
                    <div class="recommendation-header">
                        <span class="recommendation-text">{recommendation.text}</span>
                        {#if recommendation.priority}
                            <span class="priority-badge {getPriorityClass(recommendation.priority)}">
                                {$t(`medical.enums.priority_levels.${recommendation.priority}`)}
                            </span>
                        {/if}
                    </div>
                    
                    <div class="recommendation-details">
                        {#if recommendation.vaccine}
                            <div class="detail-item">
                                <span class="label">{$t('report.vaccine')}:</span>
                                <span class="value">{recommendation.vaccine}</span>
                            </div>
                        {/if}
                        
                        {#if recommendation.dueDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.due-date')}:</span>
                                <span class="value next-due">{formatDate(recommendation.dueDate)}</span>
                            </div>
                        {/if}
                        
                        {#if recommendation.reason}
                            <div class="detail-item">
                                <span class="label">{$t('report.reason')}:</span>
                                <span class="value">{recommendation.reason}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.immunizations')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-immunization-data')}</p>
    </div>
{/if}

<style>
    .status-overview {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin-bottom: 1rem;
    }
    
    .status-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.5rem;
    }
    
    .status-label {
        font-weight: 500;
        color: var(--color-text-secondary);
    }
    
    .status-value {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .next-due {
        color: var(--color-warning-dark);
        font-weight: 600;
    }
    
    .immunization-item {
        border-left-color: var(--color-info);
    }
    
    .immunization-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .immunization-main {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .vaccine-name {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .dose-number {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
    }
    
    .immunization-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .status-badge,
    .route-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .status-current {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .status-overdue {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .status-up-to-date {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .status-incomplete {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .status-contraindicated {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .status-declined {
        background-color: var(--color-secondary-light);
        color: var(--color-secondary-dark);
    }
    
    .route-badge {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .immunization-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .immunization-notes {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }
    
    .notes-text {
        margin: 0.25rem 0 0 0;
        color: var(--color-text-secondary);
        font-style: italic;
        line-height: 1.5;
    }
    
    /* Schedule Table */
    .schedule-table {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .schedule-header,
    .schedule-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr;
        gap: 1rem;
        align-items: center;
        padding: 0.75rem;
        border-radius: 0.25rem;
    }
    
    .schedule-header {
        background-color: var(--color-background-secondary);
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .schedule-row {
        background-color: var(--color-background-secondary);
        border-left: 3px solid var(--color-border);
    }
    
    .schedule-row.status-overdue {
        border-left-color: var(--color-danger);
    }
    
    .schedule-row.status-current {
        border-left-color: var(--color-success);
    }
    
    .schedule-row.status-up-to-date {
        border-left-color: var(--color-success);
    }
    
    .schedule-row.status-incomplete {
        border-left-color: var(--color-warning);
    }
    
    .dose-info {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
    }
    
    .age-info {
        color: var(--color-text-secondary);
    }
    
    .due-date {
        color: var(--color-warning-dark);
        font-weight: 500;
    }
    
    .no-due {
        color: var(--color-text-secondary);
    }
    
    /* Travel Vaccinations */
    .travel-vaccination-item {
        border-left-color: var(--color-secondary);
    }
    
    .travel-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .travel-main {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .destination {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-style: italic;
    }
    
    .priority-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .priority-routine {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .priority-recommended {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .priority-required {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .priority-urgent {
        background-color: var(--color-danger);
        color: white;
    }
    
    .travel-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .certificate-info {
        color: var(--color-success-dark);
        font-weight: 500;
    }
    
    /* Contraindications */
    .contraindication-item {
        border-left-color: var(--color-danger);
    }
    
    .contraindication-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .contraindication-type {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .contraindication-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .contraindication-reason {
        margin: 0 0 0.5rem 0;
        color: var(--color-text-primary);
        line-height: 1.5;
    }
    
    /* Adverse Reactions */
    .adverse-reaction-item {
        border-left-color: var(--color-danger);
    }
    
    .reaction-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .reaction-main {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .reaction-type {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
    }
    
    .severity-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .reaction-mild {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .reaction-moderate {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .reaction-severe {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .reaction-critical {
        background-color: var(--color-danger);
        color: white;
    }
    
    .reaction-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .reaction-description {
        margin: 0 0 0.5rem 0;
        color: var(--color-text-primary);
        line-height: 1.5;
    }
    
    /* Recommendations */
    .recommendation-item {
        border-left-color: var(--color-info);
    }
    
    .recommendation-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .recommendation-text {
        font-weight: 500;
        color: var(--color-text-primary);
        flex: 1;
    }
    
    .recommendation-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .detail-item {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
    }
    
    .label {
        font-weight: 500;
        color: var(--color-text-secondary);
        min-width: 120px;
        flex-shrink: 0;
    }
    
    .value {
        color: var(--color-text-primary);
        flex: 1;
        line-height: 1.4;
    }
    
    /* Panel status coloring */
    .status-current {
        border-left-color: var(--color-success);
    }
    
    .status-overdue {
        border-left-color: var(--color-danger);
        border-left-width: 4px;
    }
    
    .status-up-to-date {
        border-left-color: var(--color-success);
    }
    
    .status-incomplete {
        border-left-color: var(--color-warning);
    }
    
    .status-contraindicated {
        border-left-color: var(--color-danger);
    }
    
    .status-declined {
        border-left-color: var(--color-secondary);
    }
    
    /* Reaction severity panel coloring */
    .reaction-mild {
        border-left-color: var(--color-info);
    }
    
    .reaction-moderate {
        border-left-color: var(--color-warning);
    }
    
    .reaction-severe {
        border-left-color: var(--color-danger);
    }
    
    .reaction-critical {
        border-left-color: var(--color-danger);
        border-left-width: 4px;
    }
    
    /* Priority-based panel coloring */
    .priority-routine {
        border-left-color: var(--color-info);
    }
    
    .priority-recommended {
        border-left-color: var(--color-warning);
    }
    
    .priority-required {
        border-left-color: var(--color-danger);
    }
    
    .priority-urgent {
        border-left-color: var(--color-danger);
        border-left-width: 4px;
    }
</style>