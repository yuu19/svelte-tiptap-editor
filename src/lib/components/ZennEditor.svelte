<script lang="ts">
	import { onMount } from 'svelte';
	import type { Readable } from 'svelte/store';
	import type { Editor as CoreEditor, JSONContent } from '@tiptap/core';
	import type { Editor } from 'svelte-tiptap';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Image from '@tiptap/extension-image';
	import FileHandler from '@tiptap/extension-file-handler';
	import Placeholder from '@tiptap/extension-placeholder';
	import TaskList from '@tiptap/extension-task-list';
	import TaskItem from '@tiptap/extension-task-item';
	import Typography from '@tiptap/extension-typography';
	import type { BubbleMenuOptions } from '@tiptap/extension-bubble-menu';
	import type { FloatingMenuOptions } from '@tiptap/extension-floating-menu';
	import { createEditor, EditorContent, BubbleMenu, FloatingMenu } from 'svelte-tiptap';
	import SlashCommand, {
		defaultSlashCommandItems,
		type SlashCommandItem,
	} from '$lib/editor/slashCommand';
	import {
		Message,
		MessageContent,
		Details,
		DetailsSummary,
		DetailsContent,
		ZennCodeBlock,
		ZennTable,
		ZennTableCell,
		ZennTableHeader,
		ZennTableRow,
		FootnoteReference,
		Embed,
		type MessageVariant,
	} from '$lib/editor/extensions';

	type ChangePayload = { html: string; markdown: string; json: JSONContent };

	type HeadingItem = {
		id: string;
		level: number;
		text: string;
		pos: number;
	};

	interface Props {
		initialContent?: string;
		initialJson?: JSONContent | null;
		placeholder?: string;
		renderMarkdown?: (doc: unknown, html: string) => string;
		onImageUpload?: (files: File[]) => Promise<string[]>;
		onChange?: (payload: ChangePayload) => void;
		onMessage?: (payload: unknown) => void;
		onReady?: (payload: { editor: CoreEditor }) => void;
		slashCommandItems?: SlashCommandItem[];
		slashCommandMaxItems?: number;
	}

	const defaultRenderMarkdown = (_doc: unknown, _html: string) => '';
	const defaultUpload = async () => [] as string[];

	let {
		initialContent = '',
		initialJson = null,
		placeholder = '本文を入力...',
		renderMarkdown = defaultRenderMarkdown,
		onImageUpload = defaultUpload,
		onChange,
		onMessage,
		onReady,
		slashCommandItems: providedSlashItems = defaultSlashCommandItems,
		slashCommandMaxItems = 8,
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
	let tocItems = $state<HeadingItem[]>([]);
	let activeHeadingId = $state<string | null>(null);
	let slashCommandElement: HTMLDivElement | null = null;

	let editorStore = $state<Readable<Editor> | null>(null);

	let editorEventUnsubscribers: Array<() => void> = [];
	let initialized = false;

	const withFileHandler = (uploadHandler?: Props['onImageUpload']) =>
		FileHandler.configure({
			allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
			onDrop(instance, files) {
				if (!uploadHandler) return;
				uploadHandler(files)
					.then((urls) => {
						urls.forEach((src) =>
							instance.chain().focus().setImage({ src }).run(),
						);
					})
					.catch((error) => {
						console.warn('Image upload failed', error);
					});
			},
			onPaste(instance, files) {
				if (!uploadHandler) return;
				uploadHandler(files)
					.then((urls) => {
						urls.forEach((src) =>
							instance.chain().focus().setImage({ src }).run(),
						);
					})
					.catch((error) => {
						console.warn('Image upload failed', error);
					});
			},
		});

	type BubbleMenuShouldShowProps = Parameters<
		NonNullable<BubbleMenuOptions['shouldShow']>
	>[0];

	const shouldShowBubbleMenu = ({ editor }: BubbleMenuShouldShowProps) => {
		const { state } = editor;
		const { from, to } = state.selection;
		if (from === to) return false;
		return (
			editor.isActive('paragraph') ||
			editor.isActive('heading') ||
			editor.isActive('listItem')
		);
	};

	type FloatingMenuShouldShowProps = Parameters<
		NonNullable<FloatingMenuOptions['shouldShow']>
	>[0];

	const shouldShowFloatingMenu = ({ editor, state }: FloatingMenuShouldShowProps) => {
		const { selection } = state;
		const fromPosition = selection.$from;
		if (!fromPosition) return false;

		const isAtStart = selection.empty && fromPosition.parentOffset === 0;
		return (
			isAtStart &&
			editor.isActive('paragraph') &&
			fromPosition.parent.textContent.length === 0
		);
	};

	const slugifyHeading = (text: string) =>
		text
			.toLowerCase()
			.trim()
			.replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.slice(0, 80) || 'heading';

	const collectHeadings = (doc: CoreEditor['state']['doc']): HeadingItem[] => {
		const seen = new Map<string, number>();
		const headings: HeadingItem[] = [];

		doc.descendants((node: any, pos: number) => {
			if (node.type.name === 'heading') {
				const level = Number(node.attrs.level ?? 1);
				const text = node.textContent.trim();
				const baseId = slugifyHeading(text || `heading-${level}`);
				const count = seen.get(baseId) ?? 0;
				const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
				seen.set(baseId, count + 1);

				headings.push({
					id,
					level,
					text,
					pos,
				});
			}
			return true;
		});

		return headings;
	};

	function updateHeadings(instance: CoreEditor) {
		const headings = collectHeadings(instance.state.doc);
		tocItems = headings;
		updateActiveHeading(instance, headings);
	}

	function emitChange(instance: CoreEditor) {
		const html = instance.getHTML();
		const json = instance.getJSON() as JSONContent;
		const markdown = renderMarkdown(instance.state.doc, html);
		onChange?.({ html, markdown, json });
	}

	function attachEditorEvents(instance: CoreEditor) {
		editorEventUnsubscribers.forEach((unsubscribe) => unsubscribe());
		editorEventUnsubscribers = [];

		const handleSelectionUpdate = () => syncToolbar(instance);
		const handleTransaction = () => syncToolbar(instance);
		const handleFocus = () => syncToolbar(instance);
		const handleBlur = () => syncToolbar(instance);

		instance.on('selectionUpdate', handleSelectionUpdate);
		instance.on('transaction', handleTransaction);
		instance.on('focus', handleFocus);
		instance.on('blur', handleBlur);

		editorEventUnsubscribers = [
			() => instance.off('selectionUpdate', handleSelectionUpdate),
			() => instance.off('transaction', handleTransaction),
			() => instance.off('focus', handleFocus),
			() => instance.off('blur', handleBlur),
		];
	}

	$effect(() => {
		if (!editorStore) {
			editorEventUnsubscribers.forEach((unsubscribe) => unsubscribe());
			editorEventUnsubscribers = [];
			editor = null;
			return;
		}

		const instance = $editorStore;
		if (!instance) return;

		if (editor !== instance) {
			editor = instance;
			attachEditorEvents(instance);
			if (!initialized) {
				initialized = true;
			}
		}

		syncToolbar(instance);
	});

	onMount(() => {
		const extensions = [
			StarterKit.configure({
				codeBlock: false,
				bulletList: {
					keepMarks: true,
				},
				orderedList: {
					keepMarks: true,
				},
				heading: {
					levels: [1, 2, 3, 4],
				},
			}),
			ZennCodeBlock,
			Message,
			MessageContent,
			Details,
			DetailsSummary,
			DetailsContent,
			ZennTable,
			ZennTableRow,
			ZennTableHeader,
			ZennTableCell,
			FootnoteReference,
			Embed,
			Link.configure({
				openOnClick: false,
				autolink: true,
				linkOnPaste: true,
				HTMLAttributes: {
					rel: 'noopener noreferrer nofollow',
					target: '_blank',
				},
			}),
			Image.configure({
				allowBase64: false,
				inline: false,
			}),
			Typography,
			TaskList,
			TaskItem.configure({
				nested: true,
			}),
			Placeholder.configure({
				placeholder,
			}),
			withFileHandler(onImageUpload),
			SlashCommand.configure({
				element: slashCommandElement ?? undefined,
				items: providedSlashItems,
				maxItems: slashCommandMaxItems,
			}),
		] as const;

		const store = createEditor({
			extensions: [...extensions],
			content: initialJson ?? initialContent,
			onCreate: ({ editor }) => {
				emitChange(editor);
				updateHeadings(editor);
				onReady?.({ editor });
			},
			onUpdate: ({ editor }) => {
				emitChange(editor);
				updateHeadings(editor);
			},
			onTransaction: ({ transaction }) => {
				const message = transaction.getMeta('message');
				if (message) onMessage?.(message);
			},
			editorProps: {
				attributes: {
					class: 'zenn-editor__content znc',
					spellcheck: 'false',
				},
			},
		});

		editorStore = store;

		return () => {
			editorEventUnsubscribers.forEach((unsubscribe) => unsubscribe());
			editorEventUnsubscribers = [];
			editor = null;
			editorStore = null;
		};
	});

	function syncToolbar(instance: CoreEditor) {
		toolbarState = {
			block: instance.isActive('heading', { level: 2 })
				? 'h2'
				: instance.isActive('heading', { level: 3 })
				? 'h3'
				: instance.isActive('heading', { level: 4 })
				? 'h4'
				: instance.isActive('message', { variant: 'info' })
				? 'message'
				: instance.isActive('message', { variant: 'alert' })
				? 'alert'
				: instance.isActive('details')
				? 'details'
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

	function run(command: (instance: CoreEditor) => void) {
		if (!editor) return;
		command(editor);
		syncToolbar(editor);
	}

	function updateActiveHeading(
		instance: CoreEditor,
		headings: HeadingItem[] = tocItems,
	) {
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

	const withPrevent = (handler: () => void) => (event: MouseEvent) => {
		event.preventDefault();
		handler();
	};

	function insertTable(rows = 2, cols = 2) {
		if (!editor) return;
		editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
	}

	function promptFootnote() {
		if (!editor) return;
		const id = window.prompt('脚注の識別子を入力してください');
		if (id === null) return;
		editor.chain().focus().insertFootnote({ id: id.trim() || undefined }).run();
	}

	function promptEmbed() {
		if (!editor) return;
		const service = window.prompt('埋め込みタイプ (youtube, tweet, codepen など)');
		if (!service) return;
		const url = window.prompt('埋め込む URL を入力してください');
		if (!url) return;
		editor.commands.insertEmbed(service.trim(), url.trim());
	}

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
			instance
				.chain()
				.focus()
				.extendMarkRange('link')
				.setLink({ href: url })
				.run(),
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
						class:active={toolbarState.block === 'message'}
						onmousedown={withPrevent(() =>
							run((instance) => {
				instance.chain().focus().setMessage('info' as MessageVariant).run();
							})
						)}
						aria-pressed={toolbarState.block === 'message'}
					>
						メッセージ
					</button>
					<button
						type="button"
						class:active={toolbarState.block === 'alert'}
						onmousedown={withPrevent(() =>
							run((instance) => {
				instance.chain().focus().setMessage('alert' as MessageVariant).run();
							})
						)}
						aria-pressed={toolbarState.block === 'alert'}
					>
						警告
					</button>
					<button
						type="button"
						class:active={toolbarState.block === 'details'}
						onmousedown={withPrevent(() =>
						run((instance) => {
				instance.chain().focus().setDetails().run();
						})
						)}
						aria-pressed={toolbarState.block === 'details'}
					>
						詳細
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
					<button type="button" onmousedown={withPrevent(() => promptFootnote())}>
						脚注
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
						onmousedown={withPrevent(() => insertTable())}
					>
						表
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
					<button type="button" onmousedown={withPrevent(() => promptEmbed())}>
						Embed
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
					{#if editorStore}
						<FloatingMenu
							editor={$editorStore!}
							class="zenn-editor__floating-menu"
							shouldShow={shouldShowFloatingMenu}
						>
						{#snippet children()}
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
									run((instance) =>
										instance.chain().focus().toggleHeading({ level: 2 }).run()
									)
								)}
								class:active={toolbarState.block === 'h2'}
							>
								H2
							</button>
							<button
								onmousedown={withPrevent(() =>
									run((instance) =>
										instance.chain().focus().toggleHeading({ level: 3 }).run()
									)
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
						{/snippet}
						</FloatingMenu>

						<BubbleMenu
							editor={$editorStore!}
							class="zenn-editor__bubble-menu"
							shouldShow={shouldShowBubbleMenu}
						>
						{#snippet children()}
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
							<button
								onmousedown={withPrevent(() => setLink())}
								class:active={toolbarState.link}
							>
								🔗
							</button>
						{/snippet}
					</BubbleMenu>
					{/if}

					<div class="zenn-editor__slash-menu" bind:this={slashCommandElement}></div>

					{#if editorStore}
						<EditorContent
							editor={$editorStore!}
							class="zenn-editor__host zenn-editor__content"
						/>
					{/if}
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

	:global(.msg) {
		position: relative;
		margin: 1rem 0;
		padding: 1rem 1.25rem 1rem 3rem;
		border-radius: 16px;
		background: rgba(15, 147, 255, 0.08);
		border: 1px solid rgba(15, 147, 255, 0.25);
	}

	:global(.msg.alert) {
		background: rgba(255, 99, 99, 0.08);
		border-color: rgba(255, 99, 99, 0.35);
	}

	:global(.msg::before) {
		content: '!';
		position: absolute;
		left: 1rem;
		top: 1rem;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: rgba(15, 147, 255, 0.2);
		color: #0f93ff;
		font-weight: 700;
	}

	:global(.msg.alert::before) {
		background: rgba(255, 99, 99, 0.2);
		color: #ff6363;
	}

	:global(.msg .msg-content > :first-child) {
		margin-top: 0;
	}

	:global(.msg .msg-content > :last-child) {
		margin-bottom: 0;
	}

	:global(details) {
		margin: 1rem 0;
		border: 1px solid #dfe6f1;
		border-radius: 14px;
		background: #f9fbff;
		padding: 0.5rem 1rem;
	}

	:global(details summary) {
		cursor: pointer;
		font-weight: 600;
		outline: none;
	}

	:global(.details-content) {
		padding: 0.75rem 0 0.25rem;
	}

	:global(.details) {
		margin: 1rem 0;
		border: 1px solid #dfe6f1;
		border-radius: 14px;
		background: #f9fbff;
		padding: 0.5rem 1rem;
	}

	:global(.details[data-open]) {
		background: #eef4ff;
		border-color: rgba(15, 147, 255, 0.35);
	}

	:global(.details__inner) {
		display: block;
	}

	:global(.details[data-open] .details-summary) {
		border-bottom: 1px solid rgba(15, 147, 255, 0.15);
	}

	:global(.details-summary) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-weight: 600;
		outline: none;
		margin: 0;
	}

	:global(.details-toggle) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 999px;
		border: 1px solid rgba(15, 147, 255, 0.25);
		background: #fff;
		cursor: pointer;
		transition: transform 0.2s ease;
	}

	:global(.details-toggle:focus-visible) {
		outline: 2px solid rgba(15, 147, 255, 0.5);
		outline-offset: 2px;
	}

	:global(.details-toggle__icon) {
		display: inline-block;
		width: 0;
		height: 0;
		border-left: 5px solid transparent;
		border-right: 5px solid transparent;
		border-top: 7px solid #0f93ff;
		transform: rotate(-90deg);
		transition: transform 0.2s ease;
	}

	:global(.details[data-open] .details-toggle__icon),
	:global(.details-toggle[data-open] .details-toggle__icon) {
		transform: rotate(0deg);
	}

	:global(.details-summary__content) {
		flex: 1 1 auto;
		min-width: 0;
	}

	:global(.details:not([data-open]) .details-content) {
		display: none;
	}

	:global(.zenn-embed) {
		border: 1px solid rgba(15, 147, 255, 0.2);
		border-radius: 16px;
		background: rgba(15, 147, 255, 0.05);
		margin: 1rem 0;
	}

	:global(.zenn-embed__inner) {
		padding: 1rem;
	}

	:global(.zenn-embed__inner a) {
		color: #0f93ff;
		font-weight: 600;
		word-break: break-all;
	}

	:global(pre[data-filename]) {
		position: relative;
		padding-top: 2.25rem;
	}

	:global(pre[data-filename]::before) {
		content: attr(data-filename);
		position: absolute;
		left: 1rem;
		top: 0.65rem;
		font-size: 0.75rem;
		text-transform: none;
		letter-spacing: 0;
		color: rgba(255, 255, 255, 0.7);
	}

	:global(pre[data-diff='true'] code) {
		counter-reset: diff;
	}

	:global(pre[data-diff='true'] code span.inserted) {
		background: rgba(56, 189, 116, 0.2);
	}

	:global(pre[data-diff='true'] code span.deleted) {
		background: rgba(248, 113, 113, 0.2);
	}

	:global(.footnote-ref) {
		font-size: 0.75rem;
		line-height: 1;
		margin-left: 0.15rem;
	}

	:global(.footnote-ref a) {
		text-decoration: none;
		color: #0f93ff;
	}

	:global(table.zenn-table) {
		border-collapse: collapse;
		width: 100%;
		margin: 1rem 0;
	}

	:global(table.zenn-table th),
	:global(table.zenn-table td) {
		border: 1px solid rgba(15, 147, 255, 0.2);
		padding: 0.5rem 0.75rem;
		background: #fff;
		text-align: left;
	}

	:global(table.zenn-table thead th) {
		background: rgba(15, 147, 255, 0.08);
		font-weight: 700;
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
