import { promises as fs } from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { RegimenConfig } from '$lib/types';

const STRETCHES_FILE = path.join(process.cwd(), 'data', 'stretches.yaml');

let cachedConfig: { mtimeMs: number; value: RegimenConfig } | null = null;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseRegimenMode(value: unknown): 'short' | 'full' {
	if (value === 'short' || value === 'full') return value;
	throw new Error('stretches.yaml regimen mode keys must be "short" or "full"');
}

function parseOrder(value: unknown, mode: 'short' | 'full'): string[] {
	if (!Array.isArray(value)) {
		throw new Error(`stretches.yaml regimens.${mode}.order must be an array`);
	}

	const order = value
		.map((id) => (typeof id === 'string' ? id.trim() : ''))
		.filter(Boolean);

	if (order.length === 0) {
		throw new Error(`stretches.yaml regimens.${mode}.order must include at least one stretch`);
	}

	if (order.some((id) => !UUID_RE.test(id))) {
		throw new Error(`stretches.yaml regimens.${mode}.order must contain UUID stretch ids`);
	}

	return order;
}

function parseLabel(value: unknown, mode: 'short' | 'full'): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`stretches.yaml regimens.${mode}.label must be a non-empty string`);
	}

	return value.trim();
}

function parseShortRegimenDays(value: unknown): number[] {
	if (!Array.isArray(value)) {
		throw new Error(
			'stretches.yaml regimens.short.autoWeekDays must be an array of weekday numbers (0-6)'
		);
	}

	const days = value.map((day) => Number(day));
	if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
		throw new Error('stretches.yaml regimens.short.autoWeekDays must only include integers from 0 to 6');
	}

	return Array.from(new Set(days));
}

function validateConfig(raw: unknown): RegimenConfig {
	if (!raw || typeof raw !== 'object') {
		throw new Error('stretches.yaml must be an object');
	}

	const source = raw as Record<string, unknown>;
	const stretches = source.stretches;
	if (!Array.isArray(stretches)) {
		throw new Error('stretches.yaml stretches must be an array');
	}
	const stretchIds = new Set(
		stretches
			.map((entry) => {
				if (!entry || typeof entry !== 'object') return '';
				const id = (entry as Record<string, unknown>).id;
				return typeof id === 'string' ? id.trim() : '';
			})
			.filter((id) => UUID_RE.test(id))
	);

	if (!source.regimens || typeof source.regimens !== 'object') {
		throw new Error('stretches.yaml regimens must be an object');
	}

	const regimensSource = source.regimens as Record<string, unknown>;
	const modes = Object.keys(regimensSource).map(parseRegimenMode);

	if (!modes.includes('short') || !modes.includes('full')) {
		throw new Error('stretches.yaml regimens must include both "short" and "full" entries');
	}

	const regimens = modes.reduce((acc, mode) => {
		const entry = regimensSource[mode];
		if (!entry || typeof entry !== 'object') {
			throw new Error(`stretches.yaml regimens.${mode} must be an object`);
		}

		const typedEntry = entry as Record<string, unknown>;
		acc[mode] = {
			label: parseLabel(typedEntry.label, mode),
			order: parseOrder(typedEntry.order, mode),
			autoWeekDays: parseShortRegimenDays(typedEntry.autoWeekDays)
		};

		return acc;
	}, {} as RegimenConfig['regimens']);

	const assigned = new Map<number, 'short' | 'full'>();
	for (const mode of modes) {
		for (const day of regimens[mode].autoWeekDays) {
			const existing = assigned.get(day);
			if (existing && existing !== mode) {
				throw new Error(
					`stretches.yaml weekday ${day} appears in both regimens.${existing}.autoWeekDays and regimens.${mode}.autoWeekDays`
				);
			}
			assigned.set(day, mode);
		}
	}

	for (const mode of modes) {
		for (const stretchId of regimens[mode].order) {
			if (!stretchIds.has(stretchId)) {
				throw new Error(
					`stretches.yaml regimens.${mode}.order references unknown stretch id "${stretchId}"`
				);
			}
		}
	}

	for (let day = 0; day <= 6; day += 1) {
		if (!assigned.has(day)) {
			throw new Error(`stretches.yaml weekday ${day} is not assigned in regimen autoWeekDays`);
		}
	}

	return {
		regimens
	};
}

export async function loadRegimenConfig(): Promise<{ config: RegimenConfig; version: number }> {
	const stats = await fs.stat(STRETCHES_FILE);

	if (cachedConfig && cachedConfig.mtimeMs === stats.mtimeMs) {
		return { config: cachedConfig.value, version: cachedConfig.mtimeMs };
	}

	const raw = await fs.readFile(STRETCHES_FILE, 'utf8');
	const parsed = YAML.parse(raw);
	const config = validateConfig(parsed);

	cachedConfig = { mtimeMs: stats.mtimeMs, value: config };
	return { config, version: stats.mtimeMs };
}

export async function getRegimenConfigVersion(): Promise<number> {
	const stats = await fs.stat(STRETCHES_FILE);
	return stats.mtimeMs;
}
