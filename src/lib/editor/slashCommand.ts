import { Extension, type Range, type Editor } from '@tiptap/core';
import Suggestion, {
	type SuggestionKeyDownProps,
	type SuggestionOptions,
	type SuggestionProps,
} from '@tiptap/suggestion';
import type { MessageVariant } from './extensions/message';

export type SlashCommandContext = {
	editor: Editor;
	range: Range;
};

export type SlashCommandItem = {
	id: string;
	title: string;
	description: string;
	icon?: string;
	keywords?: string[];
	command: (ctx: SlashCommandContext) => void;
};

export type SlashCommandOptions = {
	element?: HTMLElement | null;
	items: SlashCommandItem[];
	maxItems?: number;
};

export const defaultSlashCommandItems: SlashCommandItem[] = [
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
			editor.chain().focus().deleteRange(range).toggleTaskList().run(),
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
	{
		id: 'message-info',
		title: 'メッセージ',
		description: '注釈付きのメッセージブロック',
		icon: '💬',
		command: ({ editor, range }) => {
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.setMessage('info' as MessageVariant)
				.run();
		},
		keywords: ['message', 'info'],
	},
	{
		id: 'message-alert',
		title: '警告メッセージ',
		description: '重要な注意や警告を強調',
		icon: '⚠️',
		command: ({ editor, range }) => {
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.setMessage('alert' as MessageVariant)
				.run();
		},
		keywords: ['alert', 'warning'],
	},
	{
	id: 'details',
	title: '詳細',
	description: '折りたたみ可能な詳細ブロック',
	icon: '▼',
	command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setDetails().run();
	},
	keywords: ['details', 'accordion'],
},
	{
		id: 'table',
		title: '表',
		description: 'ヘッダー付きの 2 x 2 テーブル',
		icon: '⌗',
		command: ({ editor, range }) => {
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertTable({ rows: 2, cols: 2, withHeaderRow: true })
				.run();
		},
		keywords: ['table'],
	},
	{
		id: 'footnote',
		title: '脚注',
		description: '脚注への参照を追加',
		icon: '※',
		command: ({ editor, range }) => {
			const label = window.prompt('脚注の識別子を入力してください');
			if (label === null) return;
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertFootnote({ id: label.trim() || undefined })
				.run();
		},
		keywords: ['footnote'],
	},
	{
		id: 'embed',
		title: 'Embed',
		description: 'URL を埋め込みカードとして追加',
		icon: '⛓',
		command: ({ editor, range }) => {
			const service = window.prompt('埋め込みタイプ (youtube, tweet など) を入力してください');
			if (!service) return;
			const url = window.prompt('埋め込む URL を入力してください');
			if (!url) return;
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertEmbed(service.trim(), url.trim())
				.run();
		},
		keywords: ['embed', 'link', 'card'],
	},
];

type RendererState = {
	element: HTMLElement;
	selectedIndex: number;
	destroyed: boolean;
	hasExternalContainer: boolean;
};

const createRenderer = (
	options: SlashCommandOptions,
): NonNullable<SuggestionOptions<SlashCommandItem>['render']> => {
	return () => {
		const element = options.element ?? document.createElement('div');
		element.classList.add('zenn-editor-slash-menu');

		const state: RendererState = {
			element,
			selectedIndex: 0,
			destroyed: false,
			hasExternalContainer: Boolean(options.element),
		};


		const ensureInDom = () => {
			if (!state.hasExternalContainer && !state.element.parentNode) {
				document.body.appendChild(state.element);
			}
		};

		const setPosition = (
			clientRect: SuggestionProps<SlashCommandItem>['clientRect'],
		) => {
			if (!clientRect) return;
			const rect = clientRect();
			if (!rect) return;

			const top = rect.bottom + window.scrollY + 8;
			const left = rect.left + window.scrollX;

			state.element.style.top = `${top}px`;
			state.element.style.left = `${left}px`;
		};

		const renderItems = (props: SuggestionProps<SlashCommandItem>) => {
			state.element.innerHTML = '';

			if (!props.items.length) {
				const empty = document.createElement('div');
				empty.className = 'zenn-editor-slash-menu__empty';
				empty.textContent = '該当するコマンドがありません';
				state.element.appendChild(empty);
				return;
			}

			const list = document.createElement('div');
			list.className = 'zenn-editor-slash-menu__list';

			props.items.forEach((item, index) => {
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'zenn-editor-slash-menu__item';
				if (index === state.selectedIndex) {
					button.classList.add('is-active');
				}

				button.innerHTML = `
					<span class="zenn-editor-slash-menu__icon">${item.icon ?? ''}</span>
					<span class="zenn-editor-slash-menu__content">
						<span class="zenn-editor-slash-menu__title">${item.title}</span>
						<span class="zenn-editor-slash-menu__description">${item.description}</span>
					</span>
				`;

				button.addEventListener('mousedown', (event) => {
					event.preventDefault();
					props.command(item);
				});

				list.appendChild(button);
			});

			state.element.appendChild(list);
		};

		const reset = () => {
			state.element.style.display = 'none';
			state.element.classList.remove('is-active');
			state.element.innerHTML = '';
			state.selectedIndex = 0;

			if (!state.hasExternalContainer && state.element.parentNode) {
				state.element.parentNode.removeChild(state.element);
			}
		};

		const onKeyDown = (props: SuggestionKeyDownProps) => {
			const typed = props as SuggestionKeyDownProps & {
				items: SlashCommandItem[];
				command: (item: SlashCommandItem) => void;
			};

			if (!typed.items.length) {
				return false;
			}

			if (props.event.key === 'ArrowDown') {
				props.event.preventDefault();
				state.selectedIndex = (state.selectedIndex + 1) % typed.items.length;
				const buttons = state.element.querySelectorAll<HTMLButtonElement>('.zenn-editor-slash-menu__item');
				buttons.forEach((button, index) => {
					button.classList.toggle('is-active', index === state.selectedIndex);
				});
				return true;
			}

			if (props.event.key === 'ArrowUp') {
				props.event.preventDefault();
				state.selectedIndex =
					(state.selectedIndex + typed.items.length - 1) % typed.items.length;
				const buttons = state.element.querySelectorAll<HTMLButtonElement>('.zenn-editor-slash-menu__item');
				buttons.forEach((button, index) => {
					button.classList.toggle('is-active', index === state.selectedIndex);
				});
				return true;
			}

			if (props.event.key === 'Enter') {
				props.event.preventDefault();
				typed.command(typed.items[state.selectedIndex]);
				return true;
			}

			if (props.event.key === 'Escape') {
				props.event.preventDefault();
				reset();
				return true;
			}

			return false;
		};

		return {
			onStart(props) {
				if (state.destroyed) return;

				ensureInDom();
				state.element.style.display = 'block';
				state.element.classList.add('is-active');
				state.selectedIndex = 0;
				renderItems(props);
				setPosition(props.clientRect);
			},
			onUpdate(props) {
				if (state.destroyed) return;

				if (!props.items.length) {
					state.selectedIndex = 0;
				} else if (state.selectedIndex >= props.items.length) {
					state.selectedIndex = props.items.length - 1;
				}

				renderItems(props);
				setPosition(props.clientRect);
			},
			onKeyDown,
			onExit() {
				reset();
			},
			destroy() {
				reset();
				state.destroyed = true;
			},
		};
	};
};

export const SlashCommand = Extension.create<SlashCommandOptions>({
	name: 'slash-command',
	addOptions() {
		return {
			element: null,
			items: [],
			maxItems: 8,
		};
	},
	addProseMirrorPlugins() {
		const options = this.options;

	return [
			Suggestion({
				editor: this.editor,
				char: '/',
				startOfLine: true,
				allowSpaces: false,
				allow: ({ state }) => {
					const { $from } = state.selection;
					return $from.parent.type.name === 'paragraph' && $from.depth === 1;
				},
				items: ({ query }) => {
					const value = query?.toLowerCase() ?? '';

					const filtered = options.items.filter((item) => {
						if (!value) return true;
						const haystack = [
							item.title,
							item.description,
							...(item.keywords ?? []),
						]
							.join(' ')
							.toLowerCase();
						return haystack.includes(value);
					});

					const limit = options.maxItems ?? 8;
					return filtered.slice(0, limit);
				},
				command: ({ editor, range, props }) => {
					props.command({ editor, range });
				},
				render: createRenderer(options),
			}),
		];
	},
});

export default SlashCommand;
