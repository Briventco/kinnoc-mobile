import { router } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AuthError } from '@/auth/types';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Banner } from '@/components/States';
import { AuthScaffold } from '@/features/auth/AuthScaffold';
import { validateEmail, validatePassword } from '@/features/auth/validation';

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  async function submit() {
    const next = { email: validateEmail(email), password: validatePassword(password, 'sign-in') };
    setErrors(next);
    setFormError(null);
    if (next.email || next.password) return;
    setSubmitting(true);
    try {
      await signIn(email, password);
      // The root navigator switches to the app once the session is set.
    } catch (e) {
      setFormError(e instanceof AuthError ? e.message : 'Something went wrong. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <AuthScaffold title="Welcome back">
      {formError ? <Banner tone="warning" message={formError} /> : null}
      <TextField
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        onBlur={() => email && setErrors((e) => ({ ...e, email: validateEmail(email) }))}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        placeholder="Enter your password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secure
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label="Sign in" size="large" onPress={submit} loading={submitting} />
      <Button label="Forgot password?" variant="text" subdued onPress={() => router.push({ pathname: '/forgot-password', params: { email } })} />
      <Button label="New to Kinnoc? Create an account" variant="text" onPress={() => router.replace('/sign-up')} />
    </AuthScaffold>
  );
}
