import { json } from '@sveltejs/kit';
import { getStretchTemplateVersion } from '$lib/server/stretchConfig';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const version = await getStretchTemplateVersion();
	return json({ version });
};
