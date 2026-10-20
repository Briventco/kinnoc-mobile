import { router } from 'expo-router';
import { useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { AuthError } from '@/auth/types';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Banner } from '@/components/States';
import { Text } from '@/components/Text';
import { AuthScaffold } from '@/features/auth/AuthScaffold';
import { validateEmail, validateName, validatePassword, validateUsername } from '@/features/auth/validation';

type Field = 'displayName' | 'username' | 'email' | 'password';

const validators: Record<Field, (v: string) => string | null> = {
  displayName: validateName,
  username: validateUsername,
  email: validateEmail,
  password: (v) => validatePassword(v, 'sign-up'),
};

export default function SignUp() {
  const { signUp } = useAuth();
  const [values, setValues] = useState<Record<Field, string>>({ displayName: '', username: '', email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string | null>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);

  const set = (field: Field) => (text: string) => setValues((v) => ({ ...v, [field]: text }));
  const blur = (field: Field) => () => values[field] && setErrors((e) => ({ ...e, [field]: validators[field](values[field]) }));

  async function submit() {
    const next = Object.fromEntries((Object.keys(validators) as Field[]).map((f) => [f, validators[f](values[f])]));
    setErrors(next);
    setFormError(null);
    if (Object.values(next).some(Boolean)) return;
    setSubmitting(true);
    try {
      const result = await signUp(values);
      if (result.needsEmailConfirmation) {
        setConfirmEmail(true);
        setSubmitting(false);
      }
    } catch (e) {
      setFormError(e instanceof AuthError ? e.message : 'Something went wrong. Try again.');
      setSubmitting(false);
    }
  }

  if (confirmEmail) {
    return (
      <AuthScaffold title="Check your email" intro={`We sent a confirmation link to ${values.email.trim()}. Open it on this phone, then sign in.`}>
        <Button label="Go to sign in" size="large" onPress={() => router.replace('/sign-in')} />
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold title="Create your account" intro="It takes a minute. You can add more to your profile later.">
      {formError ? <Banner tone="warning" message={formError} /> : null}
      <TextField
        label="Name"
        value={values.displayName}
        onChangeText={set('displayName')}
        onBlur={blur('displayName')}
        error={errors.displayName}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
      />
      <TextField
        label="Username"
        value={values.username}
        onChangeText={set('username')}
        onBlur={blur('username')}
        error={errors.username}
        helper="People can find you by @username."
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        textContentType="username"
      />
      <TextField
        label="Email"
        value={values.email}
        onChangeText={set('email')}
        onBlur={blur('email')}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={values.password}
        onChangeText={set('password')}
        onBlur={blur('password')}
        error={errors.password}
        helper="At least 8 characters with letters and numbers."
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label="Create account" size="large" onPress={submit} loading={submitting} />
      <Text variant="meta" color="textTertiary">
        By creating an account you agree to the Terms and Privacy Policy.
      </Text>
      <Button label="Already have an account? Sign in" variant="text" onPress={() => router.replace('/sign-in')} />
    </AuthScaffold>
  );
}
