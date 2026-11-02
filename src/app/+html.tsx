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

        {/* Open Graph & Social Cards */}
        <meta property="og:site_name" content="Kinnoc" />
        <meta property="og:title" content="Kinnoc — Connect, Chat, and Discover" />
        <meta property="og:description" content="Join communities, participate in conversations, share updates, and discover local events on Kinnoc." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://web.kinnoc.app/icons/icon-512.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Kinnoc — Connect, Chat, and Discover" />
        <meta name="twitter:description" content="Join communities, participate in conversations, share updates, and discover local events on Kinnoc." />
        <meta name="twitter:image" content="https://web.kinnoc.app/icons/icon-512.png" />

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
        <style
          id="kinnoc-web-reset"
          dangerouslySetInnerHTML={{
            __html: `
              /* Lock viewport and prevent window scrolling / shifting when inputs focus */
              html, body {
                height: 100%;
                width: 100%;
                margin: 0;
                padding: 0;
                overflow: hidden;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                overscroll-behavior: none;
                -webkit-overflow-scrolling: touch;
              }
              #root {
                display: flex;
                height: 100%;
                width: 100%;
                flex: 1;
                overflow: hidden;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
              }
              /* Eliminate blue focus ring / box line across all browsers */
              *, *:focus, *:focus-visible, *:active {
                -webkit-tap-highlight-color: transparent !important;
              }
              input, textarea, select, button, [contenteditable], [role="textbox"] {
                outline: none !important;
                outline-width: 0 !important;
                box-shadow: none !important;
                -webkit-tap-highlight-color: transparent !important;
              }
              input:focus, input:focus-visible,
              textarea:focus, textarea:focus-visible,
              select:focus, select:focus-visible,
              button:focus, button:focus-visible,
              [contenteditable]:focus, [role="textbox"]:focus {
                outline: none !important;
                outline-width: 0 !important;
                box-shadow: none !important;
                -webkit-tap-highlight-color: transparent !important;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
