import { router } from 'expo-router';
import { Check, MailCheck } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AuthError } from '@/auth/types';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Banner } from '@/components/States';
import { Text } from '@/components/Text';
import { AuthScaffold, AuthSwitch } from '@/features/auth/AuthScaffold';
import { LegalNotice } from '@/features/auth/LegalNotice';
import { passwordChecks, validateEmail, validateName, validatePassword, validateUsername } from '@/features/auth/validation';
import { colors, radius, space } from '@/theme';

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
  const usernameRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const set = (field: Field) => (text: string) => {
    setValues((v) => ({ ...v, [field]: text }));
    // Clear a shown error as soon as the field becomes valid.
    if (errors[field]) setErrors((e) => ({ ...e, [field]: validators[field](text) }));
  };
  const blur = (field: Field) => () => values[field] && setErrors((e) => ({ ...e, [field]: validators[field](values[field]) }));

  async function submit() {
    // One account per tap: the keyboard's Go key and the button can both fire.
    if (submitting) return;
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
      // Everything typed stays; only the problem is shown.
      setFormError(e instanceof AuthError ? e.message : 'Something went wrong. Try again.');
      setSubmitting(false);
    }
  }

  if (confirmEmail) {
    return (
      <AuthScaffold
        title="Check your email"
        intro={`We sent a confirmation link to ${values.email.trim()}. Open it on this phone, then sign in.`}
        footer={
          <AuthSwitch question="Wrong address?">
            <Button label="Change email" variant="text" onPress={() => setConfirmEmail(false)} />
          </AuthSwitch>
        }
      >
        <View style={styles.sent}>
          <MailCheck size={28} color={colors.primary} strokeWidth={1.75} />
        </View>
        <Button label="Go to sign in" size="large" onPress={() => router.replace('/sign-in')} />
      </AuthScaffold>
    );
  }

  const checks = passwordChecks(values.password);

  return (
    <AuthScaffold
      title="Create your account"
      intro="It takes a minute. You can add more to your profile later."
      footer={
        <>
          <LegalNotice lead="By creating an account" />
          <AuthSwitch question="Already have an account?">
            <Button label="Sign in" variant="text" onPress={() => router.replace('/sign-in')} disabled={submitting} />
          </AuthSwitch>
        </>
      }
    >
      {formError ? <Banner tone="warning" message={formError} /> : null}
      <TextField
        label="Name"
        placeholder="e.g. Ada Okafor"
        value={values.displayName}
        onChangeText={set('displayName')}
        onBlur={blur('displayName')}
        error={errors.displayName}
        editable={!submitting}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => usernameRef.current?.focus()}
      />
      <TextField
        ref={usernameRef}
        label="Username"
        placeholder="e.g. ada_okafor"
        value={values.username}
        onChangeText={set('username')}
        onBlur={blur('username')}
        error={errors.username}
        helper="People can find you by @username."
        editable={!submitting}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        textContentType="username"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        ref={emailRef}
        label="Email"
        placeholder="you@example.com"
        value={values.email}
        onChangeText={set('email')}
        onBlur={blur('email')}
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
      <View style={styles.password}>
        <TextField
          ref={passwordRef}
          label="Password"
          placeholder="Create a password"
          value={values.password}
          onChangeText={set('password')}
          onBlur={blur('password')}
          error={errors.password}
          editable={!submitting}
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <View style={styles.checks} accessible accessibilityLabel={`Password: ${checks.map((c) => `${c.label}, ${c.met ? 'done' : 'not yet'}`).join('; ')}`}>
          {checks.map((c) => (
            <View key={c.label} style={styles.check}>
              <View style={[styles.tick, c.met && styles.tickMet]}>{c.met ? <Check size={11} color={colors.onPrimary} strokeWidth={3} /> : null}</View>
              <Text variant="meta" color={c.met ? 'text' : 'textTertiary'}>
                {c.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Button label="Create account" size="large" onPress={submit} loading={submitting} />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  sent: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primarySubtle, alignItems: 'center', justifyContent: 'center' },
  password: { gap: space[3] },
  checks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4], rowGap: space[1] },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tick: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  tickMet: { backgroundColor: colors.success, borderColor: colors.success },
});
