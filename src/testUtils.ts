import * as pulumi from "@pulumi/pulumi";

// Convert a pulumi.Output to a promise of the same type.
//
// NOTE that we only ever want to do this to await the result on a pulumi.Output object for a unit
// test. We do not want to do this on production code due to possibility of exposing secrets, per
// this site:
//
// https://github.com/pulumi/pulumi/issues/5924

export function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
	return new Promise((resolve) => output.apply(resolve));
}
