import type { HistoryEntry, HoldEntry, SessionStretch } from './types';

export const DEFAULT_HOLD_SECONDS = 65;

const LEFT_RIGHT_LABELS = ['Left', 'Right'];

export const stretchTemplate: SessionStretch[] = [
	{
		name: 'Banded External Rotation 90/90 (shoulder rotators)',
		holds: [],
		defaultDurationSeconds: 65
	},
	{ name: 'Neck Rotations (neck)', holds: [], defaultDurationSeconds: 65 },
	{ name: 'Chin Tucks (neck)', holds: [], defaultDurationSeconds: 65 },
	{ name: 'Side Neck Stretch (neck)', holds: [], defaultDurationSeconds: 65, holdLabels: LEFT_RIGHT_LABELS },
	{ name: 'Levator Scap Stretch (neck)', holds: [], defaultDurationSeconds: 65, holdLabels: LEFT_RIGHT_LABELS },
	{
		name: 'Cross-Body Shoulder Stretch (shoulders)',
		holds: [],
		defaultDurationSeconds: 65,
		holdLabels: LEFT_RIGHT_LABELS
	},
	{
		name: '45 deg Armpit Neck Stretch (neck)',
		holds: [],
		defaultDurationSeconds: 65
	},
	{ name: 'Wrist Flexor Stretch (forearms)', holds: [], defaultDurationSeconds: 65, holdLabels: LEFT_RIGHT_LABELS },
	{
		name: 'Wrist Extensor Stretch (forearms)',
		holds: [],
		defaultDurationSeconds: 65,
		holdLabels: LEFT_RIGHT_LABELS
	},
	{
		name: 'Seated Lateral Stretch (lat ribs, intercostals, QL)',
		holds: [],
		defaultDurationSeconds: 65,
		holdLabels: LEFT_RIGHT_LABELS
	},
	{ name: 'Knee-to-Wall (ankles)', holds: [], defaultDurationSeconds: 65, holdLabels: LEFT_RIGHT_LABELS },
	{ name: 'Calf Stretch (calves)', holds: [], defaultDurationSeconds: 65, holdLabels: LEFT_RIGHT_LABELS },
	{ name: 'Soleus Stretch (soleus)', holds: [], defaultDurationSeconds: 65, holdLabels: LEFT_RIGHT_LABELS },
	{
		name: 'Doorway Stretch (chest, shoulders)',
		holds: [],
		defaultDurationSeconds: 65,
		holdLabels: LEFT_RIGHT_LABELS
	},
	{
		name: 'Overhead Triceps/Lat Stretch (arms, back)',
		holds: [],
		defaultDurationSeconds: 65,
		holdLabels: LEFT_RIGHT_LABELS
	},
	{
		name: 'Toe Extension Mobility Drill (feet/ankles)',
		holds: [],
		defaultDurationSeconds: 65
	},
	{ name: 'Cat-Cow (spine)', holds: [], defaultDurationSeconds: 65 },
	{ name: 'Sleeper Stretch (shoulders)', holds: [], defaultDurationSeconds: 65, holdLabels: LEFT_RIGHT_LABELS },
	{
		name: 'Open Book (upper back, chest)',
		holds: [],
		defaultDurationSeconds: 65,
		holdLabels: LEFT_RIGHT_LABELS
	},
	{
		name: 'Quad + Hip Flexor (legs, hips)',
		holds: [],
		defaultDurationSeconds: 65,
		holdLabels: LEFT_RIGHT_LABELS
	},
	{ name: 'Figure-4 (glutes)', holds: [], defaultDurationSeconds: 65, holdLabels: LEFT_RIGHT_LABELS },
	{ name: 'Butterfly (groin)', holds: [], defaultDurationSeconds: 65 },
	{ name: '90/90 (hips)', holds: [], defaultDurationSeconds: 65 },
	{
		name: 'Forward Fold (hamstrings, spine)',
		holds: [],
		defaultDurationSeconds: 65,
		holdLabels: LEFT_RIGHT_LABELS
	},
	{
		name: 'Weighted Thoracic Extension Over Foam Roller (thoracic)',
		holds: [],
		defaultDurationSeconds: 65
	},
	{ name: 'Side Lunges (groin)', holds: [], defaultDurationSeconds: 65, holdLabels: LEFT_RIGHT_LABELS }
];

export const todayString = () => new Date().toDateString();

export function createSession(history: HistoryEntry[]): SessionStretch[] {
	const today = todayString();

	const cloneHold = (template: SessionStretch): SessionStretch => {
		const lastLogged = history.find((h) => h.stretch === template.name);
		const defaultDurationSeconds = lastLogged
			? lastLogged.durationSeconds
			: template.defaultDurationSeconds;

		const totalHolds = Math.max(1, template.holdLabels?.length ?? 1);
		const holds: HoldEntry[] = Array.from({ length: totalHolds }, (_, idx) => {
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

export function getHoldLabel(stretchName: string, holdNumber: number) {
	const template = stretchTemplate.find((stretch) => stretch.name === stretchName);
	const label = template?.holdLabels?.[holdNumber - 1];
	if (label) return label;
	if (template?.holdLabels?.length) return `Hold ${holdNumber}`;
	return null;
}
