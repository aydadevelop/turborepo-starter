import { readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const repoRoot = process.cwd();

const IGNORE_DIRS = new Set([
	".git",
	".turbo",
	"node_modules",
	"dist",
	"build",
	"coverage",
	".svelte-kit",
	"legacy",
]);

const walkTsconfigs = (startDir) => {
	const queue = [startDir];
	const configs = [];

	while (queue.length > 0) {
		const current = queue.pop();
		if (!current) continue;

		const entries = readdirSync(current, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (IGNORE_DIRS.has(entry.name)) continue;
				queue.push(path.join(current, entry.name));
				continue;
			}

			if (entry.isFile() && entry.name === "tsconfig.json") {
				configs.push(path.join(current, entry.name));
			}
		}
	}

	return configs.sort((a, b) => a.localeCompare(b));
};

const canonicalPath = (filePath) => {
	try {
		return realpathSync.native(filePath);
	} catch {
		return path.resolve(filePath);
	}
};

const normalizePath = (filePath) =>
	canonicalPath(filePath).split(path.sep).join("/");

const toRelative = (filePath) =>
	path.relative(repoRoot, filePath).split(path.sep).join("/");

const isWorkspaceSource = (filePath) => {
	const normalized = normalizePath(filePath);
	const root = normalizePath(repoRoot);
	if (!normalized.startsWith(root)) return false;
	if (normalized.includes("/node_modules/")) return false;
	if (normalized.includes("/.svelte-kit/")) return false;
	if (normalized.includes("/dist/")) return false;
	if (normalized.includes("/build/")) return false;
	return true;
};

const collectProjectFiles = (configPath) => {
	const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
	if (readResult.error) {
		return { error: ts.flattenDiagnosticMessageText(readResult.error.messageText, "\n") };
	}

	const parsed = ts.parseJsonConfigFileContent(
		readResult.config,
		ts.sys,
		path.dirname(configPath),
		undefined,
		configPath
	);

	const rootFiles = parsed.fileNames
		.filter(isWorkspaceSource);

	const host = ts.createCompilerHost(parsed.options, true);
	const program = ts.createProgram({
		rootNames: parsed.fileNames,
		options: parsed.options,
		projectReferences: parsed.projectReferences,
		host,
	});

	const programFiles = program
		.getSourceFiles()
		.map((sourceFile) => sourceFile.fileName)
		.filter(isWorkspaceSource);

	return {
		rootFiles: [...new Set(rootFiles)].sort((a, b) => a.localeCompare(b)),
		programFiles: [...new Set(programFiles)].sort((a, b) => a.localeCompare(b)),
		errors: parsed.errors.map((err) =>
			ts.flattenDiagnosticMessageText(err.messageText, "\n")
		),
	};
};

const computeOverlapStats = (projects, key) => {
	const entries = [];
	const fileToProjects = new Map();

	for (const project of projects) {
		const files = project[key];
		const projectLabel = project.config;
		entries.push({ config: projectLabel, fileCount: files.length });

		for (const file of files) {
			const normalized = normalizePath(file);
			const current = fileToProjects.get(normalized) ?? [];
			current.push(projectLabel);
			fileToProjects.set(normalized, current);
		}
	}

	entries.sort((a, b) => b.fileCount - a.fileCount);

	const uniqueFileCount = fileToProjects.size;
	let totalMemberships = 0;
	let overlappedFileCount = 0;
	const overlappingFiles = [];

	for (const [file, projectsForFile] of fileToProjects.entries()) {
		totalMemberships += projectsForFile.length;
		if (projectsForFile.length > 1) {
			overlappedFileCount += 1;
			overlappingFiles.push({
				file: toRelative(file),
				projectCount: projectsForFile.length,
				projects: projectsForFile.sort(),
			});
		}
	}

	overlappingFiles.sort((a, b) => b.projectCount - a.projectCount);

	const overlapMultiplier =
		uniqueFileCount === 0 ? 0 : totalMemberships / uniqueFileCount;
	const overlapPercent =
		uniqueFileCount === 0 ? 0 : (overlappedFileCount / uniqueFileCount) * 100;

	return {
		summary: {
			projectsAnalyzed: entries.length,
			uniqueWorkspaceSourceFiles: uniqueFileCount,
			totalProjectFileMemberships: totalMemberships,
			overlapMultiplier: Number(overlapMultiplier.toFixed(2)),
			overlappedFileCount,
			overlapPercent: Number(overlapPercent.toFixed(2)),
		},
		topProjectsByFileCount: entries.slice(0, 10),
		topOverlappingFiles: overlappingFiles.slice(0, 20),
	};
};

const configs = walkTsconfigs(repoRoot);
const projects = [];
const parseErrors = [];

for (const configPath of configs) {
	const result = collectProjectFiles(configPath);
	if ("error" in result) {
		parseErrors.push({ config: toRelative(configPath), error: result.error });
		continue;
	}

	if (result.errors.length > 0) {
		parseErrors.push({
			config: toRelative(configPath),
			error: result.errors.join(" | "),
		});
	}

	const projectLabel = toRelative(configPath);
	projects.push({
		config: projectLabel,
		rootFiles: result.rootFiles,
		programFiles: result.programFiles,
	});
}

const rootGraph = computeOverlapStats(projects, "rootFiles");
const programGraph = computeOverlapStats(projects, "programFiles");

console.log("Type Graph Summary (Root Files)");
console.log(JSON.stringify(rootGraph.summary, null, 2));
console.log("\nType Graph Summary (Program Files)");
console.log(JSON.stringify(programGraph.summary, null, 2));

console.log("\nTop Projects by Root File Count");
console.log(JSON.stringify(rootGraph.topProjectsByFileCount, null, 2));
console.log("\nTop Projects by Program File Count");
console.log(JSON.stringify(programGraph.topProjectsByFileCount, null, 2));

console.log("\nTop Overlapping Root Files");
console.log(JSON.stringify(rootGraph.topOverlappingFiles, null, 2));
console.log("\nTop Overlapping Program Files");
console.log(JSON.stringify(programGraph.topOverlappingFiles, null, 2));

if (parseErrors.length > 0) {
	console.log("\nConfig Parse/Resolution Warnings");
	console.log(JSON.stringify(parseErrors, null, 2));
}
