import { json } from '@sveltejs/kit';
import { getStretchTemplateVersion } from '$lib/server/stretchConfig';
import { getRegimenConfigVersion } from '$lib/server/regimenConfig';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const [stretchVersion, regimenVersion] = await Promise.all([
		getStretchTemplateVersion(),
		getRegimenConfigVersion()
	]);
	return json({ version: Math.max(stretchVersion, regimenVersion) });
};
