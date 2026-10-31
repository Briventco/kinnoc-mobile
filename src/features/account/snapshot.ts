import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Account } from '@/api/types';
import { keys, queryClient } from '@/lib/query';

/**
 * The last account the API confirmed, so a returning user sees the app at once instead of waiting
 * on `POST /users/provision` (slow when the API is waking up). It is only a head start: the account
 * is always checked again in the background, and the app follows that answer.
 *
 * Holds the user ID and profile (username, display name), nothing secret; the email comes from
 * the session. Kept only for active accounts, and removed on sign-out.
 */
const KEY = 'kinnoc.account.v1';

/**
 * Whose snapshot may be written: the signed-in session user, set by the auth provider. An account
 * check still in flight at sign-out must not write the previous user's snapshot back afterwards.
 */
let owner: string | null = null;
export function setAccountSnapshotOwner(sessionUserId: string | null) {
  owner = sessionUserId;
}

interface Snapshot {
  /** The signed-in session's user, which is what is known at start-up. */
  sessionUserId: string;
  /** The API's account ID. */
  accountId: string;
  profile: Account['profile'];
}

export async function saveAccountSnapshot(sessionUserId: string, account: Account) {
  if (sessionUserId !== owner) return;
  // A suspended or deactivated account gets no head start, and loses any it had.
  if (account.status !== 'active') return clearAccountSnapshot();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ sessionUserId, accountId: account.id, profile: account.profile } satisfies Snapshot));
  } catch {
    // Only costs the head start next time.
  }
}

export async function clearAccountSnapshot() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * Seeds the account query for this user from the snapshot, marked stale, so the account gate
 * opens immediately and re-checks with the API on mount. Ignored if it belongs to someone else.
 */
export async function restoreAccountSnapshot(sessionUserId: string, email: string) {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const snap = raw ? (JSON.parse(raw) as Partial<Snapshot>) : null;
    if (!snap || snap.sessionUserId !== sessionUserId || !snap.accountId || !snap.profile?.username) return false;
    queryClient.setQueryData<Account>(keys.account, { id: snap.accountId, email, profile: snap.profile, status: 'active' });
    void queryClient.invalidateQueries({ queryKey: keys.account, refetchType: 'none' });
    return true;
  } catch {
    return false;
  }
}
