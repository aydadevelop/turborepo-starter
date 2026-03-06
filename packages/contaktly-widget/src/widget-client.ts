export const DEMO_WIDGET_CONFIG_ID = "ctly-demo-founder";
export const CONTAKTLY_WIDGET_GLOBAL = "ContaktlyWidget";
export const WIDGET_FRAME_PATH = "/embed/frame";

export type ContaktlyTranscriptRole = "assistant" | "user";

export interface ContaktlyTranscriptMessage {
	createdAt: string;
	id: string;
	intent?: string;
	promptKey?: string;
	role: ContaktlyTranscriptRole;
	text: string;
}

export interface ContaktlyWidgetMountOptions {
	baseUrl: string;
	configId: string;
	hostOrigin?: string;
	open?: boolean;
	pageTitle?: string;
	referrer?: string;
	sourceUrl?: string;
	tags?: string[];
	target?: HTMLElement;
}

export interface WidgetFrameQuery {
	configId: string;
	hostOrigin: string;
	open: boolean;
	pageTitle: string;
	referrer: string;
	sourceUrl: string;
	tags: string[];
	visitorId: string;
	widgetInstanceId: string;
}

const STORAGE_PREFIX = "contaktly:widget:visitor";
const TRANSCRIPT_PREFIX = "contaktly:widget:transcript";
const TRAILING_SLASHES = /\/+$/;
const WIDGET_ROOT_Z_INDEX = "2147483000";

const normalizeOrigin = (value: string) => value.replace(TRAILING_SLASHES, "");
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isTranscriptMessage = (
	value: unknown
): value is ContaktlyTranscriptMessage => {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.id === "string" &&
		(value.role === "assistant" || value.role === "user") &&
		typeof value.text === "string" &&
		typeof value.createdAt === "string" &&
		(value.intent === undefined || typeof value.intent === "string") &&
		(value.promptKey === undefined || typeof value.promptKey === "string")
	);
};

export const sanitizeTags = (
	value: string | string[] | null | undefined
): string[] => {
	if (Array.isArray(value)) {
		return value.map((tag) => tag.trim()).filter(Boolean);
	}

	if (!value) {
		return [];
	}

	return value
		.split(",")
		.map((tag) => tag.trim())
		.filter(Boolean);
};

export const getVisitorStorageKey = (configId: string) =>
	`${STORAGE_PREFIX}:${configId}`;

export const getTranscriptStorageKey = (configId: string, visitorId: string) =>
	`${TRANSCRIPT_PREFIX}:${configId}:${visitorId}`;

export const getOrCreateVisitorId = (
	configId: string,
	storage: Storage = window.localStorage
) => {
	const key = getVisitorStorageKey(configId);
	const existing = storage.getItem(key);
	if (existing) {
		return existing;
	}

	const next = crypto.randomUUID();
	storage.setItem(key, next);
	return next;
};

export const readTranscript = (
	configId: string,
	visitorId: string,
	storage: Storage = window.localStorage
): ContaktlyTranscriptMessage[] => {
	const raw = storage.getItem(getTranscriptStorageKey(configId, visitorId));

	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw);

		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.filter(isTranscriptMessage);
	} catch {
		return [];
	}
};

export const writeTranscript = (
	configId: string,
	visitorId: string,
	messages: ContaktlyTranscriptMessage[],
	storage: Storage = window.localStorage
) => {
	storage.setItem(
		getTranscriptStorageKey(configId, visitorId),
		JSON.stringify(messages)
	);
};

export const clearTranscript = (
	configId: string,
	visitorId: string,
	storage: Storage = window.localStorage
) => {
	storage.removeItem(getTranscriptStorageKey(configId, visitorId));
};

export const buildFrameUrl = ({
	baseUrl,
	configId,
	hostOrigin,
	open,
	pageTitle,
	referrer,
	sourceUrl,
	tags,
	visitorId,
	widgetInstanceId,
}: WidgetFrameQuery & { baseUrl: string }) => {
	const url = new URL(WIDGET_FRAME_PATH, `${normalizeOrigin(baseUrl)}/`);
	url.searchParams.set("params", configId);
	url.searchParams.set("visitorId", visitorId);
	url.searchParams.set("widgetInstanceId", widgetInstanceId);
	url.searchParams.set("open", open ? "1" : "0");

	if (hostOrigin) {
		url.searchParams.set("hostOrigin", hostOrigin);
	}
	if (pageTitle) {
		url.searchParams.set("pageTitle", pageTitle);
	}
	if (referrer) {
		url.searchParams.set("referrer", referrer);
	}
	if (sourceUrl) {
		url.searchParams.set("sourceUrl", sourceUrl);
	}
	if (tags.length > 0) {
		url.searchParams.set("tags", tags.join(","));
	}

	return url.toString();
};

const setPanelVisibility = ({
	open,
	panel,
	launcher,
}: {
	open: boolean;
	panel: HTMLDivElement;
	launcher: HTMLButtonElement;
}) => {
	panel.dataset.state = open ? "open" : "closed";
	panel.setAttribute("aria-hidden", open ? "false" : "true");
	panel.style.opacity = open ? "1" : "0";
	panel.style.transform = open
		? "translateY(0) scale(1)"
		: "translateY(18px) scale(0.98)";
	panel.style.pointerEvents = open ? "auto" : "none";
	panel.style.visibility = open ? "visible" : "hidden";
	launcher.setAttribute("aria-expanded", open ? "true" : "false");
	launcher.setAttribute(
		"aria-label",
		open ? "Close Contaktly chat" : "Open Contaktly chat"
	);
	launcher.textContent = open ? "Close" : "Chat";
};

export const mountContaktlyWidget = ({
	baseUrl,
	configId,
	hostOrigin = typeof window === "undefined" ? "" : window.location.origin,
	open = false,
	pageTitle = typeof document === "undefined" ? "" : document.title,
	referrer = typeof document === "undefined" ? "" : document.referrer,
	sourceUrl = typeof window === "undefined" ? "" : window.location.href,
	tags = [],
	target = document.body,
}: ContaktlyWidgetMountOptions) => {
	const visitorId = getOrCreateVisitorId(configId);
	const widgetInstanceId = crypto.randomUUID();
	const frameUrl = buildFrameUrl({
		baseUrl,
		configId,
		hostOrigin,
		open,
		pageTitle,
		referrer,
		sourceUrl,
		tags,
		visitorId,
		widgetInstanceId,
	});

	const root = document.createElement("div");
	root.dataset.contaktlyWidgetRoot = configId;
	root.style.position = "fixed";
	root.style.right = "24px";
	root.style.bottom = "24px";
	root.style.zIndex = WIDGET_ROOT_Z_INDEX;
	root.style.width = "min(380px, calc(100vw - 32px))";
	root.style.maxWidth = "calc(100vw - 32px)";
	root.style.pointerEvents = "none";

	const panel = document.createElement("div");
	panel.dataset.contaktlyWidgetPanel = configId;
	panel.style.position = "absolute";
	panel.style.right = "0";
	panel.style.bottom = "72px";
	panel.style.width = "min(380px, calc(100vw - 32px))";
	panel.style.height = "min(560px, calc(100vh - 176px))";
	panel.style.minHeight = "0";
	panel.style.overflow = "hidden";
	panel.style.border = "1px solid rgba(15, 23, 42, 0.12)";
	panel.style.borderRadius = "28px";
	panel.style.background = "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)";
	panel.style.boxShadow = "0 30px 80px rgba(15, 23, 42, 0.22)";
	panel.style.transition =
		"opacity 180ms ease, transform 180ms ease, visibility 180ms ease";
	panel.style.pointerEvents = "none";
	panel.style.visibility = "hidden";
	panel.style.opacity = "0";
	panel.style.transform = "translateY(18px) scale(0.98)";

	const iframe = document.createElement("iframe");
	iframe.src = frameUrl;
	iframe.title = "Contaktly widget";
	iframe.loading = "eager";
	iframe.style.width = "100%";
	iframe.style.height = "100%";
	iframe.style.border = "0";
	iframe.style.display = "block";
	iframe.style.background = "transparent";

	const launcher = document.createElement("button");
	launcher.type = "button";
	launcher.dataset.contaktlyWidgetLauncher = configId;
	launcher.style.position = "absolute";
	launcher.style.right = "0";
	launcher.style.bottom = "0";
	launcher.style.display = "inline-flex";
	launcher.style.alignItems = "center";
	launcher.style.justifyContent = "center";
	launcher.style.minWidth = "72px";
	launcher.style.height = "56px";
	launcher.style.padding = "0 18px";
	launcher.style.border = "0";
	launcher.style.borderRadius = "999px";
	launcher.style.background =
		"linear-gradient(135deg, #0f172a 0%, #14532d 100%)";
	launcher.style.color = "#ffffff";
	launcher.style.font =
		'600 14px/1 "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';
	launcher.style.letterSpacing = "0.01em";
	launcher.style.cursor = "pointer";
	launcher.style.boxShadow = "0 18px 45px rgba(15, 23, 42, 0.28)";
	launcher.style.pointerEvents = "auto";

	panel.append(iframe);
	root.append(panel, launcher);

	target.append(root);

	const applyResponsiveLayout = () => {
		const isCompactViewport = window.innerWidth < 640;
		const horizontalInset = isCompactViewport ? 16 : 24;
		const panelBottom = isCompactViewport ? 68 : 72;
		const panelHeight = isCompactViewport
			? "min(70vh, 520px)"
			: "min(560px, calc(100vh - 176px))";
		const panelWidth = isCompactViewport
			? "min(100vw - 32px, 380px)"
			: "min(380px, calc(100vw - 32px))";

		root.style.right = `${horizontalInset}px`;
		root.style.bottom = `${horizontalInset}px`;
		root.style.width = panelWidth;
		root.style.maxWidth = panelWidth;

		panel.style.bottom = `${panelBottom}px`;
		panel.style.width = panelWidth;
		panel.style.height = panelHeight;
	};

	let isOpen = open;
	const syncOpenState = () =>
		setPanelVisibility({
			open: isOpen,
			panel,
			launcher,
		});

	launcher.addEventListener("click", () => {
		isOpen = !isOpen;
		syncOpenState();
	});

	applyResponsiveLayout();
	window.addEventListener("resize", applyResponsiveLayout);
	syncOpenState();

	return {
		launcher,
		panel,
		root,
		iframe,
		widgetInstanceId,
		visitorId,
		setOpen(next: boolean) {
			isOpen = next;
			syncOpenState();
		},
		destroy() {
			window.removeEventListener("resize", applyResponsiveLayout);
			root.remove();
		},
	};
};

export const createEmbedSnippet = ({
	baseUrl,
	configId,
	tags = [],
}: {
	baseUrl: string;
	configId: string;
	tags?: string[];
}) => {
	const scriptUrl = new URL("/loader.js", `${normalizeOrigin(baseUrl)}/`);
	const attrs = [
		`src="${scriptUrl.toString()}"`,
		`data-params="${configId}"`,
		tags.length > 0 ? `data-tags="${tags.join(",")}"` : "",
	]
		.filter(Boolean)
		.join("\n  ");

	return `<script\n  ${attrs}\n></script>`;
};
