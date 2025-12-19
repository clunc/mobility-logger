<script lang="ts">
	import type { HoldEntry } from '$lib/types';

	export let hold: HoldEntry;
	export let stretchIdx: number;
	export let holdIdx: number;
	export let onAdjustDuration: (stretchIdx: number, holdIdx: number, delta: number) => void;
	export let onSetDuration: (stretchIdx: number, holdIdx: number, value: number | null) => void;
	export let onLogHold: (stretchIdx: number, holdIdx: number) => void;
	export let onUndoHold: (stretchIdx: number, holdIdx: number) => void;
	export let isActiveHold: boolean;
	export let timerStatus: 'idle' | 'active' | 'warning' | 'done';
	export let holdLabel: string | null = null;
	export let totalHolds = 1;

	const durationId = `duration-${stretchIdx}-${holdIdx}`;

	const toNumberOrNull = (value: string) => {
		if (value.trim() === '') return null;
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	};

	function handleDurationInput(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		onSetDuration(stretchIdx, holdIdx, toNumberOrNull(target.value));
	}

	$: isRunning = isActiveHold && ['active', 'warning'].includes(timerStatus);
	$: actionLabel = isRunning ? 'Finish' : 'Start';
	$: actionAriaLabel = isRunning ? 'Finish hold early' : 'Start hold timer';
	$: displayLabel =
		holdLabel ?? (totalHolds > 1 ? `Hold ${hold.holdNumber}` : '');
</script>

<div
	class="set-row"
	class:activeHold={isActiveHold}
	data-state={isActiveHold ? timerStatus : 'idle'}
>
	{#if displayLabel}
		<div class="set-number">{displayLabel}</div>
	{/if}

	<div class="set-inputs">
		<div class="set-input-group">
			<label class="set-input-label" for={durationId}>Duration (sec)</label>
			<div class="input-with-buttons">
				<button
					class="adjust-btn"
					on:click={() => onAdjustDuration(stretchIdx, holdIdx, -5)}
					disabled={hold.completed || isRunning}
					type="button"
				>
					−
				</button>
				<input
					type="number"
					step="5"
					class="set-input"
					class:completed={hold.completed}
					value={Number.isFinite(hold.durationSeconds) ? hold.durationSeconds : ''}
					min="0"
					readonly={hold.completed || isRunning}
					inputmode="numeric"
					id={durationId}
					on:input={handleDurationInput}
				/>
				<button
					class="adjust-btn"
					on:click={() => onAdjustDuration(stretchIdx, holdIdx, 5)}
					disabled={hold.completed || isRunning}
					type="button"
				>
					+
				</button>
			</div>
		</div>

		<div class="set-actions">
			{#if hold.completed}
				<button
					class="log-btn undo-btn"
					aria-label="Undo hold"
					on:click={() => onUndoHold(stretchIdx, holdIdx)}
					type="button"
				>
					Undo
				</button>
			{:else}
					<button
						class="log-btn"
						class:active={isRunning}
						aria-label={actionAriaLabel}
						on:click={() => onLogHold(stretchIdx, holdIdx)}
						type="button"
					>
						{actionLabel}
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.set-row {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 6px;
		border-bottom: 1px solid #f0f0f0;
		position: relative;
		border-radius: 10px;
	}

	.set-row:last-child {
		border-bottom: none;
	}

	.activeHold {
		border-radius: 14px;
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
		padding: 14px 8px;
		transition: background 0.14s ease, box-shadow 0.2s ease;
	}

	.activeHold::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 6px;
		border-radius: 10px 0 0 10px;
		transition: background 0.14s ease;
	}

	.activeHold[data-state='active'] {
		background: #e8f0ff;
		box-shadow: 0 10px 22px rgba(59, 130, 246, 0.25);
	}

	.activeHold[data-state='active']::before {
		background: #1d4ed8;
	}

	.activeHold[data-state='active'] .set-input {
		background: #eff6ff;
		border-color: #93c5fd;
		box-shadow: inset 0 1px 4px rgba(59, 130, 246, 0.18);
	}

	.activeHold[data-state='active'] .log-btn {
		background: #2563eb;
		box-shadow: 0 3px 10px rgba(37, 99, 235, 0.32);
	}

	.activeHold[data-state='active'] .set-number {
		color: #1d4ed8;
	}

	.activeHold[data-state='warning'] {
		background: #fff7ed;
		box-shadow: 0 10px 22px rgba(249, 115, 22, 0.24);
	}

	.activeHold[data-state='warning']::before {
		background: #ea580c;
	}

	.activeHold[data-state='warning'] .set-input {
		background: #fff1e6;
		border-color: #fdba74;
		box-shadow: inset 0 1px 4px rgba(234, 88, 12, 0.14);
	}

	.activeHold[data-state='warning'] .log-btn {
		background: #f97316;
		box-shadow: 0 3px 10px rgba(249, 115, 22, 0.28);
	}

	.activeHold[data-state='warning'] .set-number {
		color: #ea580c;
	}

	.activeHold[data-state='done'] {
		background: #ecfdf3;
		box-shadow: 0 10px 22px rgba(34, 197, 94, 0.24);
	}

	.activeHold[data-state='done']::before {
		background: #16a34a;
	}

	.activeHold[data-state='done'] .set-input {
		background: #f0fdf4;
		border-color: #86efac;
		box-shadow: inset 0 1px 4px rgba(22, 163, 74, 0.14);
	}

	.activeHold[data-state='done'] .log-btn {
		background: #22c55e;
		box-shadow: 0 3px 10px rgba(34, 197, 94, 0.24);
	}

	.activeHold[data-state='done'] .set-number {
		color: #16a34a;
	}

	.set-number {
		font-weight: 700;
		color: #233143;
		font-size: 14px;
		letter-spacing: 0.02em;
	}

	.set-actions {
		display: flex;
		justify-content: center;
		align-items: center;
		align-self: stretch;
		min-width: 64px;
	}

	.set-inputs {
		display: grid;
		grid-template-columns: minmax(160px, 1fr) 76px;
		gap: 8px;
		width: 100%;
		align-items: center;
	}

	.set-input-group {
		display: flex;
		flex-direction: column;
		position: relative;
		gap: 6px;
		min-width: 0;
	}

	.set-input-label {
		font-size: 12px;
		color: #5f6b7a;
		font-weight: 600;
	}

	.input-with-buttons {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.adjust-btn {
		background: #007aff;
		color: white;
		border: none;
		width: 44px;
		height: 44px;
		border-radius: 10px;
		font-size: 18px;
		font-weight: 700;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		padding: 0;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12);
		transition: transform 0.08s ease, box-shadow 0.12s ease;
	}

	.adjust-btn:active {
		background: #0051d5;
		transform: translateY(1px);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
	}

	.adjust-btn:disabled {
		background: #c8cdd6;
		cursor: not-allowed;
		box-shadow: none;
	}

	.set-input {
		flex: 1;
		padding: 12px 10px;
		border: 1px solid #d8dde6;
		border-radius: 12px;
		font-size: 18px;
		text-align: center;
		min-width: 90px;
		width: 100%;
		min-height: 48px;
		color: #18212f;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
		appearance: textfield;
		box-sizing: border-box;
	}

	.set-input::-webkit-outer-spin-button,
	.set-input::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.set-input:focus {
		outline: none;
		border-color: #007aff;
		box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
	}

	.set-input.completed {
		background: #e8f5e9;
		border-color: #4caf50;
	}

	.log-btn {
		background: #007aff;
		color: white;
		border: none;
		padding: 0 14px;
		min-width: 64px;
		height: 44px;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12);
		transition: transform 0.08s ease, box-shadow 0.12s ease;
		position: relative;
	}

	.log-btn:active {
		background: #0051d5;
		transform: translateY(1px);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
	}

	.log-btn.undo-btn {
		background: #ff3b30;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12);
	}

	.log-btn.active {
		background: #0f766e;
	}

	.log-btn.undo-btn:active {
		background: #d32f2f;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
	}

	.log-btn:disabled {
		background: #c8cdd6;
		cursor: not-allowed;
		box-shadow: none;
	}

	@media (max-width: 540px) {
		.set-inputs {
			grid-template-columns: minmax(140px, 1fr) 76px;
			column-gap: 6px;
			row-gap: 8px;
		}

		.set-actions {
			align-self: center;
		}

		.adjust-btn,
		.log-btn {
			height: 44px;
			border-radius: 10px;
			font-size: 13px;
		}

		.set-input {
			font-size: 17px;
			min-height: 46px;
			min-width: 80px;
		}
	}

	@media (max-width: 420px) {
		.set-inputs {
			grid-template-columns: minmax(140px, 1fr) 70px;
			column-gap: 4px;
		}

		.input-with-buttons {
			gap: 4px;
		}

		.log-btn {
			height: 40px;
			border-radius: 9px;
			font-size: 12px;
		}

		.set-input {
			min-width: 60px;
			min-height: 44px;
			font-size: 16px;
			padding: 10px 8px;
		}
	}
</style>
