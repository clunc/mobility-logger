import type { HistoryEntry, HoldEntry, SessionStretch } from './types';

export const HOLDS_PER_STRETCH = 2;
export const DEFAULT_HOLD_SECONDS = 30;

export const stretchTemplate: SessionStretch[] = [
	{ name: 'Banded External Rotation 90/90 (shoulder rotators)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Neck Rotations (neck)', holds: [], defaultDurationSeconds: 20 },
	{ name: 'Chin Tucks (neck)', holds: [], defaultDurationSeconds: 20 },
	{ name: 'Side Neck Stretch (neck)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Levator Scap Stretch (neck)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Cross-Body Shoulder Stretch (shoulders)', holds: [], defaultDurationSeconds: 30 },
	{ name: '45 deg Armpit Neck Stretch (neck)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Wrist Flexor Stretch (forearms)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Wrist Extensor Stretch (forearms)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Seated Lateral Stretch (lat ribs, intercostals, QL)', holds: [], defaultDurationSeconds: 45 },
	{ name: 'Knee-to-Wall (ankles)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Calf Stretch (calves)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Soleus Stretch (soleus)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Doorway Stretch (chest, shoulders)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Overhead Triceps/Lat Stretch (arms, back)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Toe Extension Mobility Drill (feet/ankles)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Cat-Cow (spine)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Sleeper Stretch (shoulders)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Open Book (upper back, chest)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Quad + Hip Flexor (legs, hips)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Figure-4 (glutes)', holds: [], defaultDurationSeconds: 30 },
	{ name: 'Butterfly (groin)', holds: [], defaultDurationSeconds: 45 },
	{ name: '90/90 (hips)', holds: [], defaultDurationSeconds: 45 },
	{ name: 'Forward Fold (hamstrings, spine)', holds: [], defaultDurationSeconds: 45 },
	{
		name: 'Weighted Thoracic Extension Over Foam Roller (thoracic)',
		holds: [],
		defaultDurationSeconds: 45
	},
	{ name: 'Side Lunges (groin)', holds: [], defaultDurationSeconds: 30 }
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
