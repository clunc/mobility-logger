<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import StretchCard from '$lib/components/StretchCard.svelte';
	import HistoryList from '$lib/components/HistoryList.svelte';
	import StretchTimer from '$lib/components/StretchTimer.svelte';
	import { appendHistory, deleteHistoryEntry, fetchHistory } from '$lib/api/history';
	import { createSession, DEFAULT_HOLD_SECONDS, todayString } from '$lib/stretch';
	import type { HistoryEntry, SessionStretch } from '$lib/types';
	import type { PageData } from './$types';

	export let data: PageData;

	let history: HistoryEntry[] = [];
	let currentSession: SessionStretch[] = [];
	let holdTimeRemaining = 0;
	let holdTimerStatus: 'idle' | 'active' | 'warning' | 'done' = 'idle';
	let holdTimerInterval: ReturnType<typeof setInterval> | null = null;
	let holdHideTimeout: ReturnType<typeof setTimeout> | null = null;
	let activeHold: { stretchIdx: number; holdIdx: number } | null = null;
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let ready = false;
	let loadError = '';

	onMount(async () => {
		try {
			history = await fetchHistory();
		} catch (error) {
			console.error(error);
			loadError = 'Could not load history. Changes will not be saved.';
		} finally {
			currentSession = createSession(data.stretchTemplate, history);
			ready = true;
			pollInterval = setInterval(syncHistory, 15000);
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
			currentSession = mergeInProgressSession(createSession(data.stretchTemplate, history));
		} catch (error) {
			console.error('Failed to refresh history', error);
			loadError = 'Could not refresh history from server.';
		}
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

		if (
			activeHold &&
			activeHold.stretchIdx === stretchIdx &&
			activeHold.holdIdx === holdIdx &&
			(holdTimerStatus === 'active' || holdTimerStatus === 'warning')
		) {
			await finishHoldEarly(stretchIdx, holdIdx);
			return;
		}

		startHoldTimer(stretchIdx, holdIdx);
	}

	async function completeHold(stretchIdx: number, holdIdx: number) {
		const stretch = currentSession[stretchIdx];
		const hold = stretch.holds[holdIdx];
		if (hold.completed) return;

		hold.completed = true;
		hold.timestamp = new Date().toISOString();

		const entry: HistoryEntry = {
			stretch: stretch.name,
			holdNumber: hold.holdNumber,
			durationSeconds: hold.durationSeconds,
			timestamp: hold.timestamp
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

		if (!loadError) {
			await syncHistory();
		}
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

	function startHoldTimer(stretchIdx: number, holdIdx: number) {
		resetHoldTimer();

		const hold = currentSession[stretchIdx].holds[holdIdx];
		if (!Number.isFinite(hold.durationSeconds) || hold.durationSeconds <= 0) {
			alert('Please enter a valid duration');
			return;
		}

		holdTimeRemaining = Math.max(1, Math.round(hold.durationSeconds || DEFAULT_HOLD_SECONDS));
		holdTimerStatus = holdTimeRemaining <= 5 ? 'warning' : 'active';
		activeHold = { stretchIdx, holdIdx };

		holdTimerInterval = setInterval(() => {
			holdTimeRemaining -= 1;

			if (holdTimeRemaining <= 0) {
				holdTimeRemaining = 0;
				holdTimerStatus = 'done';
				clearInterval(holdTimerInterval!);
				holdTimerInterval = null;

				if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
					navigator.vibrate([200, 100, 200]);
				}

				void completeHold(stretchIdx, holdIdx);

				holdHideTimeout = setTimeout(() => {
					holdTimerStatus = 'idle';
					activeHold = null;
				}, 3000);
			} else if (holdTimeRemaining <= 5) {
				holdTimerStatus = 'warning';
			}
		}, 1000);
	}

	async function finishHoldEarly(stretchIdx: number, holdIdx: number) {
		if (holdTimerInterval) clearInterval(holdTimerInterval);
		if (holdHideTimeout) clearTimeout(holdHideTimeout);

		holdTimerInterval = null;
		holdHideTimeout = null;
		holdTimeRemaining = 0;
		holdTimerStatus = 'done';

		await completeHold(stretchIdx, holdIdx);

		holdHideTimeout = setTimeout(() => {
			holdTimerStatus = 'idle';
			activeHold = null;
		}, 3000);
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

	const isActiveHold = (stretchIdx: number, holdIdx: number) =>
		activeHold?.stretchIdx === stretchIdx && activeHold?.holdIdx === holdIdx;

	$: totalHolds = currentSession.reduce((sum, stretch) => sum + stretch.holds.length, 0);
	$: completedHolds = currentSession.reduce(
		(sum, stretch) => sum + stretch.holds.filter((hold) => hold.completed).length,
		0
	);
	$: completionPercent = totalHolds === 0 ? 0 : Math.round((completedHolds / totalHolds) * 100);

	const calculateStreak = (entries: HistoryEntry[]) => {
		const datesWithEntries = new Set(entries.map((entry) => new Date(entry.timestamp).toDateString()));
		let streak = 0;
		const cursor = new Date();

		while (datesWithEntries.has(cursor.toDateString())) {
			streak += 1;
			cursor.setDate(cursor.getDate() - 1);
		}

		return streak;
	};

	$: streakDays = calculateStreak(history);
	$: holdLabelsMap = Object.fromEntries(
		data.stretchTemplate.map((stretch) => [stretch.name, stretch.holdLabels ?? []])
	);

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
</script>

<svelte:head>
	<title>Stretch Logger</title>
</svelte:head>

<div class="page">
	<nav class="navbar">
		<h1>🧘 Stretch Logger</h1>
			<div class="badges">
				<div class="summary-pill" aria-live="polite">
					<span class="pill-icon">🔥</span>
					<span>{streakDays} day{streakDays === 1 ? '' : 's'} streak</span>
				</div>
				<div class="summary-pill" aria-live="polite">
					<span class="pill-icon">🎯</span>
					<span>{monthlyAccordance}% month</span>
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
						{streakDays === 0 ? 'Start today' : 'Keep it going'}
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
