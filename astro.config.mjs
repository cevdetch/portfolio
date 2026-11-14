// @ts-check
import { defineConfig, sharpImageService } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { siteValidation } from './src/integrations/site.ts';
import { socialImages } from './src/integrations/social-images.ts';
import { createIndexing } from './src/integrations/indexing.ts';

const indexing = createIndexing();

export default defineConfig({
  site: 'https://cevdet.ch',
  trailingSlash: 'always',
  // Site-wide encoder defaults. WebP and PNG are chosen for the screenshots: on flat UI lossless WebP is about half
  // the size of PNG and pixel-identical, and PNG stays lossless as the fallback. AVIF and JPEG serve the portrait
  // alone, so their lossy qualities live here: <Picture> takes one `quality` for every format, and a photo wants
  // less from AVIF than from JPEG for the same look.
  image: {
    service: sharpImageService({
      webp: { lossless: true }, png: { compressionLevel: 9 },
      avif: { quality: 70 }, jpeg: { quality: 80, mozjpeg: true, progressive: true },
    }),
  },
  integrations: [
    mdx(),
    siteValidation(),
    indexing.collect,
    socialImages(),
    sitemap({ filter: indexing.filter, customPages: indexing.sitemapPages }),
    indexing.finalize,
  ],
});
