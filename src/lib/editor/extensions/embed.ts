import { Node, mergeAttributes, InputRule, type CommandProps } from '@tiptap/core';
import type { DOMOutputSpec, ResolvedPos } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const embedInputRegex = /^@\[([a-zA-Z0-9_-]+)\]\((.+)\)\s*$/;

type HTMLAttributes = Record<string, any>;

type EmbedServiceConfig = {
	transformUrl?: (url: string) => string | null;
	render: (ctx: {
		service: string;
		url: string;
		HTMLAttributes: HTMLAttributes;
	}) => DOMOutputSpec | null;
};

export type EmbedOptions = {
	services: Record<string, EmbedServiceConfig>;
	detectService: (url: string) => string | null;
	fallbackService: string;
};

const DEFAULT_FALLBACK_SERVICE = 'link';

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
			services: createDefaultServices(),
			detectService: defaultDetectService,
			fallbackService: DEFAULT_FALLBACK_SERVICE
		};
	},

	addAttributes() {
		return {
			service: {
				default: DEFAULT_FALLBACK_SERVICE
			},
			url: {
				default: ''
			}
		};
	},

	parseHTML() {
		const parse = (element: HTMLElement) => {
			let service =
				element.getAttribute('data-embed-service') ?? element.dataset?.embedService ?? undefined;
			let url = element.getAttribute('data-embed-url') ?? element.dataset?.embedUrl ?? '';

			if (!url) {
				const iframe = element.querySelector('iframe');
				if (iframe) {
					const dataContent = iframe.getAttribute('data-content');
					const src = iframe.getAttribute('src');
					if (dataContent) {
						try {
							url = decodeURIComponent(dataContent);
						} catch {
							url = dataContent;
						}
					} else if (src) {
						url = src;
					}
				}
			}

			if (!service) {
				service = deriveServiceFromClass(element.className);
			}

			if (!url) {
				return false;
			}

			const normalizedService = normalizeServiceName(service) || DEFAULT_FALLBACK_SERVICE;
			const sanitizedUrl = sanitizeUrl(url) ?? url;

			const prepared = prepareEmbedAttributes(normalizedService, sanitizedUrl, this.options);
			if (prepared) {
				return prepared;
			}

			return {
				service: normalizedService,
				url: sanitizedUrl
			};
		};

		return [
			{
				tag: 'span[data-embed-service]',
				getAttrs: (dom) => parse(dom as HTMLElement)
			},
			{
				tag: 'span.embed-block',
				getAttrs: (dom) => parse(dom as HTMLElement)
			},
			{
				tag: 'div[data-embed-service]',
				getAttrs: (dom) => parse(dom as HTMLElement)
			}
		];
	},

	renderHTML({ HTMLAttributes, node }) {
		const rawService = node.attrs.service as string | undefined;
		const storedUrl = node.attrs.url as string | undefined;
		const normalizedService = normalizeServiceName(rawService) || this.options.fallbackService;
		const config =
			this.options.services[normalizedService] ??
			this.options.services[this.options.fallbackService];
		const url = sanitizeUrl(storedUrl ?? '') ?? storedUrl ?? '';

		if (!config) {
			return createLinkSpec(normalizedService, url, HTMLAttributes);
		}

		const spec = config.render({
			service: normalizedService,
			url,
			HTMLAttributes
		});

		return spec ?? createLinkSpec(normalizedService, url, HTMLAttributes);
	},

	addCommands() {
		const extension = this;
		return {
			insertEmbed:
				(service: string, url: string) =>
				({ commands }: CommandProps) => {
					const attrs = prepareEmbedAttributes(service, url, extension.options);
					if (!attrs) return false;
					return commands.insertContent({
						type: extension.name,
						attrs
					});
				}
		};
	},

	addInputRules() {
		const extension = this;
		return [
			new InputRule({
				find: embedInputRegex,
				handler: ({ chain, match, range }) => {
					const service = match[1];
					const url = match[2];
					const attrs = prepareEmbedAttributes(service, url, extension.options);
					if (!attrs) return;
					chain()
						.deleteRange(range)
						.insertContent({
							type: extension.name,
							attrs
						})
						.focus()
						.run();
				}
			})
		];
	},

	addProseMirrorPlugins() {
		const extension = this;
		return [
			new Plugin({
				key: EMBED_PASTE_HANDLER_KEY,
				props: {
					handlePaste(view, event, slice) {
						const { state } = view;
						const { selection } = state;
						if (!selection.empty) return false;

						const $from = selection.$from;
						if (!isAllowedEmbedContext($from)) return false;

						const clipboardText =
							event?.clipboardData?.getData('text/plain')?.trim() ?? '';
						const sliceText = slice.content.textBetween(0, slice.content.size, ' ', ' ').trim();
						const text = clipboardText || sliceText;
						if (!text || text.includes('\n')) return false;

						const sanitizedInput = sanitizeUrl(text);
						if (!sanitizedInput) return false;

						const detectedService = extension.options.detectService?.(sanitizedInput) ?? null;
						const attrs = prepareEmbedAttributes(detectedService, sanitizedInput, extension.options);
						if (!attrs) return false;

						if (!attrs.service || attrs.service === extension.options.fallbackService) {
							return false;
						}

						const embedNode = state.schema.nodes.embed;
						if (!embedNode) return false;

						const tr = state.tr.replaceSelectionWith(embedNode.create(attrs)).scrollIntoView();
						view.dispatch(tr);
						return true;
					}
				}
			})
		];
	}
});

const EMBED_PASTE_HANDLER_KEY = new PluginKey('embedPasteHandler');

function isAllowedEmbedContext($from: ResolvedPos): boolean {
	if ($from.parent.type.name !== 'paragraph') return false;
	if ($from.depth === 1) return true;
	return hasDetailsContentAncestor($from);
}

function hasDetailsContentAncestor($from: ResolvedPos): boolean {
	for (let depth = $from.depth; depth >= 0; depth -= 1) {
		const node = $from.node(depth);
		if (node.type?.name === 'detailsContent') {
			return true;
		}
	}
	return false;
}

function createDefaultServices(): Record<string, EmbedServiceConfig> {
	return {
		youtube: {
			transformUrl: transformYoutubeUrl,
			render: ({ service, url, HTMLAttributes }) =>
				createIframeSpec(service, url, HTMLAttributes, {
					allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
					referrerpolicy: 'strict-origin-when-cross-origin',
					title: 'YouTube video'
				})
		},
		tweet: {
			transformUrl: transformTweetUrl,
			render: ({ url, HTMLAttributes }) => createTweetSpec(url, HTMLAttributes)
		},
		codepen: {
			transformUrl: transformCodepenUrl,
			render: ({ service, url, HTMLAttributes }) =>
				createIframeSpec(service, url, HTMLAttributes, {
					scrolling: 'no',
					allowfullscreen: '',
					style: 'width: 100%; height: 420px; border: 0;',
					title: 'CodePen embed'
				})
		},
		codesandbox: {
			transformUrl: transformCodesandboxUrl,
			render: ({ service, url, HTMLAttributes }) =>
				createIframeSpec(service, url, HTMLAttributes, {
					allow:
						'accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking',
					allowfullscreen: '',
					sandbox:
						'allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts',
					style: 'width: 100%; height: 500px; border: 0; border-radius: 8px; overflow: hidden;',
					title: 'CodeSandbox embed'
				})
		},
		stackblitz: {
			transformUrl: transformStackblitzUrl,
			render: ({ service, url, HTMLAttributes }) =>
				createIframeSpec(service, url, HTMLAttributes, {
					style: 'width: 100%; height: 500px; border: 0; border-radius: 8px; overflow: hidden;',
					title: 'StackBlitz embed'
				})
		},
		figma: {
			transformUrl: transformFigmaUrl,
			render: ({ service, url, HTMLAttributes }) =>
				createIframeSpec(service, url, HTMLAttributes, {
					style: 'border: none; width: 100%; aspect-ratio: 16 / 9;',
					title: 'Figma embed'
				})
		},
		docswell: {
			transformUrl: transformDocswellUrl,
			render: ({ service, url, HTMLAttributes }) =>
				createIframeSpec(service, url, HTMLAttributes, {
					class: 'docswell-iframe',
					style:
						'border: 1px solid #ccc; display: block; margin: 0 auto; padding: 0; aspect-ratio: 16 / 9;',
					width: '100%',
					title: 'Docswell embed'
				})
		},
		speakerdeck: {
			transformUrl: transformSpeakerdeckUrl,
			render: ({ service, url, HTMLAttributes }) =>
				createSpeakerdeckSpec(service, url, HTMLAttributes)
		},
		slideshare: {
			transformUrl: transformSlideshareUrl,
			render: ({ service, url, HTMLAttributes }) =>
				createIframeSpec(service, url, HTMLAttributes, {
					scrolling: 'no',
					allowfullscreen: '',
					style: 'width: 100%; border: 0;',
					title: 'SlideShare embed'
				})
		},
		link: {
			transformUrl: (url) => url,
			render: ({ service, url, HTMLAttributes }) => createLinkSpec(service, url, HTMLAttributes)
		}
	};
}

function defaultDetectService(url: string): string | null {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();

		if (
			host === 'youtu.be' ||
			host === 'youtube.com' ||
			host === 'www.youtube.com' ||
			host === 'm.youtube.com' ||
			host === 'youtube-nocookie.com'
		) {
			return 'youtube';
		}

		if (
			host === 'twitter.com' ||
			host === 'www.twitter.com' ||
			host === 'mobile.twitter.com' ||
			host === 'x.com' ||
			host === 'www.x.com'
		) {
			return 'tweet';
		}

		if (host.endsWith('codepen.io')) {
			return 'codepen';
		}

		if (host.endsWith('codesandbox.io')) {
			return 'codesandbox';
		}

		if (host.endsWith('stackblitz.com')) {
			return 'stackblitz';
		}

		if (host.endsWith('figma.com')) {
			return 'figma';
		}

		if (host.endsWith('docswell.com')) {
			return 'docswell';
		}

		if (host.endsWith('speakerdeck.com')) {
			return 'speakerdeck';
		}

		if (host.endsWith('slideshare.net')) {
			return 'slideshare';
		}

		return null;
	} catch {
		return null;
	}
}

function prepareEmbedAttributes(
	serviceCandidate: string | null | undefined,
	urlInput: string,
	options: EmbedOptions
): { service: string; url: string } | null {
	const sanitizedOriginal = sanitizeUrl(urlInput);
	if (!sanitizedOriginal) {
		return null;
	}

	const candidates: string[] = [];
	const pushCandidate = (value?: string | null) => {
		const normalized = normalizeServiceName(value);
		if (!normalized) return;
		if (!candidates.includes(normalized)) {
			candidates.push(normalized);
		}
	};

	pushCandidate(serviceCandidate);
	pushCandidate(options.detectService?.(sanitizedOriginal));
	pushCandidate(options.fallbackService);

	for (const candidate of candidates) {
		const config = options.services[candidate];
		if (!config) {
			continue;
		}

		const transformed = config.transformUrl
			? config.transformUrl(sanitizedOriginal)
			: sanitizedOriginal;

		if (!transformed) {
			continue;
		}

		const finalUrl = sanitizeUrl(transformed);
		if (!finalUrl) {
			continue;
		}

		return {
			service: candidate,
			url: finalUrl
		};
	}

	return null;
}

function createIframeSpec(
	service: string,
	url: string,
	HTMLAttributes: HTMLAttributes,
	iframeAttrs: HTMLAttributes = {},
	wrapperExtra: HTMLAttributes = {}
): DOMOutputSpec {
	const wrapperAttrs = mergeAttributes(
		{
			class: `embed-block embed-${service}`,
			'data-embed-service': service,
			'data-embed-url': url
		},
		wrapperExtra,
		HTMLAttributes
	);

	return [
		'span',
		wrapperAttrs,
		[
			'iframe',
			{
				src: url,
				loading: 'lazy',
				allowfullscreen: '',
				...iframeAttrs
			}
		]
	];
}

function createTweetSpec(url: string, HTMLAttributes: HTMLAttributes): DOMOutputSpec {
	const wrapperAttrs = mergeAttributes(
		{
			class: 'embed-block embed-tweet',
			'data-embed-service': 'tweet',
			'data-embed-url': url
		},
		HTMLAttributes
	);

	const embedSrc = createTweetEmbedSrc(url);

	if (!embedSrc) {
		return [
			'span',
			wrapperAttrs,
			[
				'blockquote',
				{ class: 'twitter-tweet', 'data-dnt': 'true' },
				['a', { href: url, rel: 'noopener noreferrer', target: '_blank' }, 'View Tweet']
			]
		];
	}

	return [
		'span',
		wrapperAttrs,
		[
			'iframe',
			{
				src: embedSrc,
				loading: 'lazy',
				allow:
					'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
				title: 'Tweet embed',
				style: 'border: none; width: 100%; min-height: 420px;',
				'data-tweet-url': url
			}
		]
	];
}

function createSpeakerdeckSpec(
	service: string,
	url: string,
	HTMLAttributes: HTMLAttributes
): DOMOutputSpec {
	if (!isSpeakerdeckPlayerUrl(url)) {
		return createLinkSpec(service, url, HTMLAttributes);
	}

	const wrapperAttrs = mergeAttributes(
		{
			class: `embed-block embed-${service}`,
			'data-embed-service': service,
			'data-embed-url': url
		},
		HTMLAttributes
	);

	return [
		'span',
		wrapperAttrs,
		[
			'iframe',
			{
				src: url,
				scrolling: 'no',
				allowfullscreen: '',
				allow: 'encrypted-media',
				loading: 'lazy',
				frameborder: '0',
				title: 'Speaker Deck presentation'
			}
		]
	];
}

function createLinkSpec(
	service: string,
	url: string,
	HTMLAttributes: HTMLAttributes
): DOMOutputSpec {
	const wrapperAttrs = mergeAttributes(
		{
			class: `embed-block embed-${service}`,
			'data-embed-service': service,
			'data-embed-url': url
		},
		HTMLAttributes
	);

	return [
		'span',
		wrapperAttrs,
		['a', { href: url, rel: 'noopener noreferrer', target: '_blank' }, formatDisplayUrl(url)]
	];
}

function normalizeServiceName(service?: string | null): string {
	if (!service) return '';
	const value = service.trim().toLowerCase();
	if (!value || value === 'auto' || value === 'embed' || value === 'default') {
		return '';
	}

	switch (value) {
		case 'twitter':
		case 'x':
			return 'tweet';
		case 'yt':
		case 'youtube':
			return 'youtube';
		case 'codesand':
		case 'codesandbox':
			return 'codesandbox';
		case 'stack':
		case 'stackblitz':
			return 'stackblitz';
		case 'links':
		case 'link':
			return 'link';
		case 'card':
		case 'github':
		case 'gist':
		case 'mermaid':
			return 'link';
		default:
			return value;
	}
}

function sanitizeUrl(input: string | null | undefined): string | null {
	if (!input) return null;
	try {
		const parsed = new URL(input);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return null;
		}
		return parsed.toString();
	} catch {
		return null;
	}
}

function deriveServiceFromClass(className: string | undefined): string | undefined {
	if (!className) return undefined;
	const match = className.match(/embed-([a-z0-9-]+)/i);
	return match ? normalizeServiceName(match[1]) : undefined;
}

function isSpeakerdeckPlayerUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return (
			parsed.hostname.toLowerCase().endsWith('speakerdeck.com') &&
			parsed.pathname.startsWith('/player/')
		);
	} catch {
		return false;
	}
}

function createTweetEmbedSrc(url: string): string | null {
	const info = parseTweetUrl(url);
	if (!info) return null;
	const params = new URLSearchParams({
		id: info.statusId,
		dnt: 'true',
		theme: 'light'
	});
	return `https://platform.twitter.com/embed/Tweet.html?${params.toString()}`;
}

function parseTweetUrl(url: string): { user: string; statusId: string } | null {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();
		if (
			host !== 'twitter.com' &&
			host !== 'www.twitter.com' &&
			host !== 'mobile.twitter.com' &&
			host !== 'x.com' &&
			host !== 'www.x.com'
		) {
			return null;
		}

		const segments = parsed.pathname.split('/').filter(Boolean);
		if (segments.length < 3 || segments[1] !== 'status') {
			return null;
		}

		const user = segments[0];
		const statusId = segments[2];
		if (!/^[0-9]+$/.test(statusId)) {
			return null;
		}

		return { user, statusId };
	} catch {
		return null;
	}
}

function formatDisplayUrl(url: string): string {
	return url.length > 120 ? `${url.slice(0, 117)}...` : url;
}

function transformYoutubeUrl(url: string): string | null {
	const params = extractYoutubeParameters(url);
	if (!params) return null;
	const startQuery =
		typeof params.start === 'number' && params.start > 0 ? `?start=${params.start}` : '';
	return `https://www.youtube-nocookie.com/embed/${params.videoId}${startQuery}`;
}

function extractYoutubeParameters(url: string): { videoId: string; start?: number } | null {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();
		let videoId: string | null = null;

		if (host === 'youtu.be') {
			videoId = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
		} else if (
			host === 'youtube.com' ||
			host === 'www.youtube.com' ||
			host === 'm.youtube.com' ||
			host === 'youtube-nocookie.com'
		) {
			if (parsed.pathname === '/watch') {
				videoId = parsed.searchParams.get('v');
			} else if (parsed.pathname.startsWith('/embed/')) {
				videoId = parsed.pathname.split('/').filter(Boolean)[1] ?? null;
			} else if (parsed.pathname.startsWith('/shorts/')) {
				videoId = parsed.pathname.split('/').filter(Boolean)[1] ?? null;
			}
		}

		if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
			return null;
		}

		const start = clampYoutubeStart(
			parsed.searchParams.get('start') ??
				parsed.searchParams.get('t') ??
				(parsed.hash?.startsWith('#t=') ? parsed.hash.slice(3) : null)
		);

		return { videoId, start };
	} catch {
		return null;
	}
}

function clampYoutubeStart(value: string | null): number | undefined {
	if (!value) return undefined;
	const seconds = parseYoutubeTimestamp(value);
	if (seconds === undefined) return undefined;
	return Math.min(Math.max(seconds, 0), 48 * 60 * 60);
}

function parseYoutubeTimestamp(value: string): number | undefined {
	if (/^\d+$/.test(value)) {
		return Number(value);
	}

	const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
	if (!match) return undefined;

	const hours = Number(match[1] ?? 0);
	const minutes = Number(match[2] ?? 0);
	const seconds = Number(match[3] ?? 0);

	const total = hours * 3600 + minutes * 60 + seconds;
	return total > 0 ? total : undefined;
}

function transformTweetUrl(url: string): string | null {
	const info = parseTweetUrl(url);
	if (!info) return null;
	return `https://twitter.com/${info.user}/status/${info.statusId}`;
}

function transformCodepenUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (!parsed.hostname.endsWith('codepen.io')) return null;
		const segments = parsed.pathname.split('/').filter(Boolean);
		if (segments.length < 3) return null;
		const [user, type, slug] = segments;
		if (type === 'embed') {
			return parsed.toString();
		}
		if (!['pen', 'full', 'details', 'debug'].includes(type)) {
			return null;
		}
		const embed = new URL(`https://codepen.io/${user}/embed/${slug}`);
		embed.search = parsed.search || '?default-tab=html%2Cresult';
		embed.hash = parsed.hash;
		return embed.toString();
	} catch {
		return null;
	}
}

function transformCodesandboxUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (!parsed.hostname.endsWith('codesandbox.io')) return null;
		const segments = parsed.pathname.split('/').filter(Boolean);
		if (!segments.length) return null;

		if (segments[0] === 'embed' && segments[1]) {
			return parsed.toString();
		}

		if (segments[0] === 's' && segments[1]) {
			const embed = new URL(`${parsed.origin}/embed/${segments[1]}`);
			embed.search = parsed.search;
			embed.hash = parsed.hash;
			return embed.toString();
		}

		if (segments[0] === 'p' && segments[1] === 'sandbox' && segments[2]) {
			const slugParts = segments[2].split('-');
			const id = slugParts[slugParts.length - 1];
			if (!id) return null;
			const embed = new URL(`${parsed.origin}/embed/${id}`);
			embed.search = parsed.search;
			embed.hash = parsed.hash;
			return embed.toString();
		}

		return null;
	} catch {
		return null;
	}
}

function transformStackblitzUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (!parsed.hostname.endsWith('stackblitz.com')) return null;
		const embed = new URL(parsed.toString());
		embed.searchParams.set('embed', '1');
		if (!embed.searchParams.get('file')) {
			embed.searchParams.set('file', 'README.md');
		}
		return embed.toString();
	} catch {
		return null;
	}
}

function transformFigmaUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (!parsed.hostname.toLowerCase().endsWith('figma.com')) return null;
		return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(parsed.toString())}`;
	} catch {
		return null;
	}
}

function transformDocswellUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (!parsed.hostname.toLowerCase().endsWith('docswell.com')) return null;

		if (parsed.pathname.startsWith('/slide/') && parsed.pathname.endsWith('/embed')) {
			return parsed.toString();
		}

		if (!parsed.pathname.startsWith('/s/')) {
			return null;
		}

		const segments = parsed.pathname.split('/').filter(Boolean);
		const slideIdSegment = segments[2];
		if (!slideIdSegment) return null;
		const slideId = slideIdSegment.split('-')[0];
		if (!slideId) return null;

		let pageSuffix = '';
		if (parsed.hash && /^#p\d+$/.test(parsed.hash)) {
			pageSuffix = parsed.hash;
		} else if (segments[3] && /^\d+$/.test(segments[3])) {
			pageSuffix = `#p${segments[3]}`;
		}

		return `https://www.docswell.com/slide/${slideId}/embed${pageSuffix}`;
	} catch {
		return null;
	}
}

function transformSpeakerdeckUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (!parsed.hostname.toLowerCase().endsWith('speakerdeck.com')) {
			return null;
		}

		if (parsed.pathname.startsWith('/player/')) {
			parsed.protocol = 'https:';
			parsed.hostname = 'speakerdeck.com';
			return parsed.toString();
		}

		const segments = parsed.pathname.split('/').filter(Boolean);
		if (segments.length < 2) {
			return null;
		}

		const [user, slug] = segments;
		const embed = new URL(`https://speakerdeck.com/player/${user}/${slug}`);

		const slideFromSearch = parsed.searchParams.get('slide');
		const slideFromHash =
			parsed.hash && /slide(?:=|\/)?(\d+)/i.test(parsed.hash)
				? parsed.hash.match(/slide(?:=|\/)?(\d+)/i)?.[1]
				: null;

		const slide = slideFromSearch ?? slideFromHash ?? '1';
		if (slide && /^\d+$/.test(slide)) {
			embed.searchParams.set('slide', slide);
		}

		return embed.toString();
	} catch {
		return null;
	}
}

function transformSlideshareUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (!parsed.hostname.toLowerCase().endsWith('slideshare.net')) return null;
		if (parsed.pathname.startsWith('/slideshow/embed_code/')) {
			return parsed.toString();
		}
		return null;
	} catch {
		return null;
	}
}
