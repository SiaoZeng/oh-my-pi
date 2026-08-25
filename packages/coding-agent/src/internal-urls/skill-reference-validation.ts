import * as fs from "node:fs/promises";
import { parseInternalUrl } from "./parse";
import { resolveSkillRealPath, resolveSkillTargetPath, type SkillTarget } from "./skill-target";

export interface SkillReferenceWarning {
	skillPath: string;
	message: string;
}

const SKILL_URI_PATTERN = /skill:\/\/[^\s`"'<>]+/g;
const TRAILING_MARKDOWN_PUNCTUATION = /[),.;]+$/;

function stripFencedCodeBlocks(content: string): string {
	let activeFence: { marker: string; length: number } | null = null;
	return content
		.split("\n")
		.map(line => {
			const normalizedLine = line.endsWith("\r") ? line.slice(0, -1) : line;
			const openingCandidate = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(normalizedLine);
			const opening =
				openingCandidate && !(openingCandidate[1][0] === "`" && openingCandidate[2].includes("`"))
					? openingCandidate
					: null;
			if (activeFence) {
				const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(normalizedLine);
				if (closing && closing[1][0] === activeFence.marker && closing[1].length >= activeFence.length) {
					activeFence = null;
				}
				return "";
			}
			if (opening) {
				activeFence = { marker: opening[1][0], length: opening[1].length };
				return "";
			}
			return line;
		})
		.join("\n");
}

export async function validateSkillReferences(skills: readonly SkillTarget[]): Promise<SkillReferenceWarning[]> {
	const warnings: SkillReferenceWarning[] = [];
	for (const skill of skills) {
		let isFile = false;
		try {
			isFile = (await fs.stat(skill.filePath)).isFile();
		} catch {
			continue;
		}
		if (!isFile) continue;
		const content = stripFencedCodeBlocks(await fs.readFile(skill.filePath, "utf8"));
		for (const match of content.matchAll(SKILL_URI_PATTERN)) {
			const uri = match[0].replace(TRAILING_MARKDOWN_PUNCTUATION, "");
			const offset = match.index ?? 0;
			const linePrefix = content.slice(content.lastIndexOf("\n", offset - 1) + 1, offset);
			const optional = /OPTIONAL:\s*$/.test(linePrefix);
			try {
				const { targetPath, baseDir } = resolveSkillTargetPath(parseInternalUrl(uri), skills);
				await fs.stat(targetPath);
				await resolveSkillRealPath(targetPath, baseDir);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				if (!optional) {
					throw new Error(`${skill.filePath}: ${uri}: ${reason}`);
				}
				warnings.push({
					skillPath: skill.filePath,
					message: `optional skill reference unresolved: ${uri}: ${reason}`,
				});
			}
		}
	}
	return warnings;
}
