<script lang="ts">
import { goto } from '$app/navigation';
import MarkdownIt from 'markdown-it';

type Entry = {
	id: string;
	title: string | null;
	markdown: string | null;
	html: string | null;
	contentJson: string;
	jsonVersion: number;
	updatedAt: string | Date | null;
};

const { data } = $props<{ data: { entries: Entry[] } }>();

const markdownIt = new MarkdownIt({ html: true, linkify: true, breaks: true });

	const formatter = new Intl.DateTimeFormat('ja-JP', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});

let keyword = $state('');
const entryList = data.entries;
const filteredEntries = $derived(
	!keyword
		? entryList
		: entryList.filter((entry: Entry) => {
			const needle = keyword.toLowerCase();
			return (
				(entry.title ?? '').toLowerCase().includes(needle) ||
				(entry.markdown ?? '').toLowerCase().includes(needle)
			);
		})
);

let previewEntry = $state<Entry | null>(null);
let isPreviewOpen = $state(false);
let previewHtml = $state('');

	function handleCreate() {
		goto('/');
	}

	function handleEdit(id: string) {
		goto(`/?entry=${id}`);
	}

	function handlePreview(entry: Entry) {
		previewEntry = entry;
		previewHtml = entry.html ?? markdownIt.render(entry.markdown ?? '');
		isPreviewOpen = true;
	}

	function closePreview() {
		isPreviewOpen = false;
	}

	function calculateCharacters(markdown: string | null) {
		if (!markdown) return 0;
		return markdown.replace(/\s+/g, '').length;
	}
</script>

<div class="page">
	<header class="page-header">
		<h1>記事の管理</h1>
		<button class="create-button" type="button" onclick={handleCreate}>
			<span>＋</span>
			<span>新規作成</span>
		</button>
	</header>

	<div class="search-box">
		<div class="search-icon">🔍</div>
		<input
			type="search"
			placeholder="タイトルやトピックで検索"
			bind:value={keyword}
		/>
	</div>

	{#if filteredEntries.length === 0}
		<p class="empty">記事がまだありません。</p>
	{:else}
		<ul class="entry-list">
			{#each filteredEntries as entry}
				<li class="entry-item">
					<div class="entry-content">
						<h2>{entry.title ?? 'Untitled'}</h2>
						<div class="entry-meta">
							<span class="badge">下書き</span>
							<span>{entry.updatedAt ? formatter.format(new Date(entry.updatedAt)) : '---'}に本文更新</span>
							<span>· {calculateCharacters(entry.markdown)}字</span>
						</div>
					</div>
					<div class="entry-actions">
					<button type="button" title="プレビュー" onclick={() => handlePreview(entry)}>▶</button>
					<button type="button" title="編集" onclick={() => handleEdit(entry.id)}>✎</button>
						<button type="button" title="詳細">⌄</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if isPreviewOpen && previewEntry}
		<div
			class="preview-overlay"
			role="button"
			tabindex="0"
			onclick={closePreview}
			onkeydown={(event) => {
				if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					closePreview();
				}
			}}
		>
			<div
				class="preview-dialog"
				role="dialog"
				aria-modal="true"
				aria-label="記事プレビュー"
				tabindex="-1"
				onpointerdown={(event) => event.stopPropagation()}
			>
				<header class="preview-header">
					<h2>{previewEntry.title ?? 'Untitled'}</h2>
					<button type="button" class="close-button" onclick={closePreview} aria-label="閉じる">✕</button>
				</header>
				<section class="preview-body">
					<article class="zenn-preview">{@html previewHtml}</article>
				</section>
			</div>
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		padding: 3rem 1.5rem;
		font-family: 'Noto Sans JP', system-ui, sans-serif;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.page-header h1 {
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
		color: #1d2333;
	}

	.create-button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.65rem 1.2rem;
		border-radius: 999px;
		border: 1px solid rgba(15, 147, 255, 0.25);
		background: #fff;
		color: #0f93ff;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s ease, color 0.2s ease;
	}

	.create-button:hover {
		background: rgba(15, 147, 255, 0.08);
	}

	.search-box {
		position: relative;
		margin-bottom: 2rem;
	}

	.search-box input {
		width: 100%;
		padding: 1.1rem 1.1rem 1.1rem 3rem;
		border-radius: 999px;
		border: 1px solid #e3ebf3;
		font-size: 1rem;
		background: #fafbfd;
	}

	.search-icon {
		position: absolute;
		left: 1.1rem;
		top: 50%;
		transform: translateY(-50%);
		color: #a5b5c5;
		font-size: 1rem;
	}

	.entry-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.entry-item {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		border: 1px solid #ecf1f7;
		border-radius: 18px;
		background: #fff;
		box-shadow: 0 12px 30px -24px rgba(15, 32, 68, 0.45);
	}

	.entry-content h2 {
		margin: 0 0 0.5rem;
		font-size: 1.35rem;
		color: #1b2233;
	}

	.entry-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: #5c6f84;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.55rem;
		border-radius: 8px;
		border: 1px solid rgba(15, 147, 255, 0.2);
		color: #0f93ff;
		font-weight: 600;
		background: rgba(15, 147, 255, 0.08);
	}

	.entry-actions {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
	}

	.entry-actions button {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: none;
		background: rgba(13, 34, 58, 0.04);
		color: #4d5d6f;
		font-size: 1.1rem;
		cursor: pointer;
		transition: background 0.2s ease, color 0.2s ease;
	}

	.entry-actions button:hover {
		background: rgba(15, 147, 255, 0.12);
		color: #0f93ff;
	}

	.preview-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(16, 28, 45, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		z-index: 1000;
	}

	.preview-dialog {
		max-width: 880px;
		width: min(880px, 100%);
		max-height: 90vh;
		background: #fff;
		border-radius: 18px;
		display: flex;
		flex-direction: column;
		box-shadow: 0 28px 64px -32px rgba(13, 34, 58, 0.55);
		overflow: hidden;
	}

	.preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid #eef2f8;
	}

	.preview-header h2 {
		margin: 0;
		font-size: 1.4rem;
		font-weight: 700;
		color: #1b2233;
	}

	.close-button {
		border: none;
		background: transparent;
		font-size: 1.3rem;
		cursor: pointer;
		color: #5a6b7d;
	}

	.preview-body {
		padding: 1.5rem;
		overflow-y: auto;
	}

	.zenn-preview :global(*:first-child) {
		margin-top: 0;
	}

	.zenn-preview :global(*:last-child) {
		margin-bottom: 0;
	}

	.empty {
		margin-top: 4rem;
		text-align: center;
		color: #8a97aa;
	}

	@media (max-width: 720px) {
		.entry-item {
			flex-direction: column;
			align-items: flex-start;
		}

		.entry-actions {
			align-self: flex-end;
		}
	}
</style>
