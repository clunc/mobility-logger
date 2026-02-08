<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import StretchCard from '$lib/components/StretchCard.svelte';
	import HistoryList from '$lib/components/HistoryList.svelte';
	import StretchTimer from '$lib/components/StretchTimer.svelte';
	import { appendHistory, deleteHistoryEntry, fetchHistory } from '$lib/api/history';
	import { createSession, DEFAULT_HOLD_SECONDS, todayString } from '$lib/stretch';
import type { HistoryEntry, SessionStretch, StretchTemplate } from '$lib/types';
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

	export let data: PageData;

	let history: HistoryEntry[] = [];
	let currentSession: SessionStretch[] = [];
	let holdTimeRemaining = 0;
	let holdTimerStatus: 'idle' | 'active' | 'warning' | 'done' = 'idle';
	let holdTimerInterval: ReturnType<typeof setInterval> | null = null;
	let holdHideTimeout: ReturnType<typeof setTimeout> | null = null;
	let activeHold: { stretchIdx: number; holdIdx: number; endsAt: number } | null = null;
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let ready = false;
	let loadError = '';
	let templateVersion = data.templateVersion;
	type RegimenMode = 'auto' | 'short' | 'full';
	let regimenMode: RegimenMode = 'auto';
	const shortRegimenDays = new Set([0, 1, 3, 4, 5]);
	const shortRegimenOrder = [
		'Chin Tucks (neck)',
		'Levator Scap Stretch (neck)',
		'45 deg Armpit Neck Stretch (neck)',
		'Banded External Rotation 90/90 (shoulder rotators)',
		'Knee-to-Wall (ankles)',
		'Quad + Hip Flexor (legs, hips)',
		'Forward Fold (hamstrings, spine)',
		'Cat-Cow (spine)'
	];
	const fullRegimenOrder = [
		'Cat-Cow (spine)',
		'Sleeper Stretch (shoulders)',
		'Open Book (upper back, chest)',
		'Quad + Hip Flexor (legs, hips)',
		'Figure-4 (glutes)',
		'Butterfly (groin)',
		'90/90 (hips)',
		'Forward Fold (hamstrings, spine)',
		'Weighted Thoracic Extension Over Foam Roller (thoracic)',
		'Side Lunges (groin)'
	];
	const getEffectiveRegimen = (mode: RegimenMode, weekDay: number) =>
		mode === 'auto' ? (shortRegimenDays.has(weekDay) ? 'short' : 'full') : mode;
	const getRegimenTemplate = (template: StretchTemplate[], regimen: 'short' | 'full') => {
		const order = regimen === 'short' ? shortRegimenOrder : fullRegimenOrder;
		const lookup = new Map(template.map((stretch) => [stretch.name, stretch]));
		const missing = order.filter((name) => !lookup.has(name));
		const filtered = order.map((name) => lookup.get(name)).filter(Boolean) as StretchTemplate[];
		return { template: filtered, missing };
	};
	let lastRegimenKey = '';
	let regimenKey = '';
	let autoRegimenLabel = 'Auto (today)';
	let regimenMissing: string[] = [];

	const ensureStretchInSession = (stretchName: string) => {
		const existing = currentSession.find((s) => s.name === stretchName);
		if (existing) return existing;

		const template = data.stretchTemplate.find((s) => s.name === stretchName);
		if (!template) return null;

		const [sessionStretch] = createSession([template], history);
		if (!sessionStretch) return null;

		currentSession = [...currentSession, sessionStretch];
		return sessionStretch;
	};

	onMount(async () => {
		try {
			history = await fetchHistory();
		} catch (error) {
			console.error(error);
			loadError = 'Could not load history. Changes will not be saved.';
		} finally {
			const effectiveRegimen = getEffectiveRegimen(regimenMode, new Date().getDay());
			const { template, missing } = getRegimenTemplate(data.stretchTemplate, effectiveRegimen);
			regimenMissing = missing;
			currentSession = createSession(template, history);
			resumeActiveTimerFromHistory();
			ready = true;
			pollInterval = setInterval(syncHistory, 15000);
			if (import.meta.env.DEV) {
				startTemplateWatcher();
			}
		}
	});

	onDestroy(() => {
		if (holdTimerInterval) clearInterval(holdTimerInterval);
		if (holdHideTimeout) clearTimeout(holdHideTimeout);
		if (pollInterval) clearInterval(pollInterval);
	});

	async function syncHistory() {
		try {
			const latest = await fetchHistory();
			history = latest;
			const effectiveRegimen = getEffectiveRegimen(regimenMode, new Date().getDay());
			const { template, missing } = getRegimenTemplate(data.stretchTemplate, effectiveRegimen);
			regimenMissing = missing;
			currentSession = mergeInProgressSession(createSession(template, history));
		} catch (error) {
			console.error('Failed to refresh history', error);
			loadError = 'Could not refresh history from server.';
		}

		resumeActiveTimerFromHistory();
	}

	function adjustDuration(stretchIdx: number, holdIdx: number, delta: number) {
		const hold = currentSession[stretchIdx].holds[holdIdx];
		if (hold.completed) return;

		const next = Math.max(0, (hold.durationSeconds || 0) + delta);
		hold.durationSeconds = Math.round(next);
		currentSession = [...currentSession];
	}

	function setDurationFromInput(stretchIdx: number, holdIdx: number, value: number | null) {
		const hold = currentSession[stretchIdx].holds[holdIdx];
		if (hold.completed) return;

		hold.durationSeconds = value === null ? NaN : Math.round(value);
		currentSession = [...currentSession];
	}

	async function handleHoldAction(stretchIdx: number, holdIdx: number) {
		const hold = currentSession[stretchIdx].holds[holdIdx];

		if (!Number.isFinite(hold.durationSeconds) || hold.durationSeconds <= 0) {
			alert('Please enter a valid duration');
			return;
		}

		await startHoldAndLog(stretchIdx, holdIdx);
	}

	async function startHoldAndLog(stretchIdx: number, holdIdx: number) {
		const stretch = currentSession[stretchIdx];
		const hold = stretch.holds[holdIdx];
		if (hold.completed) return;

		const timestamp = new Date().toISOString();
		hold.completed = true;
		hold.timestamp = timestamp;

		const entry: HistoryEntry = {
			stretch: stretch.name,
			holdNumber: hold.holdNumber,
			durationSeconds: hold.durationSeconds,
			timestamp
		};

		history = [entry, ...history];
		currentSession = [...currentSession];

		if (!loadError) {
			try {
				await appendHistory([entry]);
				await syncHistory();
			} catch (error) {
				console.error(error);
				loadError = 'Could not save history. Changes will not be saved.';
			}
		}

		startTimerForEntry(stretchIdx, holdIdx, entry);
	}

	async function undoHold(stretchIdx: number, holdIdx: number) {
		const stretch = currentSession[stretchIdx];
		const hold = stretch.holds[holdIdx];
		if (!hold.completed || !hold.timestamp) return;

		const entry = {
			stretch: stretch.name,
			holdNumber: hold.holdNumber,
			timestamp: hold.timestamp
		};

		try {
			await deleteHistoryEntry(entry);
			loadError = '';
		} catch (error) {
			console.error(error);
			loadError = 'Could not delete entry. History remains unchanged.';
			return;
		}

		const index = history.findIndex(
			(h) =>
				h.stretch === entry.stretch &&
				h.holdNumber === entry.holdNumber &&
				h.timestamp === entry.timestamp
		);

		if (index !== -1) {
			history.splice(index, 1);
			history = [...history];
		}

		hold.completed = false;
		hold.timestamp = null;
		currentSession = [...currentSession];

		if (
			activeHold &&
			activeHold.stretchIdx === stretchIdx &&
			activeHold.holdIdx === holdIdx
		) {
			resetHoldTimer();
		}

		await syncHistory();
	}

	function resetHoldTimer() {
		if (holdTimerInterval) clearInterval(holdTimerInterval);
		if (holdHideTimeout) clearTimeout(holdHideTimeout);

		holdTimerInterval = null;
		holdHideTimeout = null;
		holdTimerStatus = 'idle';
		holdTimeRemaining = 0;
		activeHold = null;
	}

	function startTimerForEntry(
		stretchIdx: number,
		holdIdx: number,
		entry: Pick<HistoryEntry, 'timestamp' | 'durationSeconds'>
	) {
		resetHoldTimer();

		const duration = Math.max(1, Math.round(entry.durationSeconds || DEFAULT_HOLD_SECONDS));
		const startedAt = new Date(entry.timestamp).getTime();
		const endsAt = startedAt + duration * 1000;
		const now = Date.now();

		if (Number.isNaN(startedAt) || endsAt <= now) {
			resetHoldTimer();
			return;
		}

		activeHold = { stretchIdx, holdIdx, endsAt };
		holdTimeRemaining = Math.round((endsAt - now) / 1000);
		holdTimerStatus = holdTimeRemaining <= 5 ? 'warning' : 'active';

		holdTimerInterval = setInterval(() => {
			const remainingMs = (activeHold?.endsAt ?? 0) - Date.now();
			holdTimeRemaining = Math.max(0, Math.round(remainingMs / 1000));

			if (holdTimeRemaining <= 0) {
				holdTimerStatus = 'done';
				if (holdTimerInterval) {
					clearInterval(holdTimerInterval);
					holdTimerInterval = null;
				}

				holdHideTimeout = setTimeout(() => {
					holdTimerStatus = 'idle';
					activeHold = null;
				}, 3000);
			} else if (holdTimeRemaining <= 5) {
				holdTimerStatus = 'warning';
			}
		}, 1000);
	}

	function resumeActiveTimerFromHistory() {
		const now = Date.now();
		const latestActive = history
			.filter((entry) => {
				const started = new Date(entry.timestamp).getTime();
				if (Number.isNaN(started)) return false;
				return started + entry.durationSeconds * 1000 > now;
			})
			.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];

		if (!latestActive) {
			resetHoldTimer();
			return;
		}

		const stretchIdx = currentSession.findIndex((s) => s.name === latestActive.stretch);
		const holdIdx = currentSession[stretchIdx]?.holds.findIndex(
			(h) => h.holdNumber === latestActive.holdNumber
		);

		if (stretchIdx === -1 || holdIdx === undefined || holdIdx === -1) {
			const ensured = ensureStretchInSession(latestActive.stretch);
			if (ensured) {
				const nextStretchIdx = currentSession.findIndex(
					(s) => s.name === latestActive.stretch
				);
				const nextHoldIdx = currentSession[nextStretchIdx]?.holds.findIndex(
					(h) => h.holdNumber === latestActive.holdNumber
				);
				if (nextStretchIdx !== -1 && nextHoldIdx !== undefined && nextHoldIdx !== -1) {
					startTimerForEntry(nextStretchIdx, nextHoldIdx, latestActive);
					return;
				}
			}
			resetHoldTimer();
			return;
		}

		startTimerForEntry(stretchIdx, holdIdx, latestActive);
	}

	function mergeInProgressSession(newSession: SessionStretch[]): SessionStretch[] {
		return newSession.map((stretch) => {
			const current = currentSession.find((s) => s.name === stretch.name);
			if (!current) return stretch;

			const holds = stretch.holds.map((hold) => {
				const currentHold = current.holds.find((h) => h.holdNumber === hold.holdNumber);
				if (!currentHold) return hold;

				if (!hold.completed && !currentHold.completed) {
					const durationSeconds = Number.isFinite(currentHold.durationSeconds)
						? currentHold.durationSeconds
						: hold.durationSeconds;
					return { ...hold, durationSeconds };
				}

				return hold;
			});

			return { ...stretch, holds };
		});
	}

	$: todaysHistory = history.filter(
		(entry) => new Date(entry.timestamp).toDateString() === todayString()
	);

	$: holdTimerLabel =
		holdTimerStatus === 'done'
			? 'Hold complete'
			: `${Math.floor(holdTimeRemaining / 60)}:${String(holdTimeRemaining % 60).padStart(2, '0')}`;

	// Recompute predicate when the active hold changes so rows stay in sync with the timer.
	$: isActiveHold = (stretchIdx: number, holdIdx: number) =>
		activeHold?.stretchIdx === stretchIdx && activeHold?.holdIdx === holdIdx;

	$: totalHolds = currentSession.reduce((sum, stretch) => sum + stretch.holds.length, 0);
	$: completedHolds = currentSession.reduce(
		(sum, stretch) => sum + stretch.holds.filter((hold) => hold.completed).length,
		0
	);
	$: completionPercent = totalHolds === 0 ? 0 : Math.round((completedHolds / totalHolds) * 100);

	const calculateStreak = (entries: HistoryEntry[]) => {
		const timestamps = entries
			.map((entry) => new Date(entry.timestamp).getTime())
			.filter((ts) => !Number.isNaN(ts));
		if (timestamps.length === 0) return { count: 0, hasToday: false };

		const datesWithEntries = new Set(
			timestamps.map((ts) => new Date(ts).toDateString())
		);

		const latestTs = Math.max(...timestamps);
		const cursor = new Date(latestTs);
		let streak = 0;

		while (datesWithEntries.has(cursor.toDateString())) {
			streak += 1;
			cursor.setDate(cursor.getDate() - 1);
		}

		return { count: streak, hasToday: datesWithEntries.has(todayString()) };
	};

	$: streakInfo = calculateStreak(history);
	$: streakDays = streakInfo.count;
	$: streakHasToday = streakInfo.hasToday;
	$: holdLabelsMap = Object.fromEntries(
		data.stretchTemplate.map((stretch) => [stretch.name, stretch.holdLabels ?? []])
	);
	$: weekDay = new Date().getDay();
	$: autoRegimenLabel = shortRegimenDays.has(weekDay)
		? 'Auto (short today)'
		: 'Auto (full today)';
	$: regimenKey = `${regimenMode}-${weekDay}`;
	$: if (ready && regimenKey !== lastRegimenKey) {
		lastRegimenKey = regimenKey;
		const effectiveRegimen = getEffectiveRegimen(regimenMode, weekDay);
		const { template, missing } = getRegimenTemplate(data.stretchTemplate, effectiveRegimen);
		regimenMissing = missing;
		currentSession = mergeInProgressSession(createSession(template, history));
		resumeActiveTimerFromHistory();
	}

	const calculateMonthlyAccordance = (entries: HistoryEntry[]) => {
		const today = new Date();
		const year = today.getFullYear();
		const month = today.getMonth();
		const daysSoFar = today.getDate();

		if (daysSoFar === 0) return 0;

		const datesWithEntries = new Set(
			entries
				.map((entry) => new Date(entry.timestamp))
				.filter((d) => d.getFullYear() === year && d.getMonth() === month)
				.map((d) => d.toDateString())
		);

		return Math.round((datesWithEntries.size / daysSoFar) * 100);
	};

	$: monthlyAccordance = calculateMonthlyAccordance(history);

	async function startTemplateWatcher() {
		const watcher = setInterval(async () => {
			try {
				const res = await fetch('/api/stretch-template-version', { cache: 'no-store' });
				if (!res.ok) return;
				const { version } = (await res.json()) as { version?: number };
				if (typeof version === 'number' && version !== templateVersion) {
					templateVersion = version;
					await invalidateAll();
				}
			} catch (error) {
				console.error('Template watch failed', error);
			}
		}, 2000);

		onDestroy(() => clearInterval(watcher));
	}
</script>

<svelte:head>
	<title>Stretch Logger</title>
</svelte:head>

<div class="page">
	<nav class="navbar">
		<h1>🧘 Stretch Logger</h1>
		<div class="navbar-controls">
			<label class="regimen-select">
				<span>Regimen</span>
				<select bind:value={regimenMode} aria-label="Regimen">
					<option value="auto">{autoRegimenLabel}</option>
					<option value="short">Short</option>
					<option value="full">Full</option>
				</select>
			</label>
			<div class="badges">
				<div class={`summary-pill streak ${streakHasToday ? 'on' : 'off'}`} aria-live="polite">
					<span class="pill-icon">{streakHasToday ? '🔥' : '🕯️'}</span>
					<span>{streakDays} day{streakDays === 1 ? '' : 's'} streak</span>
				</div>
				<div class="summary-pill" aria-live="polite">
					<span class="pill-icon">🎯</span>
					<span>{monthlyAccordance}% month</span>
				</div>
			</div>
		</div>
	</nav>

	{#if !ready}
		<div class="content">
			<p class="loading">Loading your stretches...</p>
		</div>
	{:else}
		<div class="content">
			{#if loadError}
				<div class="alert">{loadError}</div>
			{/if}
			{#if regimenMissing.length}
				<div class="alert">
					Regimen list missing from template: {regimenMissing.join(', ')}
				</div>
			{/if}
			<section class="summary">
				<div class="summary-card">
					<div class="summary-label">Today</div>
					<div class="summary-value">{completionPercent}%</div>
					<div class="summary-sub">
						{completedHolds} / {totalHolds} holds
					</div>
				</div>
				<div class="summary-card">
			<div class="summary-label">Streak</div>
			<div class="summary-value">{streakDays}</div>
			<div class="summary-sub">
				{streakHasToday ? 'On fire' : 'Finish today to keep it lit'}
			</div>
		</div>
				<div class="summary-card">
					<div class="summary-label">Monthly Accordance</div>
					<div class="summary-value">{monthlyAccordance}%</div>
					<div class="summary-sub">This month so far</div>
				</div>
			</section>
			{#each currentSession as stretch, stretchIdx}
				<StretchCard
					{stretch}
					{stretchIdx}
					onAdjustDuration={adjustDuration}
					onSetDuration={setDurationFromInput}
					onLogHold={handleHoldAction}
					onUndoHold={undoHold}
					{isActiveHold}
					timerStatus={holdTimerStatus}
				/>
			{/each}

			<HistoryList entries={todaysHistory} {holdLabelsMap} />
		</div>
	{/if}

	<StretchTimer status={holdTimerStatus} label={holdTimerLabel} />
</div>

<style>
	:global(*) {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}

	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		background: linear-gradient(180deg, #f8fbff 0%, #f4f7fb 40%, #eef2f7 100%);
		padding-bottom: 120px;
		color: #0f172a;
	}

	.page {
		min-height: 100vh;
	}

	.navbar {
		background: #ffffff;
		color: #0f172a;
		padding: 14px 20px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		position: sticky;
		top: 0;
		z-index: 100;
		box-shadow: 0 2px 12px rgba(15, 23, 42, 0.08);
		border-bottom: 1px solid #e2e8f0;
	}

	.navbar h1 {
		font-size: 19px;
		font-weight: 700;
	}

	.navbar-controls {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.regimen-select {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 999px;
		padding: 6px 10px;
		font-size: 12px;
		font-weight: 700;
		color: #334155;
	}

	.regimen-select select {
		border: 0;
		background: transparent;
		font-weight: 700;
		color: #0f172a;
		padding-right: 4px;
		cursor: pointer;
	}

	.regimen-select select:focus {
		outline: none;
	}

	.badges {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.summary-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: #fff7ed;
		color: #9a3412;
		border: 1px solid #fed7aa;
		padding: 8px 12px;
		border-radius: 999px;
		font-weight: 700;
		font-size: 13px;
	}

	.summary-pill.streak.off {
		background: #f8fafc;
		color: #475569;
		border-color: #e2e8f0;
	}

	.summary-pill.streak.on {
		background: #fff7ed;
		color: #9a3412;
		border-color: #fed7aa;
	}

	.pill-icon {
		font-size: 16px;
	}

	.content {
		padding: 16px 12px;
		max-width: 720px;
		margin: 0 auto;
	}

	.loading {
		color: #666;
		text-align: center;
	}

	.alert {
		background: #fff4e5;
		color: #9c4a00;
		border: 1px solid #ffd7a8;
		border-radius: 8px;
		padding: 10px 12px;
		margin-bottom: 12px;
		font-size: 14px;
	}

	.summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 12px;
		margin: 10px 0 14px;
	}

	.summary-card {
		background: white;
		border-radius: 12px;
		padding: 14px 16px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
		border: 1px solid #eef1f6;
	}

	.summary-label {
		font-size: 12px;
		font-weight: 700;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 6px;
	}

	.summary-value {
		font-size: 28px;
		font-weight: 800;
		color: #0f172a;
	}

	.summary-sub {
		margin-top: 4px;
		color: #6b7280;
		font-size: 13px;
	}

	@media (max-width: 540px) {
		.navbar h1 {
			font-size: 17px;
		}

		.content {
			padding: 14px 10px;
		}

		.navbar-controls {
			gap: 8px;
		}

		.regimen-select {
			padding: 5px 8px;
			font-size: 11px;
		}

		.badges {
			gap: 8px;
		}

		.summary-pill {
			padding: 7px 10px;
			font-size: 12px;
		}

		.summary {
			grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		}
	}
</style>
