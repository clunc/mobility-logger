import { loadStretchTemplate } from '$lib/server/stretchConfig';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const stretchTemplate = await loadStretchTemplate();
	return { stretchTemplate };
};
