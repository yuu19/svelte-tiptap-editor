<script lang="ts">
	import { tick } from 'svelte';
	import type { Editor } from '@tiptap/core';

	import {
		createZennEditor,
		type CreateZennEditorProps,
		type HeadingItem,
		type ZennEditorInstance,
	} from '$lib/editor/createZennEditor';

	type ChangePayload = { html: string; markdown: string };

	interface Props {
		initialContent?: string;
		placeholder?: string;
		renderMarkdown?: (doc: unknown) => string;
		onImageUpload?: (files: File[]) => Promise<string[]>;
		onChange?: (payload: ChangePayload) => void;
		onMessage?: (payload: unknown) => void;
		onReady?: () => void;
	}

	const defaultRenderMarkdown = () => '';
	const defaultUpload = async () => [] as string[];

	let {
		initialContent = '',
		placeholder = '本文を入力...',
		renderMarkdown = defaultRenderMarkdown,
		onImageUpload = defaultUpload,
		onChange,
		onMessage,
		onReady,
	}: Props = $props();

	let editor = $state<Editor | null>(null);
	let toolbarState = $state({
		block: 'paragraph',
		bold: false,
		italic: false,
		code: false,
		strike: false,
		link: false,
		bulletList: false,
		orderedList: false,
		taskList: false,
		blockquote: false,
		canUndo: false,
		canRedo: false,
	});

	let bubbleMenuElement: HTMLDivElement | null = null;
	let floatingMenuElement: HTMLDivElement | null = null;
	let slashCommandElement: HTMLDivElement | null = null;
	let tocItems = $state<HeadingItem[]>([]);
	let activeHeadingId = $state<string | null>(null);

	function syncToolbar(instance: Editor) {
		toolbarState = {
			block: instance.isActive('heading', { level: 2 })
				? 'h2'
				: instance.isActive('heading', { level: 3 })
				? 'h3'
				: instance.isActive('heading', { level: 4 })
				? 'h4'
				: instance.isActive('blockquote')
				? 'blockquote'
				: instance.isActive('bulletList')
				? 'bulletList'
				: instance.isActive('orderedList')
				? 'orderedList'
				: instance.isActive('taskList')
				? 'taskList'
				: 'paragraph',
			bold: instance.isActive('bold'),
			italic: instance.isActive('italic'),
			code: instance.isActive('code'),
			strike: instance.isActive('strike'),
			link: instance.isActive('link'),
			bulletList: instance.isActive('bulletList'),
			orderedList: instance.isActive('orderedList'),
			taskList: instance.isActive('taskList'),
			blockquote: instance.isActive('blockquote'),
			canUndo: instance.can().undo(),
			canRedo: instance.can().redo(),
		};
		updateActiveHeading(instance);
	}

	function run(command: (instance: Editor) => void) {
		if (!editor) return;
		command(editor);
		syncToolbar(editor);
	}

	function updateActiveHeading(instance: Editor, headings: HeadingItem[] = tocItems) {
		if (!headings.length) {
			activeHeadingId = null;
			return;
		}
		const cursor = instance.state.selection.from;
		let current: string | null = null;
		for (const item of headings) {
			if (cursor >= item.pos) {
				current = item.id;
			} else {
				break;
			}
		}
		activeHeadingId = current;
	}

	function bubbleMenu(node: HTMLDivElement) {
		bubbleMenuElement = node;
		return {
			destroy() {
				if (bubbleMenuElement === node) {
					bubbleMenuElement = null;
				}
			},
		};
	}

	function floatingMenu(node: HTMLDivElement) {
		floatingMenuElement = node;
		return {
			destroy() {
				if (floatingMenuElement === node) {
					floatingMenuElement = null;
				}
			},
		};
	}

	function slashMenu(node: HTMLDivElement) {
		slashCommandElement = node;
		return {
			destroy() {
				if (slashCommandElement === node) {
					slashCommandElement = null;
				}
			},
		};
	}

	function editorHost(node: HTMLDivElement) {
		let destroyed = false;
		let activeUnsubscribers: Array<() => void> = [];
		let activeInstance: Editor | null = null;

		async function initialize() {
			await tick();
			if (destroyed) return;

			const instancePayload = createZennEditor({
				target: node,
				bubbleMenuElement,
				floatingMenuElement,
				slashCommandElement,
				initialContent,
				placeholder,
				renderMarkdown,
				onImageUpload,
				onMessage,
				onChange: (html, markdown) => {
					onChange?.({ html, markdown });
				},
				onHeadingsChange: (headings) => {
					tocItems = headings;
					if (editor) {
						updateActiveHeading(editor, headings);
					}
				},
			} satisfies CreateZennEditorProps);
			const { editor: instance } = instancePayload;

			editor = instance;
			syncToolbar(instance);
			activeInstance = instance;

			const handleSelectionUpdate = () => syncToolbar(instance);
			const handleTransaction = () => syncToolbar(instance);
			const handleFocus = () => syncToolbar(instance);
			const handleBlur = () => syncToolbar(instance);

			instance.on('selectionUpdate', handleSelectionUpdate);
			instance.on('transaction', handleTransaction);
			instance.on('focus', handleFocus);
			instance.on('blur', handleBlur);

			activeUnsubscribers = [
				() => instance.off('selectionUpdate', handleSelectionUpdate),
				() => instance.off('transaction', handleTransaction),
				() => instance.off('focus', handleFocus),
				() => instance.off('blur', handleBlur),
			];

			onReady?.();
		}

		initialize();

		return {
			destroy() {
				destroyed = true;
				activeUnsubscribers.forEach((unsubscribe) => unsubscribe());
				activeUnsubscribers = [];
				const current = activeInstance as unknown;
				if (
					current &&
					typeof (current as { destroy?: unknown }).destroy === 'function'
				) {
					(current as { destroy: () => void }).destroy();
				}
				if (editor === activeInstance) {
					editor = null;
				}
				activeInstance = null;
			},
		};
	}

	const withPrevent = (handler: () => void) => (event: MouseEvent) => {
		event.preventDefault();
		handler();
	};

	const setLink = () => {
		if (!editor) return;
		const previous = editor.getAttributes('link')?.href ?? '';
		const url = window.prompt('リンクURLを入力してください', previous);
		if (url === null) return;
		if (url === '') {
			run((instance) => instance.chain().focus().unsetLink().run());
			return;
		}

		run((instance) =>
			instance.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
		);
	};

	function jumpToHeading(item: HeadingItem) {
		if (!editor) return;
		editor
			.chain()
			.focus()
			.setTextSelection({ from: item.pos, to: item.pos })
			.scrollIntoView()
			.run();
		activeHeadingId = item.id;
	}

	$effect(() => {
		if (editor) {
			updateActiveHeading(editor);
		}
	});

	export function focus() {
		editor?.chain().focus().run();
	}

	export function getJSON() {
		return editor?.getJSON();
	}

	export function getHTML() {
		return editor?.getHTML();
	}
</script>

<div class="zenn-editor">
	<div class="zenn-editor__layout">
		<aside class="zenn-editor__toc" aria-label="目次">
			<header class="zenn-editor__toc-header">
				<span>目次</span>
			</header>
			{#if tocItems.length}
				<ol class="zenn-editor__toc-list">
					{#each tocItems as item}
						<li class={`level-${item.level} ${item.id === activeHeadingId ? 'is-active' : ''}`}>
							<button type="button" onclick={() => jumpToHeading(item)}>
								{item.text}
							</button>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="zenn-editor__toc-empty">見出しを追加すると目次が生成されます</p>
			{/if}
		</aside>

		<div class="zenn-editor__main">
			<div class="zenn-editor__toolbar">
				<div class="zenn-editor__toolbar-group">
					<button
						type="button"
						class:active={toolbarState.block === 'paragraph'}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().setParagraph().run())
						)}
						aria-pressed={toolbarState.block === 'paragraph'}
					>
						本文
					</button>
					<button
						type="button"
						class:active={toolbarState.block === 'h2'}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleHeading({ level: 2 }).run())
						)}
						aria-pressed={toolbarState.block === 'h2'}
					>
						H2
					</button>
					<button
						type="button"
						class:active={toolbarState.block === 'h3'}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleHeading({ level: 3 }).run())
						)}
						aria-pressed={toolbarState.block === 'h3'}
					>
						H3
					</button>
					<button
						type="button"
						class:active={toolbarState.block === 'blockquote'}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleBlockquote().run())
						)}
						aria-pressed={toolbarState.block === 'blockquote'}
					>
						引用
					</button>
				</div>
				<div class="zenn-editor__toolbar-group">
					<button
						type="button"
						class:active={toolbarState.bold}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleBold().run())
						)}
						aria-pressed={toolbarState.bold}
					>
						B
					</button>
					<button
						type="button"
						class:active={toolbarState.italic}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleItalic().run())
						)}
						aria-pressed={toolbarState.italic}
					>
						I
					</button>
					<button
						type="button"
						class:active={toolbarState.strike}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleStrike().run())
						)}
						aria-pressed={toolbarState.strike}
					>
						S
					</button>
					<button
						type="button"
						class:active={toolbarState.code}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleCode().run())
						)}
						aria-pressed={toolbarState.code}
					>
						<span class="code-symbol">&#123;&#125;</span>
					</button>
					<button type="button" onmousedown={withPrevent(() => setLink())} aria-pressed={toolbarState.link}>
						🔗
					</button>
				</div>
				<div class="zenn-editor__toolbar-group">
					<button
						type="button"
						class:active={toolbarState.bulletList}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleBulletList().run())
						)}
						aria-pressed={toolbarState.bulletList}
					>
						UL
					</button>
					<button
						type="button"
						class:active={toolbarState.orderedList}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleOrderedList().run())
						)}
						aria-pressed={toolbarState.orderedList}
					>
						OL
					</button>
					<button
						type="button"
						class:active={toolbarState.taskList}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleTaskList().run())
						)}
						aria-pressed={toolbarState.taskList}
					>
						Todo
					</button>
					<button
						type="button"
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().setHorizontalRule().run())
						)}
					>
						―
					</button>
					<button
						type="button"
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleCodeBlock().run())
						)}
					>
						&lt;/&gt;
					</button>
				</div>
				<div class="zenn-editor__toolbar-group">
					<button
						type="button"
						disabled={!toolbarState.canUndo}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().undo().run())
						)}
						aria-disabled={!toolbarState.canUndo}
					>
						⎌
					</button>
					<button
						type="button"
						disabled={!toolbarState.canRedo}
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().redo().run())
						)}
						aria-disabled={!toolbarState.canRedo}
					>
						↻
					</button>
				</div>
			</div>

			<div class="zenn-editor__surface">
				<div class="zenn-editor__floating-menu" use:floatingMenu>
					<button
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().setParagraph().run())
						)}
						class:active={toolbarState.block === 'paragraph'}
					>
						本文
					</button>
					<button
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleHeading({ level: 2 }).run())
						)}
						class:active={toolbarState.block === 'h2'}
					>
						H2
					</button>
					<button
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleHeading({ level: 3 }).run())
						)}
						class:active={toolbarState.block === 'h3'}
					>
						H3
					</button>
					<button
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleBlockquote().run())
						)}
						class:active={toolbarState.block === 'blockquote'}
					>
						引用
					</button>
					<button
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleCodeBlock().run())
						)}
						class:active={toolbarState.code}
					>
						&lt;/&gt;
					</button>
				</div>

				<div class="zenn-editor__bubble-menu" use:bubbleMenu>
					<button
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleBold().run())
						)}
						class:active={toolbarState.bold}
					>
						B
					</button>
					<button
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleItalic().run())
						)}
						class:active={toolbarState.italic}
					>
						I
					</button>
					<button
						onmousedown={withPrevent(() =>
							run((instance) => instance.chain().focus().toggleCode().run())
						)}
						class:active={toolbarState.code}
					>
						<span class="code-symbol">&#123;&#125;</span>
					</button>
					<button onmousedown={withPrevent(() => setLink())} class:active={toolbarState.link}>🔗</button>
				</div>

				<div class="zenn-editor__slash-menu" use:slashMenu></div>

				<div class="zenn-editor__host" use:editorHost></div>
			</div>
		</div>
	</div>
</div>

<style>
	.zenn-editor__layout {
		display: flex;
		align-items: flex-start;
		gap: 1.5rem;
	}

	.zenn-editor__main {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.zenn-editor__toc {
		flex: 0 0 220px;
		position: sticky;
		top: 96px;
		max-height: calc(100vh - 140px);
		overflow: auto;
		padding: 1rem;
		border: 1px solid #e1e8f0;
		border-radius: 16px;
		background: #f8fbff;
		box-shadow: 0 16px 34px rgba(13, 34, 58, 0.065);
	}

	.zenn-editor__toc-header {
		font-size: 0.9rem;
		font-weight: 700;
		color: #1d3448;
		margin-bottom: 0.75rem;
	}

	.zenn-editor__toc-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.zenn-editor__toc-list li {
		border-radius: 8px;
		transition: background 0.15s ease;
	}

	.zenn-editor__toc-list li button {
		width: 100%;
		text-align: left;
		border: none;
		background: transparent;
		font-size: 0.85rem;
		padding: 0.35rem 0.5rem;
		color: #1d3448;
		cursor: pointer;
	}

	.zenn-editor__toc-list li.level-3 button {
		padding-left: 1.25rem;
	}

	.zenn-editor__toc-list li.level-4 button {
		padding-left: 2rem;
	}

	.zenn-editor__toc-list li:hover,
	.zenn-editor__toc-list li.is-active {
		background: rgba(15, 147, 255, 0.14);
	}

	.zenn-editor__toc-list li.is-active button {
		color: #0f93ff;
		font-weight: 600;
	}

	.zenn-editor__toc-empty {
		margin: 0;
		font-size: 0.8rem;
		color: rgba(29, 52, 72, 0.7);
	}

	:global(.zenn-editor__content) {
		min-height: 320px;
		outline: none;
	}

	.zenn-editor {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.zenn-editor__toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid #dbe2ea;
		border-radius: 12px;
		background: #fff;
	}

	.zenn-editor__toolbar button {
		min-width: 2.5rem;
		padding: 0.35rem 0.55rem;
		border-radius: 8px;
		border: 1px solid transparent;
		background: #f7f9fb;
		color: #1d3448;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.zenn-editor__toolbar button[aria-pressed='true'],
	.zenn-editor__toolbar button.active {
		background: rgba(15, 147, 255, 0.12);
		border-color: rgba(15, 147, 255, 0.4);
		color: #0f93ff;
	}

	.zenn-editor__toolbar button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.zenn-editor__surface {
		position: relative;
		border: 1px solid #dbe2ea;
		border-radius: 16px;
		background: #fff;
		padding: 1.25rem;
	}

	.zenn-editor__host {
		min-height: 400px;
	}

	.zenn-editor__bubble-menu,
	.zenn-editor__floating-menu {
		display: none;
		gap: 0.25rem;
		padding: 0.35rem 0.5rem;
		background: #1b2733;
		color: #fff;
		border-radius: 999px;
	}

	:global(.zenn-editor__bubble-menu.is-active),
	:global(.zenn-editor__floating-menu.is-active) {
		display: inline-flex;
	}

	.zenn-editor__bubble-menu button,
	.zenn-editor__floating-menu button {
		border: none;
		background: transparent;
		color: inherit;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: 6px;
		cursor: pointer;
	}

	.code-symbol {
		font-family: 'SFMono-Regular', Consolas, ui-monospace, monospace;
	}

	.zenn-editor__slash-menu {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 200;
	}

	:global(.zenn-editor-slash-menu) {
		position: absolute;
		z-index: 300;
		min-width: 200px;
		background: #fff;
		border: 1px solid rgba(13, 34, 58, 0.12);
		border-radius: 12px;
		padding: 0.25rem 0;
		box-shadow: 0 12px 24px rgba(13, 34, 58, 0.18);
	}

	:global(.zenn-editor-slash-menu__item) {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	:global(.zenn-editor-slash-menu__item.is-active) {
		background: rgba(15, 147, 255, 0.12);
	}

	:global(.zenn-editor-slash-menu__icon) {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		background: rgba(15, 147, 255, 0.1);
		display: grid;
		place-items: center;
		font-size: 0.85rem;
	}

	@media (max-width: 1024px) {
		.zenn-editor__layout {
			flex-direction: column;
		}

		.zenn-editor__toc {
			position: static;
			width: 100%;
			max-height: none;
			order: 2;
		}

		.zenn-editor__main {
			order: 1;
		}
	}
</style>
