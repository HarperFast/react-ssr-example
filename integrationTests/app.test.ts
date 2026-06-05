import { suite, test, before, after } from 'node:test';
import { strictEqual, ok } from 'node:assert/strict';
import { setupHarperWithFixture, teardownHarper, type ContextWithHarper } from '@harperfast/integration-testing';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '..');

// The `harper` package's `exports` map only exposes ".", so the harness's
// auto-resolution of 'harper/dist/bin/harper.js' fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
// Resolve the CLI from the (exported) main entry and pass it explicitly.
const require = createRequire(import.meta.url);
const harperBinPath = resolve(dirname(require.resolve('harper')), 'bin/harper.js');

function authFetch(
	ctx: ContextWithHarper,
	path: string,
	init: RequestInit & { headers?: Record<string, string> } = {}
) {
	const { headers = {}, ...rest } = init;
	const creds = Buffer.from(`${ctx.harper.admin.username}:${ctx.harper.admin.password}`).toString('base64');
	return fetch(`${ctx.harper.httpURL}${path}`, { ...rest, headers: { Authorization: `Basic ${creds}`, ...headers } });
}

void suite('React SSR + caching example', (ctx: ContextWithHarper) => {
	before(async () => {
		// The fixture (repo root) is built (vite) by the test script before this runs,
		// so dist/client/index.html and dist/server/entry-server.js exist for resources.js.
		await setupHarperWithFixture(ctx, FIXTURE_PATH, { harperBinPath });
	});

	after(async () => {
		await teardownHarper(ctx);
	});

	// --- Core Harper REST on the Post table ---

	void test('Harper starts and serves the seeded Post via REST', async () => {
		const res = await authFetch(ctx, '/Post/0');
		strictEqual(res.status, 200);
		const body = (await res.json()) as { id: string; title: string; comments: string[] };
		strictEqual(body.id, '0');
		strictEqual(body.title, 'Hello, World!');
		ok(Array.isArray(body.comments), 'expected comments array');
	});

	void test('GET /Post/ returns an array of posts', async () => {
		const res = await authFetch(ctx, '/Post/');
		strictEqual(res.status, 200);
		const body = await res.json();
		ok(Array.isArray(body), 'expected array response');
	});

	void test('PATCH /Post/0 updates the record (adds a comment)', async () => {
		const current = (await (await authFetch(ctx, '/Post/0')).json()) as { comments: string[] };
		const comment = `Test comment ${Math.random()}`;
		const res = await authFetch(ctx, '/Post/0', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ comments: current.comments.concat(comment) }),
		});
		ok(res.ok, `expected successful PATCH, got HTTP ${res.status}`);
		const after = (await (await authFetch(ctx, '/Post/0')).json()) as { comments: string[] };
		ok(after.comments.includes(comment), 'expected the new comment to be persisted');
	});

	// --- SSR render path ---

	void test('GET /UncachedBlog/0 server-side renders HTML', async () => {
		const res = await authFetch(ctx, '/UncachedBlog/0');
		strictEqual(res.status, 200);
		strictEqual(res.headers.get('Content-Type'), 'text/html');
		const html = await res.text();
		ok(html.includes('<!doctype html>'), 'expected full HTML document');
		// The app head/html placeholders should have been replaced by the SSR render.
		ok(!html.includes('<!--app-html-->'), 'expected app-html placeholder to be rendered');
		// SSR injects the initial post data and cached flag for client hydration.
		ok(html.includes('window.__INITIAL_POST_DATA__'), 'expected hydration data in SSR output');
		ok(html.includes('window.__CACHED__ = false'), 'expected uncached flag in SSR output');
		// The seeded post title should appear in the rendered markup.
		ok(html.includes('Hello, World!'), 'expected post title in rendered HTML');
	});

	void test('GET /CachedBlog/0 server-side renders HTML with cached flag', async () => {
		const res = await authFetch(ctx, '/CachedBlog/0');
		strictEqual(res.status, 200);
		const html = await res.text();
		ok(html.includes('<!doctype html>'), 'expected full HTML document');
		ok(html.includes('window.__CACHED__ = true'), 'expected cached flag in SSR output');
		ok(html.includes('Hello, World!'), 'expected post title in rendered HTML');
	});

	// --- Harper multi-tier caching behavior (mirrors caching-test.js) ---

	void test('CachedBlog emits caching headers and a 304 on conditional re-request', async () => {
		const r1 = await authFetch(ctx, '/CachedBlog/0');
		strictEqual(r1.status, 200);
		const etag = r1.headers.get('ETag');
		const lastModified = r1.headers.get('Last-Modified');
		ok(etag, 'expected an ETag header on the cached response');
		ok(lastModified, 'expected a Last-Modified header (rest.lastModified) on the cached response');

		const r2 = await authFetch(ctx, '/CachedBlog/0', {
			headers: { 'If-None-Match': etag!, 'If-Modified-Since': lastModified! },
		});
		strictEqual(r2.status, 304);
	});

	void test('Updating the Post invalidates the cache, then re-caches', async () => {
		// Prime the cache and capture headers.
		const r1 = await authFetch(ctx, '/CachedBlog/0');
		const etag1 = r1.headers.get('ETag');
		const lastModified1 = r1.headers.get('Last-Modified');
		ok(etag1 && lastModified1, 'expected caching headers');

		// Update the source Post.
		const post = (await (await authFetch(ctx, '/Post/0')).json()) as { comments: string[] };
		const patch = await authFetch(ctx, '/Post/0', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ comments: post.comments.concat(`Invalidate ${Math.random()}`) }),
		});
		ok(patch.ok, `expected successful PATCH, got HTTP ${patch.status}`);

		// Conditional request with the now-stale headers must miss the cache (200, fresh render).
		const r2 = await authFetch(ctx, '/CachedBlog/0', {
			headers: { 'If-None-Match': etag1!, 'If-Modified-Since': lastModified1! },
		});
		strictEqual(r2.status, 200);
		const etag2 = r2.headers.get('ETag');
		const lastModified2 = r2.headers.get('Last-Modified');
		ok(etag2 && lastModified2, 'expected refreshed caching headers');

		// A conditional request with the refreshed headers should hit the cache again (304).
		const r3 = await authFetch(ctx, '/CachedBlog/0', {
			headers: { 'If-None-Match': etag2!, 'If-Modified-Since': lastModified2! },
		});
		strictEqual(r3.status, 304);
	});
});
