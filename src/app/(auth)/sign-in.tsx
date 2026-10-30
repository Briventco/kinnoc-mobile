import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AuthError } from '@/auth/types';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Banner } from '@/components/States';
import { AuthScaffold, AuthSwitch } from '@/features/auth/AuthScaffold';
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
    // The keyboard's Go key can fire while a sign-in is already on its way.
    if (submitting) return;
    const next = { email: validateEmail(email), password: validatePassword(password, 'sign-in') };
    setErrors(next);
    setFormError(null);
    if (next.email || next.password) return;
    setSubmitting(true);
    try {
      await signIn(email, password);
      // The root navigator switches to the app once the session is set.
    } catch (e) {
      // What was typed stays, so a retry is one tap.
      setFormError(e instanceof AuthError ? e.message : 'Something went wrong. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <AuthScaffold
      title="Welcome back"
      intro="Sign in to pick up your communities and conversations."
      footer={
        <AuthSwitch question="New to Kinnoc?">
          <Button label="Create an account" variant="text" onPress={() => router.replace('/sign-up')} disabled={submitting} />
        </AuthSwitch>
      }
    >
      {formError ? <Banner tone="warning" message={formError} /> : null}
      <TextField
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        onBlur={() => email && setErrors((e) => ({ ...e, email: validateEmail(email) }))}
        error={errors.email}
        editable={!submitting}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <View>
        <TextField
          ref={passwordRef}
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          editable={!submitting}
          secure
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button
          label="Forgot password?"
          variant="text"
          subdued
          onPress={() => router.push({ pathname: '/forgot-password', params: { email } })}
          disabled={submitting}
          style={styles.forgot}
        />
      </View>
      <Button label="Sign in" size="large" onPress={submit} loading={submitting} />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  forgot: { alignSelf: 'flex-end', marginBottom: -12 },
});
