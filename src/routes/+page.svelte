<script lang="ts">
import { afterNavigate } from '$app/navigation';
import { dev } from '$app/environment';
import ZennEditor from '$lib/components/ZennEditor.svelte';
import 'zenn-content-css';
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';
import { fromAction } from 'svelte/attachments';
import type { entries } from '$lib/server/db/schema';
import type { JSONContent } from '@tiptap/core';
import SuperDebug from 'sveltekit-superforms/SuperDebug.svelte';

	type Entry = typeof entries.$inferSelect;

	type EditorState = {
		entryId: string | null;
		title: string;
		previewHtml: string;
		previewMarkdown: string;
		contentJson: JSONContent | null;
		jsonVersion: number;
		lastSavedAt: Date | null;
	};

	type EditorChangePayload = {
		html: string;
		markdown: string;
		json: JSONContent;
	};

const JSON_SCHEMA_VERSION = 1;
const markdownIt = new MarkdownIt({ html: true, linkify: true, breaks: true });
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

const props = $props<{ data: { entry: Entry | null } }>();

	function parseContentJson(value: unknown): JSONContent | null {
		if (!value) return null;
		try {
			const parsed = typeof value === 'string' ? JSON.parse(value) : value;
			if (!parsed || typeof parsed !== 'object') return null;
			if (typeof (parsed as { type?: unknown }).type !== 'string') return null;
			return parsed as JSONContent;
		} catch {
			return null;
		}
	}

	function createEditorState(entry: Entry | null): EditorState {
		const markdown = entry?.markdown ?? '';
		const html = entry?.html ?? (markdown ? markdownIt.render(markdown) : '<p>はじめよう</p>');
		const contentJson = parseContentJson(entry?.contentJson);
		const jsonVersion = entry?.jsonVersion ?? JSON_SCHEMA_VERSION;

		return {
			entryId: entry?.id ?? null,
			title: entry?.title ?? 'Untitled',
			previewHtml: html,
			previewMarkdown: markdown || turndown.turndown(html),
			contentJson,
			jsonVersion,
			lastSavedAt: entry?.updatedAt ? new Date(entry.updatedAt) : null
		};
	}

	function createEditorKey(state: EditorState): string {
		return `${state.entryId ?? 'new'}:${state.jsonVersion}`;
	}

	function createEntrySignature(entry: Entry | null): string {
		if (!entry) return 'new';
		const updatedAt = entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0;
		const version = entry.jsonVersion ?? JSON_SCHEMA_VERSION;
		return `${entry.id ?? 'new'}:${updatedAt}:${version}`;
	}

const initialEditorState = createEditorState(props.data.entry);
let editor = $state<EditorState>(initialEditorState);
let editorKey = $state<string>(createEditorKey(initialEditorState));
let loadedEntrySignature = $state<string>(createEntrySignature(props.data.entry));
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);

	const jsonPreview = $derived.by(() =>
		editor.contentJson ? JSON.stringify(editor.contentJson, null, 2) : ''
	);

	function applyEntry(entry: Entry | null) {
		const snapshot = createEditorState(entry);
		editor = snapshot;
	editorKey = createEditorKey(snapshot);
	loadedEntrySignature = createEntrySignature(entry);
}

afterNavigate(() => {
	applyEntry(props.data.entry);
});

$effect(() => {
	const signature = createEntrySignature(props.data.entry);
	if (signature !== loadedEntrySignature) {
		applyEntry(props.data.entry);
	}
});

	function renderMarkdown(_: unknown, html: string): string {
		return turndown.turndown(html);
	}

	async function onImageUpload(files: File[]) {
		return files.map((file) => URL.createObjectURL(file));
	}

	function handleChange({ html, markdown, json }: EditorChangePayload) {
		editor.previewHtml = html;
		editor.previewMarkdown = markdown;
	editor.contentJson = json;
	editor.jsonVersion = JSON_SCHEMA_VERSION;
}

function handleMessage(message: unknown) {
	console.log('transaction meta message:', message);
}

function sanitizeHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
		.replace(/ on[a-z]+="[^"]*"/gi, '')
		.replace(/ on[a-z]+='[^']*'/gi, '');
}

function htmlPreview(node: HTMLElement, html: string) {
	const setContent = (value: string) => {
		node.innerHTML = sanitizeHtml(value);
	};

	setContent(html);

	return {
		update(value: string) {
			setContent(value);
		},
		destroy() {
			node.innerHTML = '';
		}
	};
}

	async function saveEntry() {
		if (!editor.previewHtml.trim()) return;
		if (!editor.contentJson) {
			saveError = 'エディタ状態を取得できませんでした';
			return;
		}
		isSaving = true;
		saveError = null;
		try {
			const response = await fetch('/api/entries', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: editor.entryId,
					title: editor.title,
					markdown: editor.previewMarkdown,
					html: editor.previewHtml,
					contentJson: editor.contentJson,
					jsonVersion: editor.jsonVersion
				})
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || 'Failed to save entry');
			}

			const { entry } = (await response.json()) as { entry: Entry };
			applyEntry(entry);
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
			bind:value={editor.title}
			placeholder="タイトルを入力"
		/>
		<button type="button" class="save-button" disabled={isSaving} onclick={saveEntry}>
			{isSaving ? '保存中...' : editor.entryId ? '更新する' : '新規保存'}
		</button>
		{#if editor.lastSavedAt}
			<span class="status">最終保存: {editor.lastSavedAt.toLocaleString()}</span>
		{/if}
		{#if saveError}
			<span class="status error">{saveError}</span>
		{/if}
	</header>

	<section class="editor-pane">
		{#key editorKey}
			<ZennEditor
				initialContent={editor.previewHtml}
				initialJson={editor.contentJson}
				{renderMarkdown}
				{onImageUpload}
				onChange={handleChange}
				onMessage={handleMessage}
			/>
		{/key}
	</section>

	<section class="preview-pane">
		<h2>プレビュー</h2>
		<div class="preview-render znc" {@attach fromAction(htmlPreview, () => editor.previewHtml)}></div>

		<h3>Markdown スナップショット</h3>
		<pre class="preview-markdown">{editor.previewMarkdown}</pre>

		<h3>ProseMirror JSON v{editor.jsonVersion}</h3>
		<pre class="preview-json">{jsonPreview}</pre>
	</section>

	{#if dev}
		<section class="debug-pane">
			<h2>Debug</h2>
			<SuperDebug label="Data props" data={props.data} status={false} />
			<SuperDebug label="Editor state" data={editor} status={false} />
		</section>
	{/if}
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

	.debug-pane {
		margin-top: 2rem;
		border: 1px solid #e6edf5;
		border-radius: 16px;
		padding: 1.25rem;
		background: #fff;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.preview-render {
		padding: 1rem;
		border-radius: 12px;
		border: 1px solid #d8e1f0;
		background: #fff;
		overflow: hidden;
	}

	.preview-markdown,
	.preview-json {
		margin: 0;
		padding: 1rem;
		border-radius: 12px;
		background: #0d223a;
		color: #edf2ff;
		max-height: 320px;
		overflow: auto;
		font-size: 0.85rem;
	}

	.preview-json {
		background: #0f172a;
		font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
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
