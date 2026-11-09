// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { siteValidation } from './src/integrations/site.ts';
import { socialImages } from './src/integrations/social-images.ts';
import { createIndexing } from './src/integrations/indexing.ts';

const indexing = createIndexing();

export default defineConfig({
  site: 'https://cevdet.ch',
  trailingSlash: 'always',
  integrations: [
    mdx(),
    siteValidation(),
    indexing.collect,
    socialImages(),
    sitemap({ filter: indexing.filter, customPages: indexing.sitemapPages }),
    indexing.finalize,
  ],
});
