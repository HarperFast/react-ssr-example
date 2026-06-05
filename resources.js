import { tables, logger } from 'harper';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!(await tables.Post.get('0'))) {
	await tables.Post.put({
		id: '0',
		title: 'Hello, World!',
		body: 'This is a test post. Please leave a comment! 📝',
		comments: [],
	});
}

const template = fs.readFileSync(path.join(fileURLToPath(import.meta.url), '../dist/client/index.html'), 'utf-8');
const serverEntry = await import('./dist/server/entry-server.js');

function renderPost(post, cached) {
	const rendered = serverEntry.render({ initialPostData: post, cached });

	return template
		.replace(`<!--app-head-->`, rendered.head ?? '')
		.replace(`<!--app-html-->`, rendered.html ?? '')
		.replace(
			`<!--app-data-->`,
			`<script>window.__INITIAL_POST_DATA__ = ${JSON.stringify(post)}; window.__CACHED__ = ${cached}</script>`
		);
}

export class UncachedBlog extends tables.Post {
	static async get(target) {
		const post = await tables.Post.get(target);
		return {
			status: 200,
			headers: { 'Content-Type': 'text/html' },
			body: renderPost(post, false),
		};
	}
}

class PageBuilder extends tables.Post {
	static async get(target) {
		const post = await tables.Post.get(target);
		const content = renderPost(post, true);
		logger.notify(
			`[diag] PageBuilder.get target=${JSON.stringify(target)} postId=${post?.id} contentLen=${content?.length}`
		);
		return {
			content,
		};
	}
}

tables.BlogCache.sourcedFrom(PageBuilder);

export class CachedBlog extends tables.BlogCache {
	static async get(target) {
		const cached = await tables.BlogCache.get(target);
		logger.notify(
			`[diag] CachedBlog.get cachedKeys=${cached ? JSON.stringify(Object.keys(cached)) : 'null'} contentLen=${cached?.content?.length}`
		);
		return {
			contentType: 'text/html',
			data: cached.content,
		};
	}
}
