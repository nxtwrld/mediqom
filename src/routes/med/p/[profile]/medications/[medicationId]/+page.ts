import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { isFeatureEnabled } from '$lib/config/feature-flags';

export const load: PageLoad = async ({ parent, params }) => {
	if (!isFeatureEnabled('MEDICATIONS')) throw error(404, 'Not found');
	await parent();
	return {
		medicationId: params.medicationId
	};
};
