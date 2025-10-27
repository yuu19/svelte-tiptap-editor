import { Extension, type Range, type Editor } from '@tiptap/core';
import Suggestion, {
	type SuggestionKeyDownProps,
	type SuggestionOptions,
	type SuggestionProps,
} from '@tiptap/suggestion';

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
