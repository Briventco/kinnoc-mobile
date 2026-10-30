import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import { ScreenHeader } from '@/components/Header';
import { CenteredSpinner, ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { CommunityForm } from '@/features/communities/CommunityForm';
import { useCommunity, useUpdateCommunity } from '@/features/communities/hooks';
import { colors } from '@/theme';

/** Owner only; the API refuses anyone else. The address (slug) cannot change. */
export default function EditCommunity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const community = useCommunity(id);
  const update = useUpdateCommunity(id);
  const toast = useToast();

  if (community.isPending) return <CenteredSpinner />;
  if (community.isError || community.data.role !== 'owner') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader title="Edit community" />
        <ErrorState error={community.error ?? new ApiError('forbidden', 'Only the owner can edit this community.', 403)} onRetry={community.isError ? () => community.refetch() : undefined} />
      </SafeAreaView>
    );
  }

  const c = community.data;
  return (
    <CommunityForm
      title="Edit community"
      submitLabel="Save"
      initial={{ name: c.name, description: c.description, category: c.categorySlug, visibility: c.visibility, joinPolicy: c.joinPolicy }}
      initialImages={{ avatarUrl: c.photoUrl, coverUrl: c.coverUrl }}
      submitting={update.isPending}
      onSubmit={(input, { onError }) =>
        update.mutate(input, {
          onSuccess: () => {
            toast.show({ message: 'Community updated', aboveNav: false });
            router.back();
          },
          onError,
        })
      }
    />
  );
}
