import { useCallback, useMemo } from 'react';
import { readSlot, writeSlot, useSaveStatus } from '../../../platform/local-save';
import type { Franchise } from './franchise';
/** Same game-facing contract; device persistence replaces account requests only in this edition. */
export function useFranchiseSave() {
  const { loaded, pending, error, revision } = useSaveStatus();
  const state = useMemo(() => loaded ? readSlot('franchise') : null, [loaded, revision]);
  const commit = useCallback((next: Franchise) => writeSlot('franchise', next), []);
  const retry = useCallback(() => { window.location.reload(); }, []);
  return { state, loading: !loaded, error,
    syncing: pending > 0, syncFailure: false, commit, retry };
}
