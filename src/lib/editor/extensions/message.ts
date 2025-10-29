import { Node, mergeAttributes, InputRule, type CommandProps } from '@tiptap/core';

export type MessageVariant = 'info' | 'alert';

export interface MessageOptions {
	defaultVariant: MessageVariant;
}

const messageInputRegex = /^:::(message|alert)\s$/;

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		message: {
			setMessage: (variant?: MessageVariant) => ReturnType;
		};
	}
}

export const Message = Node.create<MessageOptions>({
	name: 'message',

	group: 'block',
	content: 'messageContent',
	defining: true,
	isolating: true,

	addOptions() {
		return {
			defaultVariant: 'info',
		};
	},

	addAttributes() {
		return {
			variant: {
				default: this.options.defaultVariant,
				parseHTML: (element: HTMLElement) =>
					element.classList.contains('alert') ? 'alert' : 'info',
				renderHTML: (attributes: { variant: MessageVariant }) => ({
					'data-variant': attributes.variant,
					class: `msg ${attributes.variant === 'alert' ? 'alert' : 'info'}`,
				}),
			},
		};
	},

	parseHTML() {
		return [
			{ tag: 'aside.msg' },
			{ tag: 'aside.msg.alert', priority: 100 },
			{ tag: 'aside.msg.info', priority: 100 },
		];
	},

	renderHTML({ HTMLAttributes }) {
		return ['aside', mergeAttributes({ class: 'msg' }, HTMLAttributes), 0];
	},

	addCommands() {
		return {
			setMessage:
				(variant: MessageVariant = 'info') =>
				({ commands }: CommandProps) =>
					commands.insertContent({
						type: this.name,
						attrs: { variant },
						content: [
							{
								type: 'messageContent',
								content: [{ type: 'paragraph' }],
							},
						],
					}),
		};
	},

	addInputRules() {
		return [
			new InputRule({
				find: messageInputRegex,
				handler: ({ chain, range, match }) => {
					const variant = match[1] === 'alert' ? 'alert' : 'info';
					chain()
						.deleteRange(range)
						.insertContent({
							type: this.name,
							attrs: { variant },
							content: [
								{
									type: 'messageContent',
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

export const MessageContent = Node.create({
	name: 'messageContent',

	content: 'block+',
	defining: true,

	parseHTML() {
		return [{ tag: 'div.msg-content' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes({ class: 'msg-content' }, HTMLAttributes), 0];
	},
});
