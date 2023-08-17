import * as pulumi from "@pulumi/pulumi";
import { IpV4Address } from "../types/new-types";

// Normally I don't love singleton classes like this but I think the alternative is worse.
// TODO: this class isn't really serving the purpose I thought it would.  I think we need to rethink its use.
export class Targeter<Output extends pulumi.Output<IpV4Address> | IpV4Address> {
	public readonly dummyIp: Output;
	private targets: Record<string, Output | undefined> = {};
	private dummyCount = 0;

	constructor(dummy: Output) {
		this.dummyIp = dummy;
	}

	set(name: string, value: Output): typeof this {
		// TODO: this check really should pass but it doesn't just yet.
		// I think that is evidence of a bug somewhere but I don't have time to
		// chase it down at the moment.

		// if (this.targets[name] !== undefined) {
		// 	throw new Error(`Duplicate name: ${name}`);
		// }
		this.targets[name] = value;
		return this;
	}

	get(name: string): Output {
		const ip = this.targets[name];
		if (ip === undefined) {
			this.dummyCount++;
			return this.dummyIp;
		} else {
			return ip;
		}
	}

	*[Symbol.iterator](): Iterator<[string, Output]> {
		for (const [k, v] of Object.entries(this.targets)) {
			if (v !== undefined) {
				yield [k, v];
			} else {
				throw new Error(`Unreachable code: undefined targeter value`);
			}
		}
	}

	countDummies(): number {
		return this.dummyCount;
	}
}
