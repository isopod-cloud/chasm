import { ReadonlyDeep } from "type-fest";
import { homedir } from "os";
import * as path from "path";
import * as fs from "fs";

import * as pulumi from "@pulumi/pulumi";
import { ToSynthesize } from "./config";

// Useful for filters
export const isPresent = <T>(v: T): v is Exclude<T, null | undefined> =>
	v !== undefined && v !== null;

export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

export const timeIt = async <T>(
	func: () => Promise<T>,
	name: string,
): Promise<T> => {
	const start = new Date().getTime();
	const res = await func();
	const end = new Date().getTime();
	console.info(`Took ${end - start}ms to call ${name}`);
	return res;
};

export const lock = <const T>(obj: T): ReadonlyDeep<T> => {
	const _deepFreeze = <const U>(
		obj: U,
		inProgress = new WeakSet(),
	): ReadonlyDeep<U> => {
		if (typeof obj === "object" && obj !== null) {
			if (inProgress.has(obj)) {
				return obj as ReadonlyDeep<U>;
			} else {
				inProgress.add(obj);
			}
		} else {
			return obj as ReadonlyDeep<U>;
		}
		if (obj === undefined) {
			return obj as ReadonlyDeep<U>;
		}
		// Retrieve the property names defined on object
		const propNames = Reflect.ownKeys(obj) as Array<keyof U>;
		// Freeze properties before freezing self
		for (const name of propNames) {
			const value = obj[name];
			_deepFreeze(value, inProgress);
		}
		// return Object.freeze(obj) as ReadonlyDeep<U>;
		return Object.freeze(obj) as ReadonlyDeep<U>;
	};
	return _deepFreeze(obj);
};

// This is the same basic thing as deep freeze but it doesn't add the readonly
// compile time attribute (which can really get in the way of many things like
// third party libraries)
export const runtimeLock = <T>(obj: T): T => lock(obj) as T;

// Apply a function to each key value pair in an object and return a new object
// with the same keys but the values are the result of the callback function
export const mapObject =
	<T extends object>(obj: T) =>
	<const V>(
		callback: (k: keyof T, v: T[typeof k]) => V,
	): {
		[K in keyof T]: ReturnType<typeof callback>;
	} => {
		return Object.fromEntries(
			Object.entries(obj).map(([k2, v2]) => {
				const key = k2 as keyof T;
				const value = v2 as T[typeof key];
				return [key, callback(key, value)] as const;
			}),
		) as { [K in keyof T]: V };
	};

export function swapTildeWithHome(pathStr: string): string {
	if (pathStr.startsWith("~")) {
		return homedir() + pathStr.substring(1);
	}
	return pathStr;
}

export function prepareWorkspaceOptions(
	args: ToSynthesize,
): pulumi.automation.LocalWorkspaceOptions {
	const workDir = swapTildeWithHome(args.workDir);
	if (!fs.existsSync(workDir)) {
		fs.mkdirSync(workDir, { recursive: true });
	}

	const options: pulumi.automation.LocalWorkspaceOptions = {
		workDir,
	};

	if (isPresent(args.url)) {
		options.projectSettings = {
			name: args.projectName,
			runtime: "nodejs",
			backend: {
				url: args.url,
			},
		};

		// If the URL is a local file path, then we can make that local data directory if it
		// doesn't exist.
		if (args.url.startsWith("file://")) {
			const filePath = swapTildeWithHome(args.url.replace(/^file:\/\//, ""));
			const leadingChar = filePath.at(0);
			// Per Pulumi docs, localData directory is relative to workDir if it's a relative path,
			// otherwise it's just whatever absolute path got specified
			const localDataDir =
				leadingChar == "/"
					? path.normalize(path.resolve(swapTildeWithHome(filePath)))
					: path.join(workDir, filePath);

			console.info(`localDataDir: ${localDataDir}`);
			if (!fs.existsSync(localDataDir)) {
				fs.mkdirSync(localDataDir, { recursive: true });
				console.info(`localDataDir is made`);
			} else {
				console.info(`localDataDir exists already`);
			}
		} else {
			console.info(`args url is under 7 in length: ${args.url}`);
		}
	}

	return options;
}

export function getPulumiOutputStream(args: ToSynthesize): fs.WriteStream {
	return fs.createWriteStream(args.pulumiLogFile);
}

export function logEngineEvent(
	stream: fs.WriteStream,
	event: pulumi.automation.EngineEvent,
) {
	stream.write(JSON.stringify(event));
	stream.write("\n");
}
