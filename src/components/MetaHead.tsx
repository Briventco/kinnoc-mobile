import Head from 'expo-router/head';
import { memo } from 'react';

export interface MetaHeadProps {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  url?: string | null;
}

/**
 * Sets Open Graph and document metadata on web and indexing activities on supported native platforms.
 */
export const MetaHead = memo(function MetaHead({ title, description, image, url }: MetaHeadProps) {
  const fullTitle = title ? `${title} · Kinnoc` : 'Kinnoc';
  return (
    <Head>
      <title>{fullTitle}</title>
      <meta property="og:title" content={fullTitle} />
      {description ? <meta property="og:description" content={description} /> : null}
      {image ? <meta property="og:image" content={image} /> : null}
      {url ? <meta property="og:url" content={url} /> : null}
      <meta name="twitter:title" content={fullTitle} />
      {description ? <meta name="twitter:description" content={description} /> : null}
      {image ? <meta name="twitter:image" content={image} /> : null}
    </Head>
  );
});
