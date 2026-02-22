import { writeFileSync } from "node:fs";
import { downloadAudio } from "../packages/youtube/src/download-audio";
import { getSubtitles } from "../packages/youtube/src/subtitles";

const videoId = "UjayV4GWkPc";

console.log("=== Subtitles ===");
try {
	const subs = await getSubtitles({
		youtubeVideoId: videoId,
		languages: ["en"],
	});
	if (subs.length === 0) {
		console.log("No subtitles found");
	} else {
		for (const s of subs) {
			console.log(`source: ${s.source} | lang: ${s.language}`);
			console.log("text preview:", s.fullText.slice(0, 400));
		}
	}
} catch (e) {
	console.error("Subtitles error:", (e as Error).message);
}

console.log("\n=== Audio ===");
try {
	const audio = await downloadAudio({ youtubeVideoId: videoId, format: "m4a" });
	const outPath = `/tmp/yt-test-audio.${audio.extension}`;
	writeFileSync(outPath, audio.data);
	console.log("extension:", audio.extension);
	console.log("contentType:", audio.contentType);
	console.log("bytes:", audio.data.length);
	console.log("saved to", outPath);
} catch (e) {
	console.error("Audio error:", (e as Error).message);
}
