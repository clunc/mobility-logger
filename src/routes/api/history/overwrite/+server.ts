import { json } from '@sveltejs/kit';
import { replaceHistory } from '$lib/server/historyStore';
import type { RequestHandler } from './$types';
import type { HistoryEntry } from '$lib/types';

const isValidEntry = (entry: unknown): entry is HistoryEntry => {
	if (!entry || typeof entry !== 'object') return false;

	const candidate = entry as Record<string, unknown>;
	return (
		typeof candidate.stretch === 'string' &&
		typeof candidate.holdNumber === 'number' &&
		typeof candidate.durationSeconds === 'number' &&
		typeof candidate.timestamp === 'string'
	);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const payload =
		(body as { history?: unknown; entries?: unknown })?.history ??
		(body as { history?: unknown; entries?: unknown })?.entries;

	if (!Array.isArray(payload) || !payload.every(isValidEntry)) {
		return json({ error: 'Invalid history payload' }, { status: 400 });
	}

	await replaceHistory(payload);

	return json({ ok: true, count: payload.length });
};
