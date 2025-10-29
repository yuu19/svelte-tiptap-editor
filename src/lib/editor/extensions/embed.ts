import { Node, mergeAttributes, InputRule, type CommandProps } from '@tiptap/core';

const embedInputRegex = /^@\[([a-zA-Z0-9_-]+)\]\((.+)\)\s*$/;

export type EmbedOptions = {
	services: Record<string, (url: string) => { html: string; iframe?: boolean } | undefined>;
};

const defaultServices: EmbedOptions['services'] = {
	youtube: (url) => ({
		html: `<iframe src="${url.replace('watch?v=', 'embed/')}" allowfullscreen></iframe>`,
		iframe: true,
	}),
	tweet: (url) => ({
		html: `<blockquote class="twitter-tweet"><a href="${url}">${url}</a></blockquote>`,
	}),
	codepen: (url) => ({
		html: `<iframe src="${url}" allowfullscreen></iframe>`,
		iframe: true,
	}),
};

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		embed: {
			insertEmbed: (service: string, url: string) => ReturnType;
		};
	}
}

export const Embed = Node.create<EmbedOptions>({
	name: 'embed',

	group: 'block',
	atom: true,
	draggable: true,

	addOptions() {
		return {
			services: defaultServices,
		};
	},

	addAttributes() {
		return {
			service: {
				default: 'embed',
			},
			url: {
				default: '',
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'div[data-embed-service]',
				getAttrs: (dom) => {
					const element = dom as HTMLElement;
					return {
						service: element.getAttribute('data-embed-service') ?? 'embed',
						url: element.getAttribute('data-embed-url') ?? '',
					};
				},
			},
		];
	},

	renderHTML({ HTMLAttributes, node }) {
		const service = node.attrs.service as string;
		const url = node.attrs.url as string;

		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				class: `zenn-embed zenn-embed--${service}`,
				'data-embed-service': service,
				'data-embed-url': url,
			}),
			[
				'div',
				{ class: 'zenn-embed__inner' },
				['a', { href: url, rel: 'noopener noreferrer', target: '_blank' }, url],
			],
		];
	},

	addCommands() {
		return {
			insertEmbed:
				(service: string, url: string) =>
				({ commands }: CommandProps) =>
					commands.insertContent({
						type: this.name,
						attrs: { service, url },
					}),
		};
	},

	addInputRules() {
		return [
			new InputRule({
				find: embedInputRegex,
				handler: ({ chain, match, range }) => {
					const service = match[1];
					const url = match[2];
					chain()
						.deleteRange(range)
						.insertContent({
							type: this.name,
							attrs: {
								service,
								url,
							},
						})
						.focus()
						.run();
				},
			}),
		];
	},
});
