import { Node, mergeAttributes, type CommandProps } from '@tiptap/core';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		footnoteReference: {
			insertFootnote: (attrs?: { id?: string; label?: string }) => ReturnType;
		};
	}
}

export const FootnoteReference = Node.create({
	name: 'footnoteReference',

	group: 'inline',
	inline: true,
	atom: true,
	draggable: false,

	addAttributes() {
		return {
			id: {
				default: '',
			},
			label: {
				default: '',
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'sup[data-footnote-id]',
				getAttrs: (element) => {
					const el = element as HTMLElement;
					return {
						id: el.getAttribute('data-footnote-id') ?? '',
						label: el.textContent?.replace(/[\[\]]/g, '').trim() ?? '',
					};
				},
			},
		];
	},

	renderHTML({ HTMLAttributes, node }) {
		const id = node.attrs.id as string;
		const label = node.attrs.label || id || '?';
		return [
			'sup',
			mergeAttributes(HTMLAttributes, {
				class: 'footnote-ref',
				'data-footnote-id': id,
			}),
			['a', { href: `#footnote-${id || label}` }, `[${label}]`],
		];
	},

	addCommands() {
		return {
			insertFootnote:
				(attrs?: { id?: string; label?: string }) =>
				({ commands }: CommandProps) =>
					commands.insertContent({
						type: this.name,
						attrs: {
							id: attrs?.id ?? '',
							label: attrs?.label ?? attrs?.id ?? '',
						},
					}),
		};
	},
});
