import { useMutation, useQuery } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';
import type { CreateProfileInput } from '@/api/types';
import { keys, queryClient } from '@/lib/query';
import { api } from '@/services';

import { saveAccountSnapshot } from './snapshot';

/**
 * The signed-in account, provisioned on the API. Loaded once per sign-in; the API's
 * `POST /users/provision` is idempotent and keeps the email in sync with Supabase.
 */
export function useAccount(sessionUserId: string | null) {
  return useQuery({
    queryKey: keys.account,
    queryFn: async () => {
      const account = await api.account.load();
      if (sessionUserId) void saveAccountSnapshot(sessionUserId, account);
      return account;
    },
    enabled: !!sessionUserId,
    staleTime: Infinity,
    retry: (count, error) => (error instanceof ApiError ? error.retryable : true) && count < 3,
  });
}

export function useCreateProfile(sessionUserId: string | null) {
  return useMutation({
    mutationFn: (input: CreateProfileInput) => api.account.createProfile(input),
    onSuccess: (account) => {
      queryClient.setQueryData(keys.account, account);
      if (sessionUserId) void saveAccountSnapshot(sessionUserId, account);
      void queryClient.invalidateQueries({ queryKey: keys.me });
    },
  });
}
