import { Editor, type Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import FileHandler from '@tiptap/extension-file-handler';
import Placeholder from '@tiptap/extension-placeholder';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import FloatingMenu from '@tiptap/extension-floating-menu';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Typography from '@tiptap/extension-typography';
import type { BubbleMenuOptions } from '@tiptap/extension-bubble-menu';
import type { FloatingMenuOptions } from '@tiptap/extension-floating-menu';

import SlashCommand, {
	type SlashCommandItem,
	type SlashCommandOptions,
} from './slashCommand';

type RenderMarkdown = (doc: unknown) => string;

export type CreateZennEditorProps = {
	target: HTMLElement;
	bubbleMenuElement?: HTMLElement | null;
	floatingMenuElement?: HTMLElement | null;
	slashCommandElement?: HTMLElement | null;
	initialContent?: string;
	placeholder?: string;
	renderMarkdown?: RenderMarkdown;
	onChange?: (html: string, markdown: string) => void;
	onImageUpload?: (files: File[]) => Promise<string[]>;
	onMessage?: (message: unknown) => void;
	onHeadingsChange?: (headings: HeadingItem[]) => void;
	slashCommandItems?: SlashCommandItem[];
	slashCommandMaxItems?: SlashCommandOptions['maxItems'];
};

export type ZennEditorInstance = {
	editor: Editor;
	destroy: () => void;
};

export type HeadingItem = {
	id: string;
	level: number;
	text: string;
	pos: number;
};

const defaultSlashCommandItems: SlashCommandItem[] = [
	{
		id: 'paragraph',
		title: '段落',
		description: '通常のテキストブロック',
		icon: '¶',
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setParagraph().run(),
		keywords: ['text', 'p'],
	},
	{
		id: 'heading-2',
		title: '見出し 2',
		description: 'セクションの見出しを追加',
		icon: 'H2',
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
		keywords: ['h2', 'heading'],
	},
	{
		id: 'heading-3',
		title: '見出し 3',
		description: 'サブセクションの見出し',
		icon: 'H3',
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
		keywords: ['h3', 'heading'],
	},
	{
		id: 'quote',
		title: '引用',
		description: '引用ブロックを追加',
		icon: '❝',
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
		keywords: ['blockquote'],
	},
	{
		id: 'code-block',
		title: 'コードブロック',
		description: 'シンタックスハイライト付きコードブロック',
		icon: '</>',
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
		keywords: ['code'],
	},
	{
		id: 'bullet-list',
		title: '箇条書き',
		description: '通常の箇条書きリスト',
		icon: '•',
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleBulletList().run(),
		keywords: ['list', 'ul'],
	},
	{
		id: 'ordered-list',
		title: '番号付きリスト',
		description: '番号付きのリスト',
		icon: '1.',
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
		keywords: ['list', 'ol'],
	},
	{
		id: 'task-list',
		title: 'タスクリスト',
		description: 'チェックボックス付きリスト',
		icon: '☑︎',
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.toggleTaskList()
				.run(),
		keywords: ['todo', 'task'],
	},
	{
		id: 'horizontal-rule',
		title: '区切り線',
		description: 'セクションの区切り線を挿入',
		icon: '―',
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
		keywords: ['divider', 'hr'],
	},
	{
		id: 'image',
		title: '画像',
		description: '画像を挿入（URL指定）',
		icon: '🖼',
		command: ({ editor, range }) => {
			const url = window.prompt('画像のURLを入力してください');
			if (!url) return;
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.setImage({ src: url })
				.run();
		},
		keywords: ['img', 'photo'],
	},
];

const withFileHandler = (
	onImageUpload?: CreateZennEditorProps['onImageUpload'],
) => {
	return FileHandler.configure({
		allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
		onDrop(editorInstance: Editor, files: File[]) {
			if (!onImageUpload) return;
			onImageUpload(files)
				.then((urls) => {
					urls.forEach((src) => editorInstance.chain().focus().setImage({ src }).run());
				})
				.catch((error) => {
					console.warn('Image upload failed', error);
				});
		},
		onPaste(editorInstance: Editor, files: File[]) {
			if (!onImageUpload) return;
			onImageUpload(files)
				.then((urls) => {
					urls.forEach((src) => editorInstance.chain().focus().setImage({ src }).run());
				})
				.catch((error) => {
					console.warn('Image upload failed', error);
				});
		},
	});
};

type BubbleMenuShouldShowProps = Parameters<
  NonNullable<BubbleMenuOptions['shouldShow']>
>[0];

const shouldShowBubbleMenu = ({ editor }: BubbleMenuShouldShowProps) => {
  const { state } = editor;
  const { from, to } = state.selection;
  if (from === to) return false;
  return editor.isActive('paragraph') || editor.isActive('heading') || editor.isActive('listItem');
};

type FloatingMenuShouldShowProps = Parameters<
  NonNullable<FloatingMenuOptions['shouldShow']>
>[0];

const shouldShowFloatingMenu = ({ editor, state }: FloatingMenuShouldShowProps) => {
	const { selection } = state;
	const { $from } = selection;
	if (!$from) return false;

	const isAtStart = selection.empty && $from.parentOffset === 0;
	return isAtStart && editor.isActive('paragraph') && $from.parent.textContent.length === 0;
};

const slugifyHeading = (text: string) =>
	text
		.toLowerCase()
		.trim()
		.replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.slice(0, 80) || 'heading';

const collectHeadings = (doc: Editor['state']['doc']): HeadingItem[] => {
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

export function createZennEditor({
	target,
	bubbleMenuElement,
	floatingMenuElement,
	slashCommandElement,
	initialContent,
	placeholder = '本文を入力...',
	renderMarkdown = () => '',
	onChange,
	onImageUpload,
	onMessage,
	onHeadingsChange,
	slashCommandItems = defaultSlashCommandItems,
	slashCommandMaxItems,
}: CreateZennEditorProps): ZennEditorInstance {
	const extensions = [
		StarterKit.configure({
			codeBlock: {
				HTMLAttributes: { class: 'znc-code-block' },
			},
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
			items: slashCommandItems,
			maxItems: slashCommandMaxItems,
		}),
	] as const;

	const optionalExtensions: Extension[] = [];

	if (bubbleMenuElement) {
		optionalExtensions.push(
			BubbleMenu.configure({
				element: bubbleMenuElement,
				options: {
					placement: 'top',
					strategy: 'fixed',
					offset: 8,
				},
				shouldShow: shouldShowBubbleMenu,
			} as Partial<BubbleMenuOptions>),
		);
	}

	if (floatingMenuElement) {
		optionalExtensions.push(
			FloatingMenu.configure({
				element: floatingMenuElement,
				options: {
					placement: 'left-start',
					strategy: 'fixed',
					offset: 8,
				},
				shouldShow: shouldShowFloatingMenu,
			} as Partial<FloatingMenuOptions>),
		);
	}

	const editor = new Editor({
		element: target,
		extensions: [...extensions, ...optionalExtensions],
		content: initialContent ?? '',
		onUpdate: ({ editor }) => {
			const html = editor.getHTML();
			const markdown = renderMarkdown(editor.state.doc);
			onChange?.(html, markdown);
			onHeadingsChange?.(collectHeadings(editor.state.doc));
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

	onHeadingsChange?.(collectHeadings(editor.state.doc));

	return {
		editor,
		destroy: () => editor.destroy(),
	};
}
