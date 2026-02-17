import { promises as fs } from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { StretchTemplate } from '$lib/types';

const STRETCHES_FILE = path.join(process.cwd(), 'data', 'stretches.yaml');

let cachedTemplate: { mtimeMs: number; value: StretchTemplate[] } | null = null;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeLabels(labels: unknown): string[] | undefined {
	if (!Array.isArray(labels)) return undefined;
	const cleaned = labels.map((label) => (typeof label === 'string' ? label.trim() : '')).filter(Boolean);
	return cleaned.length ? cleaned : undefined;
}

function validateTemplate(raw: unknown): StretchTemplate[] {
	if (!Array.isArray(raw)) {
		throw new Error('stretches.yaml must be an array of stretches');
	}

	const seenNames = new Set<string>();
	const seenIds = new Set<string>();

	return raw.map((entry, idx) => {
		if (!entry || typeof entry !== 'object') {
			throw new Error(`stretches.yaml entry ${idx + 1} is not an object`);
		}

		const { id, name, defaultDurationSeconds, holdLabels } = entry as Record<string, unknown>;

		const normalizedId = typeof id === 'string' ? id.trim() : '';
		if (!UUID_RE.test(normalizedId)) {
			throw new Error(`stretches.yaml entry ${idx + 1} is missing a valid UUID id`);
		}

		if (typeof name !== 'string' || !name.trim()) {
			throw new Error(`stretches.yaml entry ${idx + 1} is missing a valid name`);
		}

		if (typeof defaultDurationSeconds !== 'number' || !Number.isFinite(defaultDurationSeconds)) {
			throw new Error(`stretches.yaml entry "${name}" is missing a numeric defaultDurationSeconds`);
		}

		if (seenNames.has(name)) {
			throw new Error(`stretches.yaml contains duplicate stretch name "${name}"`);
		}

		if (seenIds.has(normalizedId)) {
			throw new Error(`stretches.yaml contains duplicate stretch id "${normalizedId}"`);
		}

		seenNames.add(name);
		seenIds.add(normalizedId);

		return {
			id: normalizedId,
			name: name.trim(),
			defaultDurationSeconds: Math.max(0, Math.round(defaultDurationSeconds)),
			holdLabels: normalizeLabels(holdLabels)
		};
	});
}

function extractTemplateSource(parsed: unknown): unknown {
	if (Array.isArray(parsed)) return parsed;
	if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).stretches)) {
		return (parsed as Record<string, unknown>).stretches;
	}

	throw new Error('stretches.yaml must be an array or include a "stretches" array');
}

export async function loadStretchTemplate(): Promise<{ template: StretchTemplate[]; version: number }> {
	const stats = await fs.stat(STRETCHES_FILE);

	if (cachedTemplate && cachedTemplate.mtimeMs === stats.mtimeMs) {
		return { template: cachedTemplate.value, version: cachedTemplate.mtimeMs };
	}

	const raw = await fs.readFile(STRETCHES_FILE, 'utf8');
	const parsed = YAML.parse(raw);
	const template = validateTemplate(extractTemplateSource(parsed));

	cachedTemplate = { mtimeMs: stats.mtimeMs, value: template };
	return { template, version: stats.mtimeMs };
}

export async function getStretchTemplateVersion(): Promise<number> {
	const stats = await fs.stat(STRETCHES_FILE);
	return stats.mtimeMs;
}
