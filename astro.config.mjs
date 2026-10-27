import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
export default defineConfig({ site: 'https://querydock.run', trailingSlash: 'always', integrations: [sitemap({customPages:['https://querydock.run/en/examples/','https://querydock.run/ru/examples/']})] });
