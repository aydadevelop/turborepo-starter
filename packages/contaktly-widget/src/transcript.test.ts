import { describe, expect, it } from "vitest";

import {
	buildFrameUrl,
	type ContaktlyTranscriptMessage,
	clearTranscript,
	getOrCreateVisitorId,
	getTranscriptStorageKey,
	readTranscript,
	sanitizeTags,
	writeTranscript,
} from "./widget-client";

class MemoryStorage implements Storage {
	readonly #entries = new Map<string, string>();

	get length() {
		return this.#entries.size;
	}

	clear() {
		this.#entries.clear();
	}

	getItem(key: string) {
		return this.#entries.get(key) ?? null;
	}

	key(index: number) {
		return Array.from(this.#entries.keys())[index] ?? null;
	}

	removeItem(key: string) {
		this.#entries.delete(key);
	}

	setItem(key: string, value: string) {
		this.#entries.set(key, value);
	}
}

describe("widget visitor identity", () => {
	it("reuses the same visitor id for the same config", () => {
		const storage = new MemoryStorage();

		const firstId = getOrCreateVisitorId("config-1", storage);
		const secondId = getOrCreateVisitorId("config-1", storage);

		expect(secondId).toBe(firstId);
		expect(storage.length).toBe(1);
	});
});

describe("widget transcript storage", () => {
	it("roundtrips transcript messages by config and visitor", () => {
		const storage = new MemoryStorage();
		const messages: ContaktlyTranscriptMessage[] = [
			{
				id: "msg-1",
				role: "assistant",
				text: "What are you optimizing first?",
				createdAt: "2026-03-05T20:00:00.000Z",
				promptKey: "goal",
			},
		];

		writeTranscript("config-1", "visitor-1", messages, storage);

		expect(readTranscript("config-1", "visitor-1", storage)).toEqual(messages);
		expect(
			storage.getItem(getTranscriptStorageKey("config-1", "visitor-1"))
		).toBe(JSON.stringify(messages));
	});

	it("returns an empty transcript for malformed storage data", () => {
		const storage = new MemoryStorage();
		storage.setItem(
			getTranscriptStorageKey("config-1", "visitor-1"),
			"{broken"
		);

		expect(readTranscript("config-1", "visitor-1", storage)).toEqual([]);
	});

	it("clears persisted transcript state", () => {
		const storage = new MemoryStorage();
		writeTranscript(
			"config-1",
			"visitor-1",
			[
				{
					id: "msg-1",
					role: "user",
					text: "Hello",
					createdAt: "2026-03-05T20:00:00.000Z",
				},
			],
			storage
		);

		clearTranscript("config-1", "visitor-1", storage);

		expect(readTranscript("config-1", "visitor-1", storage)).toEqual([]);
	});
});

describe("tag sanitization", () => {
	it("normalizes comma-separated and array-based tag inputs", () => {
		expect(sanitizeTags(" pricing, founder , ,demo ")).toEqual([
			"pricing",
			"founder",
			"demo",
		]);
		expect(sanitizeTags(["home", " pricing "])).toEqual(["home", "pricing"]);
	});
});

describe("frame URL construction", () => {
	it("includes host page context in the iframe query", () => {
		const url = new URL(
			buildFrameUrl({
				baseUrl: "http://localhost:4174",
				configId: "ctly-demo-founder",
				hostOrigin: "http://localhost:43275",
				open: false,
				pageTitle: "Pricing | Mary Gold Studio",
				referrer: "http://localhost:43275/",
				sourceUrl: "http://localhost:43275/pricing",
				tags: ["astro-site", "founder-led", "pricing"],
				visitorId: "visitor-1",
				widgetInstanceId: "widget-1",
			})
		);

		expect(url.searchParams.get("hostOrigin")).toBe("http://localhost:43275");
		expect(url.searchParams.get("sourceUrl")).toBe(
			"http://localhost:43275/pricing"
		);
		expect(url.searchParams.get("pageTitle")).toBe(
			"Pricing | Mary Gold Studio"
		);
		expect(url.searchParams.get("tags")).toBe("astro-site,founder-led,pricing");
	});
});
