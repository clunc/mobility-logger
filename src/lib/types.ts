export type HistoryEntry = {
	stretch: string;
	holdNumber: number;
	durationSeconds: number;
	timestamp: string;
};

export type HoldEntry = {
	holdNumber: number;
	durationSeconds: number;
	completed: boolean;
	timestamp: string | null;
};

export type SessionStretch = {
	id: string;
	name: string;
	holds: HoldEntry[];
	defaultDurationSeconds: number;
	holdLabels?: string[];
};

export type StretchTemplate = {
	id: string;
	name: string;
	defaultDurationSeconds: number;
	holdLabels?: string[];
};

export type RegimenDefinition = {
	label: string;
	order: string[];
	autoWeekDays: number[];
};

export type RegimenConfig = {
	regimens: {
		short: RegimenDefinition;
		full: RegimenDefinition;
	};
};
