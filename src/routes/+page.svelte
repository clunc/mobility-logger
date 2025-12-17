<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import StretchCard from '$lib/components/StretchCard.svelte';
	import HistoryList from '$lib/components/HistoryList.svelte';
	import StretchTimer from '$lib/components/StretchTimer.svelte';
	import { appendHistory, deleteHistoryEntry, fetchHistory } from '$lib/api/history';
	import { createSession, DEFAULT_HOLD_SECONDS, todayString } from '$lib/stretch';
	import type { HistoryEntry, SessionStretch } from '$lib/types';

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
			currentSession = createSession(history);
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
			currentSession = mergeInProgressSession(createSession(history));
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
</script>

<svelte:head>
	<title>Stretch Logger</title>
</svelte:head>

<div class="page">
	<nav class="navbar">
		<h1>🧘 Stretch Logger</h1>
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

			<HistoryList entries={todaysHistory} />
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

	@media (max-width: 540px) {
		.navbar h1 {
			font-size: 17px;
		}

		.content {
			padding: 14px 10px;
		}
	}
</style>
