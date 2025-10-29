import { Node, mergeAttributes, InputRule, type CommandProps } from '@tiptap/core';

const detailsInputRegex = /^:::details(?:\s+(.*))?\s$/;

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		details: {
			insertDetails: (options?: { title?: string; open?: boolean }) => ReturnType;
		};
	}
}

export const Details = Node.create({
	name: 'details',

	group: 'block',
	content: 'detailsSummary detailsContent',
	defining: true,
	isolating: true,

	addAttributes() {
		return {
			open: {
				default: false,
				parseHTML: (element: HTMLElement) => element.hasAttribute('open'),
				renderHTML: (attributes: { open: boolean }) => ({
					open: attributes.open ? 'open' : null,
				}),
			},
		};
	},

	parseHTML() {
		return [{ tag: 'details' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['details', mergeAttributes(HTMLAttributes), 0];
	},

	addCommands() {
		return {
			insertDetails:
				({
					title = '詳細',
					open = false,
				}: { title?: string; open?: boolean } = {}) =>
				({ commands }: CommandProps) =>
					commands.insertContent({
						type: this.name,
						attrs: { open },
						content: [
							{
								type: 'detailsSummary',
								content: [
									{
										type: 'text',
										text: title,
									},
								],
							},
							{
								type: 'detailsContent',
								content: [{ type: 'paragraph' }],
							},
						],
					}),
		};
	},

	addInputRules() {
		return [
			new InputRule({
				find: detailsInputRegex,
				handler: ({ chain, match, range }) => {
					const title = (match[1] ?? '詳細').trim() || '詳細';
					chain()
						.deleteRange(range)
						.insertContent({
							type: this.name,
							content: [
								{
									type: 'detailsSummary',
									content: [{ type: 'text', text: title }],
								},
								{
									type: 'detailsContent',
									content: [{ type: 'paragraph' }],
								},
							],
						})
						.focus()
						.run();
				},
			}),
		];
	},
});

export const DetailsSummary = Node.create({
	name: 'detailsSummary',

	content: 'inline*',
	defining: true,
	draggable: false,
	selectable: false,

	parseHTML() {
		return [{ tag: 'summary' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['summary', mergeAttributes(HTMLAttributes), 0];
	},
});

export const DetailsContent = Node.create({
	name: 'detailsContent',

	content: 'block+',
	defining: true,

	parseHTML() {
		return [{ tag: 'div.details-content' }, { tag: 'div.msg-content' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes({ class: 'details-content' }, HTMLAttributes), 0];
	},
});
