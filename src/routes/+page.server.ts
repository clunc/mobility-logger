import { loadStretchTemplate } from '$lib/server/stretchConfig';
import { loadRegimenConfig } from '$lib/server/regimenConfig';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { template, version } = await loadStretchTemplate();
	const { config: regimenConfig, version: regimenVersion } = await loadRegimenConfig();
	return {
		stretchTemplate: template,
		templateVersion: Math.max(version, regimenVersion),
		regimenConfig
	};
};
