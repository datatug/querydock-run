import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
export default defineConfig({
 site: 'https://querydock.run',
 trailingSlash: 'always',
 integrations: [sitemap({
  // The generated /en/ document is an internal root fallback, not a public URL.
  filter: page => page !== 'https://querydock.run/en/',
  customPages: ['https://querydock.run/', 'https://querydock.run/en/examples/', 'https://querydock.run/ru/examples/'],
 })],
});
