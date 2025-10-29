<script lang="ts">
	import ZennEditor from '$lib/components/ZennEditor.svelte';
	import 'zenn-content-css';
	import MarkdownIt from 'markdown-it';
	import TurndownService from 'turndown';
	import type { entries } from '$lib/server/db/schema';

	type Entry = typeof entries.$inferSelect;

	const markdownIt = new MarkdownIt({ html: true, linkify: true, breaks: true });
	const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

	let data: { entry: Entry | null } = $props();

	let entryId = $state<string | null>(data.entry?.id ?? null);
	let title = $state(data.entry?.title ?? 'Untitled');

	const initialMarkdown = data.entry?.markdown ?? '';
	const initialHtml = initialMarkdown
		? markdownIt.render(initialMarkdown)
		: data.entry?.html ?? '<p>はじめよう</p>';

	let previewHtml = $state(initialHtml);
	let previewMarkdown = $state(initialMarkdown || turndown.turndown(initialHtml));
	let lastSavedAt = $state<Date | null>(data.entry?.updatedAt ? new Date(data.entry.updatedAt) : null);
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);

	function renderMarkdown(_: unknown): string {
		// 実際の Markdown 変換は onChange 側で行うため、ここでは最新値を返す
		return previewMarkdown;
	}

	async function onImageUpload(files: File[]) {
		return files.map((file) => URL.createObjectURL(file));
	}

	function handleChange({ html }: { html: string; markdown: string }) {
		previewHtml = html;
		previewMarkdown = turndown.turndown(html);
	}

	function handleMessage(message: unknown) {
		console.log('transaction meta message:', message);
	}

	async function saveEntry() {
		if (!previewHtml.trim()) return;
		isSaving = true;
		saveError = null;
		try {
			const response = await fetch('/api/entries', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: entryId,
					title,
					markdown: previewMarkdown,
					html: previewHtml
				})
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || 'Failed to save entry');
			}

			const { entry } = (await response.json()) as { entry: Entry };
			entryId = entry.id;
			lastSavedAt = entry.updatedAt ? new Date(entry.updatedAt) : new Date();
		} catch (err) {
			saveError = err instanceof Error ? err.message : '保存に失敗しました';
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="page-layout">
	<header class="toolbar">
		<input
			type="text"
			class="title-input"
			bind:value={title}
			placeholder="タイトルを入力"
		/>
		<button type="button" class="save-button" disabled={isSaving} onclick={saveEntry}>
			{isSaving ? '保存中...' : entryId ? '更新する' : '新規保存'}
		</button>
		{#if lastSavedAt}
			<span class="status">最終保存: {lastSavedAt.toLocaleString()}</span>
		{/if}
		{#if saveError}
			<span class="status error">{saveError}</span>
		{/if}
	</header>

	<section class="editor-pane">
		<ZennEditor
			initialContent={initialHtml}
			{renderMarkdown}
			{onImageUpload}
			onChange={handleChange}
			onMessage={handleMessage}
		/>
	</section>

	<section class="preview-pane">
		<h2>HTML スナップショット</h2>
		<pre class="preview-html">{previewHtml}</pre>

		<h3>Markdown-ish JSON</h3>
		<pre class="preview-markdown">{previewMarkdown}</pre>
	</section>
</div>

<style>
	.page-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr);
		gap: 2rem;
		padding: 2rem 0;
	}

	@media (max-width: 1024px) {
		.page-layout {
			grid-template-columns: 1fr;
		}
	}

	.preview-pane {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		border: 1px solid #e6edf5;
		border-radius: 16px;
		background: #f9fbff;
	}

.preview-html,
.preview-markdown {
	margin: 0;
	padding: 1rem;
		border-radius: 12px;
		background: #0d223a;
		color: #edf2ff;
		max-height: 320px;
		overflow: auto;
		font-size: 0.85rem;
	}

	.preview-html {
		background: #fff;
		color: #1b2733;
		border: 1px solid rgba(13, 34, 58, 0.12);
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.title-input {
		flex: 1 1 auto;
		padding: 0.5rem 0.75rem;
		border-radius: 10px;
		border: 1px solid #ccd6e0;
		font-size: 1rem;
	}

	.save-button {
		padding: 0.5rem 1.25rem;
		border-radius: 12px;
		border: none;
		background: #0f93ff;
		color: #fff;
		font-weight: 600;
		cursor: pointer;
	}

	.save-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.status {
		font-size: 0.85rem;
		color: rgba(27, 39, 51, 0.75);
	}

	.status.error {
		color: #ff4d4d;
	}
</style>
