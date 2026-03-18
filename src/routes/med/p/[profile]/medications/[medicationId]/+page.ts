import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, params }) => {
	await parent();
	return {
		medicationId: params.medicationId
	};
};
