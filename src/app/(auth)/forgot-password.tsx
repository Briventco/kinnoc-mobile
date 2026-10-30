import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { AuthError } from '@/auth/types';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Banner } from '@/components/States';
import { AuthScaffold } from '@/features/auth/AuthScaffold';
import { validateEmail } from '@/features/auth/validation';

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    const e = validateEmail(email);
    setError(e);
    setFormError(null);
    if (e) return;
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthScaffold
        title="Check your email"
        intro={`If an account uses ${email.trim()}, we've sent a link to reset your password. It may take a few minutes to arrive.`}
      >
        <Button label="Back to sign in" size="large" onPress={() => router.replace('/sign-in')} />
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold title="Reset your password" intro="Enter the email you signed up with and we'll send you a reset link.">
      {formError ? <Banner tone="warning" message={formError} /> : null}
      <TextField
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        onBlur={() => email && setError(validateEmail(email))}
        error={error}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
      />
      <Button label="Send reset link" size="large" onPress={submit} loading={submitting} />
    </AuthScaffold>
  );
}
