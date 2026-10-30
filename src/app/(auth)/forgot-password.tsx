import { router, useLocalSearchParams } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AuthError } from '@/auth/types';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Banner } from '@/components/States';
import { AuthScaffold, AuthSwitch } from '@/features/auth/AuthScaffold';
import { validateEmail } from '@/features/auth/validation';
import { colors, radius } from '@/theme';

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (submitting) return;
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

  const backToSignIn = (
    <AuthSwitch question="Remembered it?">
      <Button label="Back to sign in" variant="text" onPress={() => router.replace('/sign-in')} />
    </AuthSwitch>
  );

  if (sent) {
    return (
      <AuthScaffold
        title="Check your email"
        intro={`If an account uses ${email.trim()}, we've sent a link to reset your password. It can take a few minutes to arrive, so check spam too.`}
        footer={backToSignIn}
      >
        <View style={styles.sent}>
          <MailCheck size={28} color={colors.primary} strokeWidth={1.75} />
        </View>
        <Button label="Use a different email" variant="quiet" size="large" onPress={() => setSent(false)} />
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold title="Reset your password" intro="Enter the email you signed up with and we'll send you a reset link." footer={backToSignIn}>
      {formError ? <Banner tone="warning" message={formError} /> : null}
      <TextField
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        onBlur={() => email && setError(validateEmail(email))}
        error={error}
        editable={!submitting}
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

const styles = StyleSheet.create({
  sent: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primarySubtle, alignItems: 'center', justifyContent: 'center' },
});
