import { promises as fs } from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import type { HistoryEntry } from '$lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'stretch.db');

async function ensureDbFile() {
	await fs.mkdir(DATA_DIR, { recursive: true });
	await fs.access(DB_FILE).catch(async () => {
		await fs.writeFile(DB_FILE, '');
	});
}

function initDb() {
	const db = new Database(DB_FILE);
	db.pragma('journal_mode = WAL');
	db.exec(`
		CREATE TABLE IF NOT EXISTS history (
			stretch TEXT NOT NULL,
			holdNumber INTEGER NOT NULL,
			durationSeconds INTEGER NOT NULL,
			timestamp TEXT NOT NULL,
			PRIMARY KEY (stretch, holdNumber, timestamp)
		)
	`);
	return db;
}

export async function readHistory(): Promise<HistoryEntry[]> {
	await ensureDbFile();
	const db = initDb();
	const rows = db
		.prepare(
			`SELECT stretch, holdNumber, durationSeconds, timestamp FROM history ORDER BY datetime(timestamp) DESC`
		)
		.all();
	db.close();
	return rows as HistoryEntry[];
}

export async function appendHistory(entries: HistoryEntry[]): Promise<void> {
	await ensureDbFile();
	const db = initDb();
	const insert = db.prepare(
		`INSERT INTO history (stretch, holdNumber, durationSeconds, timestamp) VALUES (@stretch, @holdNumber, @durationSeconds, @timestamp)`
	);

	const transaction = db.transaction((toInsert: HistoryEntry[]) => {
		for (const entry of toInsert) {
			insert.run(entry);
		}
	});

	transaction(entries);
	db.close();
}

export async function deleteTodayEntry({
	stretch,
	holdNumber,
	timestamp
}: {
	stretch: string;
	holdNumber: number;
	timestamp: string;
}): Promise<number> {
	await ensureDbFile();
	const db = initDb();

	const stmt = db.prepare(
		`DELETE FROM history WHERE stretch = ? AND holdNumber = ? AND timestamp = ?`
	);
	const result = stmt.run(stretch, holdNumber, timestamp);
	db.close();

	return result.changes ?? 0;
}
