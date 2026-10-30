import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { CenteredSpinner, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { AuthScaffold, AuthSwitch } from '@/features/auth/AuthScaffold';
import { validateName, validateUsername } from '@/features/auth/validation';
import { useCategories } from '@/features/communities/hooks';
import { useSetInterests } from '@/features/profile/hooks';
import { InterestPicker } from '@/features/profile/InterestPicker';
import { api } from '@/services';
import { colors, gutter, space } from '@/theme';

import { useAccount, useCreateProfile } from './hooks';

/**
 * Shown between sign-in and the app: makes sure the API knows this account and that it has a
 * profile, which creating and joining communities require.
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const { status, signOut } = useAuth();
  const account = useAccount(status === 'signedIn');
  // Right after a profile is created, offer interests once before the app opens.
  const [pickInterests, setPickInterests] = useState(false);

  if (account.isPending) return <Connecting onSignOut={() => void signOut()} />;
  if (account.isError) {
    const blocked = account.error instanceof ApiError && account.error.code === 'forbidden';
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.problem}>
          <Text variant="pageTitle">{blocked ? "You can't use Kinnoc right now" : "We couldn't load your account"}</Text>
          <ErrorState error={account.error} onRetry={blocked ? undefined : () => account.refetch()} style={styles.error} />
          <Button label="Sign out" variant="quiet" onPress={() => void signOut()} />
        </View>
      </SafeAreaView>
    );
  }
  if (!account.data.profile) return <CreateProfile onCreated={() => setPickInterests(api.capabilities.interestCatalogue)} />;
  if (pickInterests) return <PickInterests onDone={() => setPickInterests(false)} />;
  return <>{children}</>;
}

/** After this long, loading explains itself and offers a way out instead of spinning silently. */
const SLOW_MS = 8000;

function Connecting({ onSignOut }: { onSignOut: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <SafeAreaView style={styles.root}>
      <CenteredSpinner />
      {slow ? (
        <View style={styles.slow} accessibilityLiveRegion="polite">
          <Text variant="post" color="textSecondary" style={styles.slowText}>
            Still connecting. This can take up to a minute when the server is waking up or your connection is slow.
          </Text>
          <Button label="Sign out" variant="text" onPress={onSignOut} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/** Onboarding: the API keeps usernames on the profile, not in sign-up metadata. */
function CreateProfile({ onCreated }: { onCreated: () => void }) {
  const { session, signOut } = useAuth();
  const create = useCreateProfile();
  const [values, setValues] = useState({
    displayName: session?.user.displayName ?? '',
    username: session?.user.username ?? '',
  });
  const [errors, setErrors] = useState<{ displayName?: string | null; username?: string | null }>({});

  const submit = () => {
    if (create.isPending) return;
    const next = { displayName: validateName(values.displayName), username: validateUsername(values.username) };
    setErrors(next);
    if (next.displayName || next.username) return;
    create.mutate(
      { displayName: values.displayName.trim(), username: values.username.trim().toLowerCase() },
      {
        onSuccess: onCreated,
        onError: (e) => {
          if (e instanceof ApiError && e.serverCode === 'USERNAME_TAKEN') setErrors({ username: 'That username is taken. Try another.' });
          else if (e instanceof ApiError && Object.keys(e.fields).length) setErrors({ displayName: e.fields.displayName, username: e.fields.username });
        },
      },
    );
  };

  const unexpected = create.error && !(create.error instanceof ApiError && (create.error.serverCode === 'USERNAME_TAKEN' || Object.keys(create.error.fields).length));

  return (
    <AuthScaffold
      back={false}
      title="Set up your profile"
      intro="This is how people in your communities will see you. You can change your name later."
      footer={
        <AuthSwitch question="Not you?">
          <Button label="Sign out" variant="text" onPress={() => void signOut()} />
        </AuthSwitch>
      }
    >
      <TextField
        label="Name"
        value={values.displayName}
        onChangeText={(displayName) => setValues((v) => ({ ...v, displayName }))}
        error={errors.displayName ?? undefined}
        autoComplete="name"
        textContentType="name"
        maxLength={60}
      />
      <TextField
        label="Username"
        helper="3 to 30 letters, numbers or underscores, starting with a letter."
        value={values.username}
        onChangeText={(username) => setValues((v) => ({ ...v, username }))}
        error={errors.username ?? undefined}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="username"
        maxLength={30}
      />
      {unexpected ? (
        <Text variant="preview" color="warning">
          {describeError(create.error)}
        </Text>
      ) : null}
      <Button label="Continue" size="large" onPress={submit} loading={create.isPending} />
    </AuthScaffold>
  );
}

/** Optional, once, after the profile is created: interests shape Discover and the profile. */
function PickInterests({ onDone }: { onDone: () => void }) {
  const save = useSetInterests();
  const categories = useCategories();
  const [picked, setPicked] = useState<string[]>([]);
  const hasNoCategories = categories.isSuccess && categories.data.length === 0;

  return (
    <AuthScaffold
      back={false}
      title="What are you into?"
      intro="Pick a few interests so Kinnoc can show you the right communities and opportunities. You can change them any time."
      footer={<Button label="Skip for now" variant="text" subdued onPress={onDone} disabled={save.isPending} style={styles.skip} />}
    >
      {save.isError ? <ErrorState error={save.error} style={styles.error} /> : null}
      <InterestPicker picked={picked} onChange={setPicked} label={null} />
      {hasNoCategories ? (
        <Button label="Continue to Kinnoc" size="large" onPress={onDone} />
      ) : (
        <Button
          label="Continue"
          size="large"
          loading={save.isPending}
          disabled={!picked.length}
          onPress={() => save.mutate(picked, { onSuccess: onDone })}
        />
      )}
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  problem: { padding: gutter, gap: space[4], paddingTop: space[8] },
  error: { paddingHorizontal: 0 },
  skip: { alignSelf: 'center' },
  slow: { paddingHorizontal: gutter, paddingBottom: space[8], gap: space[2], alignItems: 'center' },
  slowText: { textAlign: 'center' },
});
