import { Targeter } from "./fixture";

import { IpV4Address } from "../types/new-types";

describe("Targeter", () => {
	let targeter: Targeter<IpV4Address>;
	let emptyTargeter: Targeter<IpV4Address>;

	function iterationToSet(
		tt: Targeter<IpV4Address>,
	): Set<[string, IpV4Address]> {
		const ss: Set<[string, IpV4Address]> = new Set();
		for (const [k, v] of tt) {
			ss.add([k, v]);
		}
		return ss;
	}

	beforeEach(() => {
		targeter = new Targeter<IpV4Address>(IpV4Address.parse("1.1.1.1"));
		targeter.set("aaaa", IpV4Address.parse("12.13.14.15"));
		targeter.set("bbbb", IpV4Address.parse("16.17.18.19"));
		targeter.set("cccc", IpV4Address.parse("21.22.23.24"));

		emptyTargeter = new Targeter<IpV4Address>(IpV4Address.parse("1.1.1.1"));
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
		expect(targeter.get("bbbb")).toEqual(IpV4Address.parse("16.17.18.19"));
	});

	it("bad get yields dummy ip", () => {
		expect(targeter.get("dddd")).toEqual(IpV4Address.parse("1.1.1.1"));
	});

	it("set then get yields valid ip", () => {
		targeter.set("dddd", IpV4Address.parse("31.30.31.30"));
		expect(targeter.get("dddd")).toEqual(IpV4Address.parse("31.30.31.30"));
	});

	it("changing an existing ip", () => {
		expect(targeter.get("bbbb")).toEqual(IpV4Address.parse("16.17.18.19"));
		targeter.set("bbbb", IpV4Address.parse("31.30.31.30"));
		expect(targeter.get("bbbb")).toEqual(IpV4Address.parse("31.30.31.30"));
	});

	it("iterating a targeter", () => {
		const expectedSet = new Set<[string, IpV4Address]>([
			["aaaa", IpV4Address.parse("12.13.14.15")],
			["bbbb", IpV4Address.parse("16.17.18.19")],
			["cccc", IpV4Address.parse("21.22.23.24")],
		]);
		const actualSet: Set<[string, IpV4Address]> = iterationToSet(targeter);
		expect(actualSet).toEqual(expectedSet);
	});

	it("iterating an empty targeter", () => {
		const expectedSet: Set<[string, IpV4Address]> = new Set();
		const actualSet: Set<[string, IpV4Address]> = iterationToSet(emptyTargeter);
		expect(actualSet).toEqual(expectedSet);
	});

	it("modifying a targeter", () => {
		const expectedSet = new Set<[string, IpV4Address]>([
			["aaaa", IpV4Address.parse("12.13.14.15")],
			["bbbb", IpV4Address.parse("16.17.18.19")],
			["cccc", IpV4Address.parse("21.22.23.24")],
		]);
		let actualSet: Set<[string, IpV4Address]> = iterationToSet(targeter);
		expect(actualSet).toEqual(expectedSet);

		targeter.set("bbbb", IpV4Address.parse("31.30.31.30"));
		actualSet = iterationToSet(targeter);
		const expectedSet2 = new Set<[string, IpV4Address]>([
			["aaaa", IpV4Address.parse("12.13.14.15")],
			["bbbb", IpV4Address.parse("31.30.31.30")],
			["cccc", IpV4Address.parse("21.22.23.24")],
		]);
		expect(actualSet).toEqual(expectedSet2);

		targeter.set("dddd", IpV4Address.parse("42.43.43.42"));
		actualSet = iterationToSet(targeter);
		const expectedSet3 = new Set<[string, IpV4Address]>([
			["aaaa", IpV4Address.parse("12.13.14.15")],
			["bbbb", IpV4Address.parse("31.30.31.30")],
			["cccc", IpV4Address.parse("21.22.23.24")],
			["dddd", IpV4Address.parse("42.43.43.42")],
		]);
		expect(actualSet).toEqual(expectedSet3);
	});
});
