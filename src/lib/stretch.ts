import type { HistoryEntry, HoldEntry, SessionStretch } from './types';

export const HOLDS_PER_STRETCH = 2;
export const DEFAULT_HOLD_SECONDS = 30;

export const stretchTemplate: SessionStretch[] = [
	{ name: 'Hip Flexor Stretch', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Hamstring Fold', holds: [], defaultDurationSeconds: 45 },
	{ name: 'Thoracic Opener', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Calf Stretch', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Chest Doorway', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Neck Reset', holds: [], defaultDurationSeconds: 20 }
];

export const todayString = () => new Date().toDateString();

export function createSession(history: HistoryEntry[]): SessionStretch[] {
	const today = todayString();

	const cloneHold = (template: SessionStretch): SessionStretch => {
		const lastLogged = history.find((h) => h.stretch === template.name);
		const defaultDurationSeconds = lastLogged
			? lastLogged.durationSeconds
			: template.defaultDurationSeconds;

		const holds: HoldEntry[] = Array.from({ length: HOLDS_PER_STRETCH }, (_, idx) => {
			const holdNumber = idx + 1;
			const todaysLog = history.find(
				(h) =>
					h.stretch === template.name &&
					h.holdNumber === holdNumber &&
					new Date(h.timestamp).toDateString() === today
			);

			if (todaysLog) {
				return {
					holdNumber,
					durationSeconds: todaysLog.durationSeconds,
					completed: true,
					timestamp: todaysLog.timestamp
				};
			}

			return {
				holdNumber,
				durationSeconds: defaultDurationSeconds,
				completed: false,
				timestamp: null
			};
		});

		return { ...template, holds };
	};

	return stretchTemplate.map(cloneHold);
}

export function formatTimestamp(isoString: string) {
	const date = new Date(isoString);
	const today = todayString();

	if (date.toDateString() === today) {
		return `Today, ${date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit'
		})}`;
	}

	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}
