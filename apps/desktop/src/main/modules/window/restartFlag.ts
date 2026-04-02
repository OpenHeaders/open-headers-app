/**
 * Restart-hidden flag — one-shot file that tells the next app launch
 * to keep the window hidden (preserving the user's current state).
 *
 * Written before quitAndInstall / app.relaunch when the window is hidden.
 * Read + deleted on startup in the ready-to-show handler.
 *
 * Staleness guard: if the flag is older than 60 seconds it is ignored
 * and deleted, preventing a crash-during-restart from leaving the app
 * permanently hidden.
 *
 * Uses direct fs calls (not atomicWriter) because:
 *  - Write happens during shutdown — atomicWriter's lock acquisition and
 *    retry loop could delay or block the quit.
 *  - There is no concurrent reader — the flag is written once at shutdown
 *    and consumed once at the next startup.
 *  - The flag is non-critical — if the write fails, the only consequence
 *    is the window showing on restart (safe default).
 */

import fs from 'node:fs';
import path from 'node:path';
import electron from 'electron';
import mainLogger from '@/utils/mainLogger';

const { app } = electron;
const { createLogger } = mainLogger;
const log = createLogger('RestartFlag');

const FLAG_NAME = '.restart-hidden';
const MAX_AGE_MS = 60_000;

function getFlagPath(): string {
  return path.join(app.getPath('userData'), FLAG_NAME);
}

export function writeRestartHiddenFlag(): void {
  try {
    fs.writeFileSync(getFlagPath(), Date.now().toString(), 'utf8');
    log.info('Wrote .restart-hidden flag');
  } catch (err) {
    log.error('Failed to write .restart-hidden flag:', err);
  }
}

export function consumeRestartHiddenFlag(): boolean {
  const flagPath = getFlagPath();
  try {
    const content = fs.readFileSync(flagPath, 'utf8');

    // Delete the flag — best-effort; if it fails the staleness guard
    // will prevent it from being honoured on a subsequent launch.
    try {
      fs.unlinkSync(flagPath);
    } catch (unlinkErr) {
      log.warn('Failed to delete .restart-hidden flag (will expire via staleness guard):', unlinkErr);
    }

    const timestamp = parseInt(content, 10);
    if (Number.isNaN(timestamp)) {
      log.warn('Stale .restart-hidden flag (invalid content), ignoring');
      return false;
    }

    const age = Date.now() - timestamp;
    if (age > MAX_AGE_MS) {
      log.warn(`Stale .restart-hidden flag (${Math.round(age / 1000)}s old), ignoring`);
      return false;
    }

    log.info('Consumed .restart-hidden flag, will keep window hidden');
    return true;
  } catch {
    // File doesn't exist — normal case
    return false;
  }
}
