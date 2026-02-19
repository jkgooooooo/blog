import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
    const posts = await getCollection('blog');
    const rawBase = import.meta.env.BASE_URL ?? "/";
    const basePath =
      rawBase === "/" ? "/" : `/${rawBase.replace(/^\/+|\/+$/g, "")}/`;

    return rss({
        title: 'My Blog',
        description: 'AI + iOS dev notes',
        site: context.site, // astro.config.mjs의 site 값 사용
        items: posts
            .filter((p) => !p.data?.draft)
            .filter((p) => p.data?.pubDate)
            .sort((a, b) => new Date(b.data.pubDate).valueOf() - new Date(a.data.pubDate).valueOf())
            .map((post) => ({
                title: post.data.title ?? post.slug,
                pubDate: new Date(post.data.pubDate),
                description: post.data.description ?? '',
                link: `${basePath}${post.slug}/`,
            })),
    });
}
