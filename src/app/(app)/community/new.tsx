import { router } from 'expo-router';

import { useToast } from '@/components/Toast';
import { CommunityForm } from '@/features/communities/CommunityForm';
import { useCreateCommunity } from '@/features/communities/hooks';

export default function NewCommunity() {
  const create = useCreateCommunity();
  const toast = useToast();
  return (
    <CommunityForm
      title="New community"
      submitLabel="Create"
      initial={{ name: '', description: '', category: null, visibility: 'public', joinPolicy: 'open' }}
      submitting={create.isPending}
      onSubmit={(input, { onError }) =>
        create.mutate(input, {
          onSuccess: (community) => {
            toast.show({ message: `${community.name} is ready. Invite people to join.`, aboveNav: false });
            router.dismiss();
            router.push({ pathname: '/community/[id]/info', params: { id: community.id } });
          },
          onError,
        })
      }
    />
  );
}
