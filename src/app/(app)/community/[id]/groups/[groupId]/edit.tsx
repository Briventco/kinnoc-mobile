import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import { ScreenHeader } from '@/components/Header';
import { CenteredSpinner, ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useCommunityGroup, useUpdateGroup } from '@/features/communities/groupHooks';
import { GroupForm } from '@/features/communities/GroupForm';
import type { GroupIconName } from '@/features/communities/GroupRow';
import { colors } from '@/theme';

const VALID_ICONS = new Set<GroupIconName>(['users', 'messages-square', 'megaphone', 'shield', 'sparkles']);

export default function EditGroupScreen() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId: string }>();
  const group = useCommunityGroup(id, groupId);
  const update = useUpdateGroup(id, groupId);
  const toast = useToast();

  if (group.isPending) return <CenteredSpinner />;
  if (group.isError || !group.data.permissions.canEdit) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader title="Edit group" />
        <ErrorState
          error={group.error ?? new ApiError('forbidden', 'You do not have permission to edit this group.', 403)}
          onRetry={group.isError ? () => void group.refetch() : undefined}
        />
      </SafeAreaView>
    );
  }

  const g = group.data;
  const iconName: GroupIconName =
    g.iconName && VALID_ICONS.has(g.iconName as GroupIconName) ? (g.iconName as GroupIconName) : 'users';

  return (
    <GroupForm
      title="Edit group"
      submitLabel="Save"
      initial={{
        name: g.name,
        description: g.description,
        joinPolicy: g.joinPolicy,
        iconName,
      }}
      initialAvatarUrl={g.photoUrl}
      submitting={update.isPending}
      onSubmit={(input, { onError }) =>
        update.mutate(input, {
          onSuccess: () => {
            toast.show({ message: 'Group updated', aboveNav: false });
            router.back();
          },
          onError,
        })
      }
    />
  );
}
