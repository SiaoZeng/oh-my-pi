import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { InternalUrl } from "./types";

export interface SkillTarget {
	name: string;
	filePath: string;
	baseDir: string;
}

export function validateRelativePath(relativePath: string): void {
	if (path.isAbsolute(relativePath)) {
		throw new Error("Absolute paths are not allowed in skill:// URLs");
	}
	const normalized = path.normalize(relativePath);
	if (normalized.startsWith("..") || normalized.includes("/../") || normalized.includes("/..")) {
		throw new Error("Path traversal (..) is not allowed in skill:// URLs");
	}
}

export function resolveSkillTargetPath(
	url: InternalUrl,
	skills: readonly SkillTarget[],
): { targetPath: string; baseDir: string } {
	const skillName = url.rawHost || url.hostname;
	if (!skillName) {
		throw new Error("skill:// URL requires a skill name: skill://<name>");
	}
	const skill = skills.find(candidate => candidate.name === skillName);
	if (!skill) {
		const available = skills.map(candidate => candidate.name);
		throw new Error(
			`Unknown skill: ${skillName}\nAvailable: ${available.length > 0 ? available.join(", ") : "none"}`,
		);
	}

	const urlPath = url.rawPathname ?? url.pathname;
	const hasRelativePath = urlPath && urlPath !== "/";
	if (!hasRelativePath) {
		return { targetPath: skill.filePath, baseDir: skill.baseDir };
	}
	const relativePath = decodeURIComponent(urlPath.slice(1));
	validateRelativePath(relativePath);
	const targetPath = path.join(skill.baseDir, relativePath);
	const resolvedPath = path.resolve(targetPath);
	const resolvedBaseDir = path.resolve(skill.baseDir);
	if (!resolvedPath.startsWith(resolvedBaseDir + path.sep) && resolvedPath !== resolvedBaseDir) {
		throw new Error("Path traversal is not allowed");
	}
	return { targetPath, baseDir: skill.baseDir };
}

export async function resolveSkillRealPath(targetPath: string, baseDir: string): Promise<string> {
	const [realTargetPath, realBaseDir] = await Promise.all([fs.realpath(targetPath), fs.realpath(baseDir)]);
	if (!realTargetPath.startsWith(realBaseDir + path.sep) && realTargetPath !== realBaseDir) {
		throw new Error("Path traversal is not allowed");
	}
	return realTargetPath;
}
