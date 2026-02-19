import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
    const posts = await getCollection('blog');

	console.log("RSS posts:", posts.length);
    return rss({
        title: 'My Blog',
        description: 'AI + iOS dev notes',
        site: context.site, // astro.config.mjs의 site 값 사용
        items: posts
            .filter((p) => !p.data?.draft)
            .filter((p) => p.data?.pubDate) // pubDate 없는 글 제거(무한로딩 방지)
            .sort((a, b) => new Date(b.data.pubDate).valueOf() - new Date(a.data.pubDate).valueOf())
            .map((post) => ({
                title: post.data.title ?? post.slug,
                pubDate: new Date(post.data.pubDate),      // ✅ Date로 강제 변환
                description: post.data.description ?? '',
                link: `${import.meta.env.BASE_URL}blog/${post.slug}/`, // ✅ base 안전
            })),
    });
}
