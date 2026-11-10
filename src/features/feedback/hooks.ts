import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import type { FeedbackDetail } from '@/api/types';
import { nextCursor } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';
import { api } from '@/services';

import { currentDevice } from './device';
import type { FeedbackDraft } from './model';
import { createFeedbackPublisher, type SubmitStage } from './submit';

/** The viewer's own submissions, newest first. */
export function useMyFeedback() {
  return useInfiniteQuery({
    queryKey: keys.myFeedback,
    queryFn: ({ pageParam }) => api.feedback.mine(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
  });
}

/** One of the viewer's own submissions with the team's replies. */
export function useFeedback(id: string | undefined) {
  return useQuery({
    queryKey: keys.feedback(id ?? ''),
    queryFn: () => api.feedback.get(id!),
    enabled: !!id,
  });
}

/**
 * Sends the form. `stage` says whether screenshots are uploading or the submission is being sent.
 * A second call while one is in flight is ignored, so a double tap can never send twice.
 */
export function useSubmitFeedback() {
  const [publish] = useState(() => createFeedbackPublisher(api, currentDevice));
  const [stage, setStage] = useState<SubmitStage | null>(null);
  // Set synchronously, before React re-renders with `isPending`, so even two taps in one frame send once.
  const inFlight = useRef(false);
  const mutation = useMutation({
    mutationFn: (draft: FeedbackDraft) => publish(draft, setStage),
    onSuccess: (created: FeedbackDetail) => {
      queryClient.setQueryData(keys.feedback(created.id), created);
      void queryClient.invalidateQueries({ queryKey: keys.myFeedback });
    },
    onSettled: () => {
      inFlight.current = false;
      setStage(null);
    },
  });
  const send = (draft: FeedbackDraft) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    mutation.mutate(draft);
    return true;
  };
  return { send, stage, isPending: mutation.isPending, isSuccess: mutation.isSuccess, data: mutation.data, error: mutation.error, reset: mutation.reset };
}
