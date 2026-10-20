import { CircleAlert, Eye, EyeOff, Search, X } from 'lucide-react-native';
import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputInstance, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, fonts, radius, space } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  helper?: string;
  error?: string | null;
  /** Adds a show/hide toggle. */
  secure?: boolean;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<TextInputInstance>;
}

/** Visible label above, 48px input, helper or error below. Never relies on placeholder as the label. */
export function TextField({ label, helper, error, secure, style, multiline, onFocus, onBlur, ref, ...input }: TextFieldProps) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, style]}>
      <Text variant="label" color="textTertiary" accessibilityElementsHidden importantForAccessibility="no">
        {label}
      </Text>
      <View
        style={[
          styles.inputWrap,
          multiline && styles.multilineWrap,
          focused && styles.focused,
          !!error && styles.errored,
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? helper}
          placeholderTextColor={colors.textTertiary}
          secureTextEntry={secure && hidden}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.multiline]}
          maxFontSizeMultiplier={1.6}
          {...input}
        />
        {secure ? (
          <IconButton
            icon={hidden ? Eye : EyeOff}
            label={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((h) => !h)}
            color="textTertiary"
            size={20}
          />
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <CircleAlert size={15} color={colors.warning} strokeWidth={2} />
          <Text variant="meta" color="warning" style={styles.flex}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text variant="meta" color="textSecondary">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  onSubmit?: () => void;
}

/** 44px mist search field with a clear button once there is text. */
export function SearchField({ value, onChangeText, placeholder, autoFocus, style, onSubmit }: SearchFieldProps) {
  return (
    <View style={[styles.search, style]}>
      <Search size={20} color={colors.textTertiary} strokeWidth={1.75} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
        style={styles.searchInput}
        maxFontSizeMultiplier={1.6}
      />
      {value ? (
        <IconButton icon={X} label="Clear search" onPress={() => onChangeText('')} color="textTertiary" size={18} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space[2] },
  inputWrap: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    backgroundColor: colors.surface,
  },
  multilineWrap: { alignItems: 'flex-start', paddingVertical: 10 },
  focused: { borderColor: colors.primary, borderWidth: 2, paddingLeft: 13 },
  errored: { borderColor: colors.warning, borderWidth: 2, paddingLeft: 13 },
  input: {
    flex: 1,
    fontFamily: fonts.body400,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 12,
    paddingRight: 14,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top', paddingVertical: 2 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  flex: { flex: 1 },
  search: {
    height: 44,
    borderRadius: radius.field,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body400,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
    paddingRight: 12,
  },
});
