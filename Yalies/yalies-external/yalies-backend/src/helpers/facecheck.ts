import { execFile } from "child_process";
import fs from "fs";
import path from "path";

const FACECHECK_SCRIPT = path.resolve(
	process.cwd(),
	"../../yalies-internal/yalies-data-pipeline/python/facecheck/facecheck.py",
);

const VENV_PYTHON = path.resolve(
	process.cwd(),
	"../../yalies-internal/yalies-data-pipeline/python/venv/bin/python",
);

const PYTHON = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : "python3";

// Runtime toggle — defaults to env var, can be flipped via admin endpoint
let _enabled = process.env.FACECHECK_ENABLED !== "false";

export function isFacecheckEnabled(): boolean {
	return _enabled;
}

export function setFacecheckEnabled(enabled: boolean): void {
	_enabled = enabled;
	console.log(`[facecheck] ${enabled ? "Enabled" : "Disabled"}`);
}

let _available: boolean | null = null;

/** Check once whether facecheck can actually run. */
function checkAvailable(): Promise<boolean> {
	if (_available !== null) return Promise.resolve(_available);
	return new Promise((resolve) => {
		execFile(PYTHON, [FACECHECK_SCRIPT, "--help"], { timeout: 5000 }, (error) => {
			_available = !error;
			if (!_available) console.warn("[facecheck] Python dependencies not available — face validation will be skipped");
			resolve(_available);
		});
	});
}

/** Returns true only if facecheck is both enabled AND the Python deps are installed. */
export async function shouldRunFacecheck(): Promise<boolean> {
	if (!_enabled) return false;
	return checkAvailable();
}

type DetectResult = {
	has_face: boolean;
	num_faces: number;
	confidence: number;
	bbox: number[] | null;
};

type CompareResult = {
	face_in_first: boolean;
	face_in_second: boolean;
	similarity: number;
	is_match: boolean;
};

function runFacecheck(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(PYTHON, [FACECHECK_SCRIPT, "--json", ...args], {
			timeout: 60000,
		}, (error, stdout, stderr) => {
			if (stderr) console.error("[facecheck stderr]", stderr);
			if (stdout.trim()) {
				resolve(stdout.trim());
				return;
			}
			if (error) {
				reject(new Error(`facecheck failed: ${error.message}`));
				return;
			}
			resolve(stdout.trim());
		});
	});
}

export async function detectFace(imagePath: string): Promise<DetectResult> {
	const output = await runFacecheck(["detect", imagePath]);
	return JSON.parse(output);
}

export async function compareFaces(imagePath1: string, imagePath2: string): Promise<CompareResult> {
	const output = await runFacecheck(["compare", imagePath1, imagePath2]);
	return JSON.parse(output);
}
