import type { RequestHandler } from "./$types";

const loaderScript = (origin: string) => `(() => {
	const BASE_URL = ${JSON.stringify(origin)};
	const GLOBAL = "ContaktlyWidget";
	const STORAGE_PREFIX = "contaktly:widget:visitor";
	const TRAILING_SLASHES = /\\/+$/;
	const WIDGET_ROOT_Z_INDEX = "2147483000";
	const normalizeTags = (value) =>
		String(value ?? "")
			.split(",")
			.map((tag) => tag.trim())
			.filter(Boolean);
	const normalizeOrigin = (value) => String(value ?? "").replace(TRAILING_SLASHES, "");
	const getStorageKey = (configId) => \`\${STORAGE_PREFIX}:\${configId}\`;
	const getOrCreateVisitorId = (configId) => {
		const key = getStorageKey(configId);
		const existing = window.localStorage.getItem(key);
		if (existing) return existing;
		const next = crypto.randomUUID();
		window.localStorage.setItem(key, next);
		return next;
	};
	const buildFrameUrl = ({ configId, hostOrigin, open, pageTitle, referrer, sourceUrl, tags, visitorId, widgetInstanceId }) => {
		const url = new URL("/embed/frame", \`\${normalizeOrigin(BASE_URL)}/\`);
		url.searchParams.set("params", configId);
		url.searchParams.set("visitorId", visitorId);
		url.searchParams.set("widgetInstanceId", widgetInstanceId);
		url.searchParams.set("open", open ? "1" : "0");
		if (hostOrigin) url.searchParams.set("hostOrigin", hostOrigin);
		if (pageTitle) url.searchParams.set("pageTitle", pageTitle);
		if (referrer) url.searchParams.set("referrer", referrer);
		if (sourceUrl) url.searchParams.set("sourceUrl", sourceUrl);
		if (tags.length > 0) url.searchParams.set("tags", tags.join(","));
		return url.toString();
	};
	const setPanelVisibility = ({ open, launcher, panel }) => {
		panel.dataset.state = open ? "open" : "closed";
		panel.setAttribute("aria-hidden", open ? "false" : "true");
		panel.style.opacity = open ? "1" : "0";
		panel.style.transform = open ? "translateY(0) scale(1)" : "translateY(18px) scale(0.98)";
		panel.style.pointerEvents = open ? "auto" : "none";
		panel.style.visibility = open ? "visible" : "hidden";
		launcher.setAttribute("aria-expanded", open ? "true" : "false");
		launcher.setAttribute("aria-label", open ? "Close Contaktly chat" : "Open Contaktly chat");
		launcher.textContent = open ? "Close" : "Chat";
	};
	const mount = (scriptEl, options = {}) => {
		const configId = options.configId ?? scriptEl?.dataset?.params ?? "";
		if (!configId) return null;
		const tags = normalizeTags(options.tags ?? scriptEl?.dataset?.tags ?? "");
		const open = options.open ?? scriptEl?.dataset?.open === "true";
		const target = options.target ?? document.body;
		const hostOrigin = options.hostOrigin ?? window.location.origin;
		const visitorId = getOrCreateVisitorId(configId);
		const widgetInstanceId = crypto.randomUUID();
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
		panel.style.transition = "opacity 180ms ease, transform 180ms ease, visibility 180ms ease";
		panel.style.pointerEvents = "none";
		panel.style.visibility = "hidden";
		panel.style.opacity = "0";
		panel.style.transform = "translateY(18px) scale(0.98)";
		const iframe = document.createElement("iframe");
		iframe.src = buildFrameUrl({
			configId,
			hostOrigin,
			open,
			pageTitle: document.title,
			referrer: document.referrer,
			sourceUrl: window.location.href,
			tags,
			visitorId,
			widgetInstanceId,
		});
		iframe.title = "Contaktly widget";
		iframe.loading = "eager";
		iframe.style.width = "100%";
		iframe.style.height = "100%";
		iframe.style.border = "0";
		iframe.style.background = "transparent";
		iframe.style.display = "block";
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
		launcher.style.background = "linear-gradient(135deg, #0f172a 0%, #14532d 100%)";
		launcher.style.color = "#ffffff";
		launcher.style.font = '600 14px/1 "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';
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

			root.style.right = \`\${horizontalInset}px\`;
			root.style.bottom = \`\${horizontalInset}px\`;
			root.style.width = panelWidth;
			root.style.maxWidth = panelWidth;

			panel.style.bottom = \`\${panelBottom}px\`;
			panel.style.width = panelWidth;
			panel.style.height = panelHeight;
		};
		let isOpen = Boolean(open);
		const syncOpenState = () => setPanelVisibility({ open: isOpen, launcher, panel });
		launcher.addEventListener("click", () => {
			isOpen = !isOpen;
			syncOpenState();
		});
		applyResponsiveLayout();
		window.addEventListener("resize", applyResponsiveLayout);
		syncOpenState();
		return {
			iframe,
			launcher,
			panel,
			root,
			visitorId,
			widgetInstanceId,
			setOpen(next) {
				isOpen = Boolean(next);
				syncOpenState();
			},
			destroy() {
				window.removeEventListener("resize", applyResponsiveLayout);
				root.remove();
			},
		};
	};
	window[GLOBAL] = {
		init(options) {
			return mount(null, options);
		},
	};
	const currentScript = document.currentScript;
	if (currentScript?.dataset?.params) {
		mount(currentScript);
	}
})();`;

export const GET: RequestHandler = ({ url }) =>
	new Response(loaderScript(url.origin), {
		headers: {
			"content-type": "application/javascript; charset=utf-8",
			"cache-control": "no-store",
		},
	});
