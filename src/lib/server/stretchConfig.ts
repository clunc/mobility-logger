import { promises as fs } from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { StretchTemplate } from '$lib/types';

const STRETCHES_FILE = path.join(process.cwd(), 'data', 'stretches.yaml');

let cachedTemplate: { mtimeMs: number; value: StretchTemplate[] } | null = null;

function normalizeLabels(labels: unknown): string[] | undefined {
	if (!Array.isArray(labels)) return undefined;
	const cleaned = labels.map((label) => (typeof label === 'string' ? label.trim() : '')).filter(Boolean);
	return cleaned.length ? cleaned : undefined;
}

function validateTemplate(raw: unknown): StretchTemplate[] {
	if (!Array.isArray(raw)) {
		throw new Error('stretches.yaml must be an array of stretches');
	}

	const seen = new Set<string>();

	return raw.map((entry, idx) => {
		if (!entry || typeof entry !== 'object') {
			throw new Error(`stretches.yaml entry ${idx + 1} is not an object`);
		}

		const { name, defaultDurationSeconds, holdLabels } = entry as Record<string, unknown>;

		if (typeof name !== 'string' || !name.trim()) {
			throw new Error(`stretches.yaml entry ${idx + 1} is missing a valid name`);
		}

		if (typeof defaultDurationSeconds !== 'number' || !Number.isFinite(defaultDurationSeconds)) {
			throw new Error(`stretches.yaml entry "${name}" is missing a numeric defaultDurationSeconds`);
		}

		if (seen.has(name)) {
			throw new Error(`stretches.yaml contains duplicate stretch name "${name}"`);
		}

		seen.add(name);

		return {
			name: name.trim(),
			defaultDurationSeconds: Math.max(0, Math.round(defaultDurationSeconds)),
			holdLabels: normalizeLabels(holdLabels)
		};
	});
}

export async function loadStretchTemplate(): Promise<StretchTemplate[]> {
	const stats = await fs.stat(STRETCHES_FILE);

	if (cachedTemplate && cachedTemplate.mtimeMs === stats.mtimeMs) {
		return cachedTemplate.value;
	}

	const raw = await fs.readFile(STRETCHES_FILE, 'utf8');
	const parsed = YAML.parse(raw);
	const template = validateTemplate(parsed);

	cachedTemplate = { mtimeMs: stats.mtimeMs, value: template };
	return template;
}
