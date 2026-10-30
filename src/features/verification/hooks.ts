import { useQuery } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';
import type { OwnVerification } from '@/api/types';
import { keys, queryClient } from '@/lib/query';
import { api } from '@/services';

/** Verification changes only when an administrator acts, so a badge stays fresh this long. */
const FRESH_MS = 15 * 60_000;
const KEEP_MS = 60 * 60_000;

const retry = (count: number, error: unknown) => (error instanceof ApiError ? error.retryable : false) && count < 1;

/**
 * Someone's public verification, by username. One cached entry per person, shared by every row,
 * comment and header that shows them, so a feed of ten posts by one author asks once.
 * A failed lookup leaves `data` undefined, which shows no badge.
 */
export function useVerification(username: string | null | undefined) {
  return useQuery({
    queryKey: keys.verification(username ?? ''),
    queryFn: () => api.verification.profile(username!),
    enabled: !!username,
    staleTime: FRESH_MS,
    gcTime: KEEP_MS,
    retry,
  });
}

/** Your own verification, with its status. Also fills the public entry for your username. */
export function useMyVerification(username: string | null | undefined) {
  return useQuery({
    queryKey: keys.myVerification,
    queryFn: async (): Promise<OwnVerification> => {
      const mine = await api.verification.mine();
      if (username) {
        const { isVerified, category, organisation, position, verifiedAt } = mine;
        queryClient.setQueryData(keys.verification(username), { isVerified, category, organisation, position, verifiedAt });
      }
      return mine;
    },
    staleTime: FRESH_MS,
    gcTime: KEEP_MS,
    retry,
  });
}
