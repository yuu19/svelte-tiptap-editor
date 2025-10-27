<script lang="ts">
	import ZennEditor from '$lib/components/ZennEditor.svelte';
	import 'zenn-content-css';

	let previewHtml = $state('<p>はじめよう</p>');
	let previewMarkdown = $state('');

	function renderMarkdown(doc: any): string {
		try {
			// NOTE: 実際には zenn-markdown-html などで Markdown 変換してください。
			return JSON.stringify(doc?.toJSON?.() ?? doc, null, 2);
		} catch (error) {
			console.warn('Failed to convert doc to markdown-ish JSON', error);
			return '';
		}
	}

	async function onImageUpload(files: File[]) {
		// 実サービスではここでアップロードを行い、公開URLを返す
		return files.map((file) => URL.createObjectURL(file));
	}

	function handleChange({ html, markdown }: { html: string; markdown: string }) {
		previewHtml = html;
		previewMarkdown = markdown;
	}

	function handleMessage(message: unknown) {
		console.log('transaction meta message:', message);
	}
</script>

<div class="page-layout">
	<section class="editor-pane">
		<ZennEditor
			initialContent={previewHtml}
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
</style>
