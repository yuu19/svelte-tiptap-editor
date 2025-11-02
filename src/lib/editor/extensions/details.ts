import { Node, mergeAttributes, InputRule, findParentNode, type CommandProps } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

const detailsInputRegex = /^:::details(?:\s+(.*))?\s$/;

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		details: {
			setDetails: (options?: { title?: string; open?: boolean }) => ReturnType;
			unsetDetails: () => ReturnType;
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
			setDetails:
				({
					title = '詳細',
					open = true
				}: { title?: string; open?: boolean } = {}) =>
				({ chain, state }: CommandProps) => {
					const { selection } = state;
					const { $from, $to } = selection;
					const range = $from.blockRange($to);

					const content =
						range && range.depth > 0 && range.start !== range.end
							? state.doc.slice(range.start, range.end).content.toJSON()
							: undefined;

					const summaryContent =
						title.trim().length > 0
							? [
									{
										type: 'text',
										text: title.trim()
									}
							  ]
							: [];

					if (range && range.start !== range.end) {
						chain().deleteRange({ from: range.start, to: range.end });
					}

					return chain()
						.insertContent({
							type: this.name,
							attrs: { open },
							content: [
								{
									type: 'detailsSummary',
									content: summaryContent
								},
								{
									type: 'detailsContent',
									content:
										content && content.length > 0 ? content : [{ type: 'paragraph' }]
								}
							]
						})
						.focus()
						.run();
				},
			unsetDetails:
				() =>
				({ state, chain }: CommandProps) => {
					const details = findParentNode((node) => node.type === this.type)(state.selection);

					if (!details) return false;

					const detailsNode = details.node;
					if (detailsNode.childCount < 2) return false;

					const summary = detailsNode.child(0);
					const content = detailsNode.child(1);

					const nodes: any[] = [];

					if (summary.content && summary.content.size > 0) {
						const paragraph = state.schema.nodes.paragraph?.create(null, summary.content);
						if (paragraph) {
							nodes.push(paragraph.toJSON());
						}
					}

					content.forEach((node) => {
						nodes.push(node.toJSON());
					});

					return chain()
						.insertContentAt({ from: details.pos, to: details.pos + details.node.nodeSize }, nodes)
						.setTextSelection(details.pos + 1)
						.run();
				}
		};
	},

	addNodeView() {
		return ({ node }) => {
			const wrapper = document.createElement('div');
			wrapper.className = 'details';

			if (node.attrs.open) {
				wrapper.setAttribute('data-open', '');
			}

			const content = document.createElement('div');
			content.className = 'details__inner';
			wrapper.appendChild(content);

			return {
				dom: wrapper,
				contentDOM: content,
				update: (updatedNode) => {
					if (updatedNode.type !== node.type) return false;
					if (updatedNode.attrs.open) {
						wrapper.setAttribute('data-open', '');
					} else {
						wrapper.removeAttribute('data-open');
					}
					return true;
				}
			};
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
						.setDetails({ title })
						.focus()
						.run();
				},
				undoable: false
			})
		];
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('detailsSelection'),
				appendTransaction: (transactions, oldState, newState) => {
					if (!transactions.some((transaction) => transaction.selectionSet)) {
						return;
					}

					const { selection } = newState;
					if (!selection.empty) return;

					const parentDetails = findParentNode((node) => node.type === this.type)(selection);
					if (!parentDetails) return;
					if (parentDetails.node.attrs.open) return;

					const summary = parentDetails.node.child(0);
					const summaryPos = parentDetails.pos + 1;

					const tr = newState.tr.setSelection(
						TextSelection.near(newState.doc.resolve(summaryPos + summary.nodeSize))
					);
					return tr;
				}
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

	addNodeView() {
		return ({ getPos, editor }) => {
			const dom = document.createElement('summary');
			dom.className = 'details-summary';

			const toggle = document.createElement('button');
			toggle.type = 'button';
			toggle.className = 'details-toggle';
			toggle.contentEditable = 'false';
			const icon = document.createElement('span');
			icon.className = 'details-toggle__icon';
			toggle.appendChild(icon);

			const content = document.createElement('span');
			content.className = 'details-summary__content';

			const updateToggleState = () => {
				const pos = typeof getPos === 'function' ? getPos() : null;
				if (pos == null) return;
				const { state } = editor;
				const resolved = state.doc.resolve(pos);
				const detailsNode = resolved.node(resolved.depth - 1);
				if (detailsNode?.attrs?.open) {
					toggle.setAttribute('data-open', '');
				} else {
					toggle.removeAttribute('data-open');
				}
			};

			toggle.addEventListener('mousedown', (event) => {
				event.preventDefault();
				event.stopPropagation();
			});

			toggle.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				const pos = typeof getPos === 'function' ? getPos() : null;
				if (pos == null) return;

				editor.commands.command(({ tr }) => {
					const resolved = tr.doc.resolve(pos);
					const detailsPos = resolved.before();
					const detailsNode = tr.doc.nodeAt(detailsPos);
					if (!detailsNode) return false;
					const nextOpen = !detailsNode.attrs.open;
					tr.setNodeMarkup(detailsPos, undefined, {
						...detailsNode.attrs,
						open: nextOpen
					});
					updateToggleState();
					return true;
				});
			});

			dom.appendChild(toggle);
			dom.appendChild(content);

			updateToggleState();

			return {
				dom,
				contentDOM: content,
				update: (node) => {
					if (node.type !== this.type) return false;
					updateToggleState();
					return true;
				}
			};
		};
	},

	addKeyboardShortcuts() {
		return {
			Backspace: ({ editor }) => {
				const { state } = editor;
				const { selection } = state;
				const { $from } = selection;
				if (!selection.empty) return false;
				if ($from.parent.type !== this.type) return false;
				if ($from.parentOffset !== 0) return false;
				return editor.commands.unsetDetails();
			}
		};
	}
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
