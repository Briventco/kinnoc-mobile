import { router } from 'expo-router';
import React, { memo, useMemo } from 'react';
import { type GestureResponderEvent, type StyleProp, StyleSheet, type TextStyle } from 'react-native';

import { Text, type TextProps } from '@/components/Text';
import { tokenizeText, type TextToken } from '@/lib/autolink';
import { isKinnocUrl, normalizeDeepLinkTarget } from '@/lib/deepLinks';
import { openExternal } from '@/lib/links';
import { colors } from '@/theme';

export interface AutolinkTextProps extends Omit<TextProps, 'children'> {
  children?: string | null;
  linkStyle?: StyleProp<TextStyle>;
  /** Inverted style for white-on-navy message bubbles */
  inverted?: boolean;
}

/**
 * Renders text with automatic detection and clickable styling for URLs, email addresses,
 * and telephone numbers. Internal Kinnoc links route in-app; external URLs open via the in-app browser.
 */
export const AutolinkText = memo(function AutolinkText({
  children,
  linkStyle,
  inverted,
  style,
  ...rest
}: AutolinkTextProps) {
  const isString = typeof children === 'string' && !!children;
  const tokens = useMemo(() => (isString ? tokenizeText(children) : []), [children, isString]);

  if (!isString) {
    return <Text style={style} {...rest}>{children}</Text>;
  }

  // If only one text token without links, render standard Text
  if (tokens.length === 1 && tokens[0].type === 'text') {
    return (
      <Text style={style} {...rest}>
        {children}
      </Text>
    );
  }

  const handlePress = (e: GestureResponderEvent, token: TextToken) => {
    e.stopPropagation?.();
    const href = token.href ?? token.value;

    if (token.type === 'url' && isKinnocUrl(href)) {
      const target = normalizeDeepLinkTarget(href);
      router.push(target as any);
      return;
    }

    void openExternal(href);
  };

  const defaultLinkStyle = inverted ? styles.invertedLink : styles.link;

  return (
    <Text style={style} {...rest}>
      {tokens.map((token, index) => {
        if (token.type === 'text') {
          return token.value;
        }

        return (
          <Text
            key={index}
            style={[defaultLinkStyle, linkStyle]}
            onPress={(e) => handlePress(e, token)}
            accessibilityRole="link"
            accessibilityLabel={token.value}
          >
            {token.value}
          </Text>
        );
      })}
    </Text>
  );
});

const styles = StyleSheet.create({
  link: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  invertedLink: {
    color: colors.onNavySecondary,
    textDecorationLine: 'underline',
  },
});
