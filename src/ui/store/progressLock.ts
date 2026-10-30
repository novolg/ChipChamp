/** Shared by curriculum, hand receipts, daily results and resets. Never nest. */
export const PROGRESS_LOCK = 'chipchamp-progress';
export type SaveResult = boolean | Promise<boolean>;

export function withProgressLock(write: () => boolean, failed: () => boolean): SaveResult {
  // Headless unit tests have no competing browser tabs.
  if (typeof navigator === 'undefined') return write();
  // Fail closed instead of silently performing a racy read/modify/write.
  if (!navigator.locks) return failed();
  try {
    return navigator.locks.request(PROGRESS_LOCK, write).catch(failed);
  } catch {
    return failed();
  }
}
