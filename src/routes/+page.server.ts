import { loadStretchTemplate } from '$lib/server/stretchConfig';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { template, version } = await loadStretchTemplate();
	return { stretchTemplate: template, templateVersion: version };
};
