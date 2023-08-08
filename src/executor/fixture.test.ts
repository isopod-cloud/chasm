import { Targeter } from "./fixture";

import { IpV4Address } from "../types/new-types";
import * as pulumi from "@pulumi/pulumi";

describe("Targeter", () => {
    let targeter: Targeter;
    let emptyTargeter: Targeter;

    function iterationToSet(tt: Targeter) : Set<[string, pulumi.Output<IpV4Address>]> {
        const ss : Set<[string, pulumi.Output<IpV4Address>]> = new Set();
        for (const [k, v] of tt) {
            ss.add([k, v]);
        }
        return ss;
    }

    beforeEach(() => {
        targeter = new Targeter();
        targeter.set("aaaa", pulumi.output(IpV4Address.parse("12.13.14.15")));
        targeter.set("bbbb", pulumi.output(IpV4Address.parse("16.17.18.19")));
        targeter.set("cccc", pulumi.output(IpV4Address.parse("21.22.23.24")));

        emptyTargeter = new Targeter();
    });

    it("zero dummy count", () => {
		expect(targeter.countDummies()).toBe(0);
        targeter.get("aaaa");
        targeter.get("bbbb");
        targeter.get("cccc");
		expect(targeter.countDummies()).toBe(0);
	});

    it("nonzero dummy count", () => {
		expect(targeter.countDummies()).toBe(0);
        targeter.get("BBBB");
        targeter.get("bbbb");
        targeter.get("BbBb");
		expect(targeter.countDummies()).toBe(2);
	});


    it("nonzero dummy count on empty targeter", () => {
		expect(emptyTargeter.countDummies()).toBe(0);
        emptyTargeter.get("bbbb");
		expect(emptyTargeter.countDummies()).toBe(1);
	});

    it("get valid ip", () => {
        const bbbb = targeter.get("bbbb").apply((v)=>{JSON.stringify(v);})
        console.log(`xxx=${bbbb}`);
		expect(bbbb).toBe("16.17.18.19");
	});

    it("bad get yields dummy ip", () => {
		expect(targeter.get("dddd")).toEqual(IpV4Address.parse("1.1.1.1"));
	});

    it("set then get yields valid ip", () => {
        targeter.set("dddd", pulumi.output(IpV4Address.parse("31.30.31.30")));
		expect(targeter.get("dddd")).toEqual(IpV4Address.parse("31.30.31.30"));
	});

    it("changing an existing ip", () => {
		expect(targeter.get("bbbb")).toEqual(IpV4Address.parse("16.17.18.19"));
        targeter.set("bbbb", pulumi.output(IpV4Address.parse("31.30.31.30")));
		expect(targeter.get("bbbb")).toEqual(IpV4Address.parse("31.30.31.30"));
	});

    it("iterating a targeter", () => {
        const expectedSet = new Set<[string, pulumi.Output<IpV4Address>]>([
            ["aaaa", pulumi.output(IpV4Address.parse("12.13.14.15"))],
            ["bbbb", pulumi.output(IpV4Address.parse("16.17.18.19"))],
            ["cccc", pulumi.output(IpV4Address.parse("21.22.23.24"))],
        ]);
        const actualSet : Set<[string, pulumi.Output<IpV4Address>]> = iterationToSet(targeter);
        expect(actualSet).toEqual(expectedSet);
	});

    it("iterating an empty targeter", () => {
        const expectedSet : Set<[string, pulumi.Output<IpV4Address>]> = new Set();
        const actualSet : Set<[string, pulumi.Output<IpV4Address>]> = iterationToSet(emptyTargeter);
        expect(actualSet).toEqual(expectedSet);
	});

    it("modifying a targeter", () => {
        const expectedSet = new Set<[string, pulumi.Output<IpV4Address>]>([
            ["aaaa", pulumi.output(IpV4Address.parse("12.13.14.15"))],
            ["bbbb", pulumi.output(IpV4Address.parse("16.17.18.19"))],
            ["cccc", pulumi.output(IpV4Address.parse("21.22.23.24"))],
        ]);
        let actualSet : Set<[string, pulumi.Output<IpV4Address>]> = iterationToSet(targeter);
        expect(actualSet).toEqual(expectedSet);

        targeter.set("bbbb", pulumi.output(IpV4Address.parse("31.30.31.30")));
        actualSet = iterationToSet(targeter);
        const expectedSet2 = new Set<[string, pulumi.Output<IpV4Address>]>([
            ["aaaa", pulumi.output(IpV4Address.parse("12.13.14.15"))],
            ["bbbb", pulumi.output(IpV4Address.parse("31.30.31.30"))],
            ["cccc", pulumi.output(IpV4Address.parse("21.22.23.24"))],
        ]);
        expect(actualSet).toEqual(expectedSet2);

        targeter.set("dddd", pulumi.output(IpV4Address.parse("42.43.43.42")));
        actualSet = iterationToSet(targeter);
        const expectedSet3 = new Set<[string, pulumi.Output<IpV4Address>]>([
            ["aaaa", pulumi.output(IpV4Address.parse("12.13.14.15"))],
            ["bbbb", pulumi.output(IpV4Address.parse("31.30.31.30"))],
            ["cccc", pulumi.output(IpV4Address.parse("21.22.23.24"))],
            ["dddd", pulumi.output(IpV4Address.parse("42.43.43.42"))],
        ]);
        expect(actualSet).toEqual(expectedSet3);
    });
});
