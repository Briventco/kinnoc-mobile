import { router, useLocalSearchParams } from 'expo-router';

import { useToast } from '@/components/Toast';
import { useCreateGroup } from '@/features/communities/groupHooks';
import { GroupForm } from '@/features/communities/GroupForm';

export default function CreateGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const create = useCreateGroup(id);
  const toast = useToast();

  return (
    <GroupForm
      title="New group"
      submitLabel="Create"
      initial={{
        name: '',
        description: '',
        joinPolicy: 'open',
        iconName: 'users',
      }}
      submitting={create.isPending}
      onSubmit={(input, { onError }) =>
        create.mutate(input, {
          onSuccess: (group) => {
            toast.show({ message: `${group.name} created`, aboveNav: false });
            router.replace({
              pathname: '/community/[id]/groups/[groupId]',
              params: { id, groupId: group.id },
            });
          },
          onError,
        })
      }
    />
  );
}
