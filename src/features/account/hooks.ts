import { useMutation, useQuery } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';
import type { CreateProfileInput } from '@/api/types';
import { keys, queryClient } from '@/lib/query';
import { api } from '@/services';

/**
 * The signed-in account, provisioned on the API. Loaded once per sign-in; the API's
 * `POST /users/provision` is idempotent and keeps the email in sync with Supabase.
 */
export function useAccount(enabled: boolean) {
  return useQuery({
    queryKey: keys.account,
    queryFn: () => api.account.load(),
    enabled,
    staleTime: Infinity,
    retry: (count, error) => (error instanceof ApiError ? error.retryable : true) && count < 3,
  });
}

export function useCreateProfile() {
  return useMutation({
    mutationFn: (input: CreateProfileInput) => api.account.createProfile(input),
    onSuccess: (account) => {
      queryClient.setQueryData(keys.account, account);
      void queryClient.invalidateQueries({ queryKey: keys.me });
    },
  });
}
