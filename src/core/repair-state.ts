import { join } from 'node:path';
import { ensureAftermathDirs, safeReadJson, writeJson } from './storage.js';

export interface RepairFingerprintState {
  attempts: number;
  lastRunNumber: number;
  updatedAt: string;
  notes: string[];
}

export interface RepairStateFile {
  schemaVersion: 1;
  byFingerprint: Record<string, RepairFingerprintState>;
}

function statePath(cwd: string): string {
  const dirs = ensureAftermathDirs(cwd);
  return join(dirs.cache, 'repair-state.json');
}

export function loadRepairState(cwd: string): RepairStateFile {
  const existing = safeReadJson<RepairStateFile>(statePath(cwd));
  if (existing?.byFingerprint) return existing;
  return { schemaVersion: 1, byFingerprint: {} };
}

export function getRepairAttempts(cwd: string, fingerprint: string): number {
  if (!fingerprint) return 0;
  return loadRepairState(cwd).byFingerprint[fingerprint]?.attempts ?? 0;
}

export function getRepairNotes(cwd: string, fingerprint: string): string[] {
  if (!fingerprint) return [];
  return loadRepairState(cwd).byFingerprint[fingerprint]?.notes ?? [];
}

/** Increment repair attempt count for a change fingerprint; returns new total. */
export function recordRepairAttempt(
  cwd: string,
  fingerprint: string,
  runNumber: number,
  note?: string,
): number {
  const state = loadRepairState(cwd);
  const key = fingerprint || 'unknown';
  const prev = state.byFingerprint[key];
  const attempts = (prev?.attempts ?? 0) + 1;
  const notes = [...(prev?.notes ?? [])];
  if (note) notes.push(note);
  state.byFingerprint[key] = {
    attempts,
    lastRunNumber: runNumber,
    updatedAt: new Date().toISOString(),
    notes: notes.slice(-20),
  };
  writeJson(statePath(cwd), state);
  return attempts;
}
