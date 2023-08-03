import { lock } from "./utils";

describe("deepFreeze", () => {
	it("should freeze a simple object", () => {
		const obj = { name: "John", age: 30 };
		const frozenObj = lock(obj);

		expect(Object.isFrozen(frozenObj)).toBe(true);
	});

	it("should freeze nested objects", () => {
		const obj = {
			name: "John",
			age: 30,
			address: {
				city: "New York",
				country: "USA",
			},
		};
		const frozenObj = lock(obj);

		expect(Object.isFrozen(frozenObj)).toBe(true);
		expect(Object.isFrozen(frozenObj.address)).toBe(true);
	});

	it("should return the same object if it is already frozen", () => {
		const obj = { name: "John", age: 30 };
		Object.freeze(obj);
		const frozenObj = lock(obj);

		expect(frozenObj).toBe(obj);
	});

	it("should return the same object if it is undefined or null", () => {
		const obj1 = undefined;
		const obj2 = null;
		const frozenObj1 = lock(obj1);
		const frozenObj2 = lock(obj2);

		expect(frozenObj1).toBe(obj1);
		expect(frozenObj2).toBe(obj2);
	});
});
