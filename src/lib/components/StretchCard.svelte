<script lang="ts">
	import type { SessionStretch } from '$lib/types';
	import HoldRow from './HoldRow.svelte';

	export let stretch: SessionStretch;
	export let stretchIdx: number;
	export let onAdjustDuration: (stretchIdx: number, holdIdx: number, delta: number) => void;
	export let onSetDuration: (stretchIdx: number, holdIdx: number, value: number | null) => void;
	export let onLogHold: (stretchIdx: number, holdIdx: number) => void;
	export let onUndoHold: (stretchIdx: number, holdIdx: number) => void;
	export let isActiveHold: (stretchIdx: number, holdIdx: number) => boolean;
	export let timerStatus: 'idle' | 'active' | 'warning' | 'done';
</script>

<section class="card">
	<header class="card-header">
		<div>
			<div class="card-title">{stretch.name}</div>
			<div class="card-subtitle">
				{stretch.holds.filter((hold) => hold.completed).length} of {stretch.holds.length} holds completed
			</div>
		</div>
	</header>

	<div class="card-body">
		{#each stretch.holds as hold, holdIdx}
			<HoldRow
				{hold}
				{holdIdx}
				{stretchIdx}
				{onAdjustDuration}
				{onSetDuration}
				{onLogHold}
				{onUndoHold}
				isActiveHold={isActiveHold(stretchIdx, holdIdx)}
				{timerStatus}
			/>
		{/each}
	</div>
</section>

<style>
	.card {
		background: white;
		border-radius: 12px;
		margin-bottom: 15px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
		overflow: hidden;
		border: 1px solid #eef1f6;
	}

	.card-header {
		padding: 14px 16px;
		border-bottom: 1px solid #f3f4f6;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.card-title {
		font-size: 18px;
		font-weight: 600;
		margin-bottom: 4px;
		color: #172133;
	}

	.card-subtitle {
		font-size: 13px;
		color: #999;
	}

	.card-body {
		padding: 8px 12px 4px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
</style>
