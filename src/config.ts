import * as z from "zod";
import { CloudAccount } from "./types/new-types";
export const Configuration = z.object({
	LOG_LEVEL: z
		.enum(["trace", "debug", "info", "warn", "error", "fatal"])
		.default("info"),
});

/* Stuff we care about from the package file */
export const FromPackageFile = z.object({
	name: z.string(),
	version: z.string(),
	description: z.string().optional(),
});

/* Stuff read from the config file for 'execute' */
export const FromConfigFile = z.object({
	accounts: CloudAccount.array(),
});

/* Final params as needed by the synthesizer */
export const ToSynthesize = z.object({
	meshName: z.string(),
	accounts: CloudAccount.array(),
	psk: z.string(),
	projectName: z.string(),
	workDir: z.string(),
	url: z.string().optional(),
});

export type FromPackageFile = z.infer<typeof FromPackageFile>;
export type FromConfigFile = z.infer<typeof FromConfigFile>;
export type Configuration = z.infer<typeof Configuration>;
export type ToSynthesize = z.infer<typeof ToSynthesize>;
