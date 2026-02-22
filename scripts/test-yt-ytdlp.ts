/**
 * Real-world test using ytdlp-nodejs (requires yt-dlp binary download on first run)
 * Run: bun scripts/test-yt-ytdlp.ts
 */
import { helpers, YtDlp } from "ytdlp-nodejs";

const videoId = "UjayV4GWkPc";
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

// Ensure yt-dlp binary is available
console.log("Checking yt-dlp binary...");
try {
	const version = await new YtDlp().getVersionAsync();
	console.log(`yt-dlp version: ${version}`);
} catch {
	console.log("Downloading yt-dlp binary...");
	await helpers.downloadYtDlp();
	console.log("Binary downloaded.");
}

const ytdlp = new YtDlp();

console.log("\n=== Subtitles via ytdlp-nodejs ===");
try {
	const info = await ytdlp.getInfoAsync(videoUrl);
	const autoSubs: Record<string, { ext: string; url: string }[]> = (
		info as unknown as Record<string, unknown>
	).automatic_captions as Record<string, { ext: string; url: string }[]>;

	if (autoSubs?.en) {
		const vttEntry = autoSubs.en.find((s) => s.ext === "vtt");
		if (vttEntry) {
			const res = await fetch(vttEntry.url);
			const text = await res.text();
			console.log("VTT preview (first 400 chars):");
			console.log(text.slice(0, 400));
		} else {
			console.log("No VTT entry found in en captions");
			console.log(
				"Available exts:",
				autoSubs.en.map((s) => s.ext)
			);
		}
	} else {
		console.log("No automatic en captions found");
		const subKeys = Object.keys(autoSubs ?? {});
		console.log("Available subtitle langs:", subKeys.slice(0, 5));
	}
} catch (e) {
	console.error("Subtitles error:", (e as Error).message);
}

console.log("\n=== Audio via ytdlp-nodejs (download to disk) ===");
try {
	const outPath = "/tmp/yt-ytdlp-audio";
	const result = await ytdlp
		.download(videoUrl)
		.filter("audioonly")
		.type("m4a")
		.output(outPath)
		.on("progress", (p) => {
			if (p.percentage_str) {
				process.stdout.write(`\r  progress: ${p.percentage_str}   `);
			}
		})
		.run();
	console.log(`\nfiles: ${result.filePaths.join(", ")}`);
} catch (e) {
	console.error("\nAudio error:", (e as Error).message);
}
