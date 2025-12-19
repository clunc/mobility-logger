<script lang="ts">
	export let status: 'idle' | 'active' | 'warning' | 'done' = 'idle';
	export let label: string;

	let prevStatus: typeof status = status;

	// Trigger vibration once when a hold timer completes.
	$: if (status === 'done' && prevStatus !== 'done') {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
			navigator.vibrate([220, 90, 220]);
		}
	}

	$: prevStatus = status;
</script>

{#if status !== 'idle'}
	<div class={`stretch-timer ${status}`} aria-live="polite">
		{label}
	</div>
{/if}

<style>
	.stretch-timer {
		position: fixed;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		background: #007aff;
		color: white;
		padding: 14px 28px;
		border-radius: 999px;
		font-size: 22px;
		font-weight: 600;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 1000;
		min-width: 120px;
		max-width: min(360px, calc(100% - 28px));
		width: max-content;
		text-align: center;
	}

	.stretch-timer.warning {
		background: #ff9500;
	}

	.stretch-timer.done {
		background: #4caf50;
	}

	@media (max-width: 540px) {
		.stretch-timer {
			padding: 12px 20px;
			font-size: 18px;
			width: calc(100% - 24px);
		}
	}
</style>
