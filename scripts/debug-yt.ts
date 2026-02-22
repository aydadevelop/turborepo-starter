export {};
const videoId = "UjayV4GWkPc";
const url = `https://www.youtube.com/watch?v=${videoId}`;

const res = await fetch(url, {
	headers: {
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Accept-Language": "en-US,en;q=0.9",
	},
});

console.log("status:", res.status);
const html = await res.text();
console.log("html length:", html.length);

// Check which markers are present
const markers = [
	"var ytInitialPlayerResponse = ",
	"ytInitialPlayerResponse =",
	"ytInitialData =",
	"var ytInitialData = ",
];
for (const m of markers) {
	const idx = html.indexOf(m);
	console.log(`marker "${m}": pos=${idx}`);
	if (idx !== -1) {
		// Show what comes right after the marker and what the end delimiter is
		const snippet = html.slice(idx + m.length, idx + m.length + 100);
		console.log("  starts with:", snippet.slice(0, 60));

		// Try different end patterns
		const endSemiScript = html.indexOf(";</script>", idx + m.length);
		const endWindowAssign = html.indexOf(";window[", idx + m.length);
		const endSemi = html.indexOf(";var ", idx + m.length);
		console.log(
			"  end ';</script>':",
			endSemiScript,
			"(dist:",
			endSemiScript - idx,
			")"
		);
		console.log(
			"  end ';window[':",
			endWindowAssign,
			"(dist:",
			endWindowAssign - idx,
			")"
		);
		console.log("  end ';var ':", endSemi, "(dist:", endSemi - idx, ")");
	}
}

// Check for consent/cookie wall
if (html.includes("consent.youtube.com") || html.includes("CONSENT")) {
	console.log("\n⚠ Consent/cookie wall detected");
}
if (html.includes("captionTracks")) {
	console.log("\n✓ captionTracks found in HTML");
	const ctIdx = html.indexOf("captionTracks");
	console.log("  context:", html.slice(ctIdx - 20, ctIdx + 200));
}
