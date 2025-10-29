import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, all } from 'lowlight';
import { InputRule, mergeAttributes, type CommandProps } from '@tiptap/core';

const lowlight = createLowlight(all);

const fencedCodeInputRegex =
	/^```(?:(?<lang>[a-zA-Z0-9#+-]+)(?:\s+(?<filename>[^\s]+))?(?:\s+\[(?<modifier>diff)\])?)?\s$/;

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		zennCodeBlock: {
			setZennCodeBlock: (attrs?: { language?: string; filename?: string; diff?: boolean }) => ReturnType;
		};
	}
}

export const ZennCodeBlock = CodeBlockLowlight.extend({
	name: 'codeBlock',

	addAttributes() {
		return {
			language: {
				default: 'text',
				parseHTML: (element: HTMLElement) => element.getAttribute('data-language') ?? 'text',
				renderHTML: (attributes: { language: string }) => ({
					'data-language': attributes.language,
					class: `language-${attributes.language}`,
				}),
			},
			filename: {
				default: '',
				parseHTML: (element: HTMLElement) => element.getAttribute('data-filename') ?? '',
				renderHTML: (attributes: { filename: string }) =>
					attributes.filename ? { 'data-filename': attributes.filename } : {},
			},
			diff: {
				default: false,
				parseHTML: (element: HTMLElement) => element.getAttribute('data-diff') === 'true',
				renderHTML: (attributes: { diff: boolean }) =>
					attributes.diff ? { 'data-diff': 'true' } : {},
			},
		};
	},

	addOptions() {
		return {
			lowlight,
		};
	},

	renderHTML({ node, HTMLAttributes }: { node: { attrs: Record<string, unknown> }; HTMLAttributes: Record<string, unknown> }) {
		const language = (node.attrs.language as string) ?? 'text';
		const filename = (node.attrs.filename as string) ?? '';
		const diff = Boolean(node.attrs.diff);

		const attributes = mergeAttributes(HTMLAttributes, {
			'data-language': language,
			'data-filename': filename || null,
			'data-diff': diff ? 'true' : null,
		});

		return ['pre', attributes, ['code', { class: `language-${language}` }, 0]];
	},

	addCommands() {
		return {
			setZennCodeBlock:
				(attrs?: { language?: string; filename?: string; diff?: boolean }) =>
				({ commands }: CommandProps) =>
					commands.setNode(this.name, attrs ?? {}),
		};
	},

	addInputRules() {
		return [
			new InputRule({
				find: fencedCodeInputRegex,
				handler: ({ chain, range, match }) => {
					const groups = (match.groups ?? {}) as {
						lang?: string;
						filename?: string;
						modifier?: string;
					};
					const { lang, filename, modifier } = groups;

					chain()
						.deleteRange(range)
						.insertContent({
							type: this.name,
							attrs: {
								language: lang ?? 'text',
								filename: filename ?? '',
								diff: modifier === 'diff',
							},
						})
						.focus()
						.run();
				},
			}),
		];
	},
}).configure({ lowlight });
