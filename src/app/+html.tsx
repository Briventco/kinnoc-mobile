import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Root HTML layout for web in Expo Router.
 * Configures PWA metadata, manifest, Apple touch icon, and theme colors.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <title>Kinnoc</title>

        {/* PWA Manifest & Icons */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

        {/* Mobile & PWA Metas */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Kinnoc" />
        <meta name="application-name" content="Kinnoc" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#FFFFFF" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
