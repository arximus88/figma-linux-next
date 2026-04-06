declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;

  export function mock<T = any>(
    fn?: (...args: any[]) => any,
  ): T & { mock: any; called: boolean; calls: any[][] };
  export namespace mock {
    function module(path: string, factory: () => any): void;
  }

  export function spyOn<T, K extends keyof T>(obj: T, key: K): any;

  interface Expect<T> {
    toBe(expected: T): void;
    toEqual(expected: T): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toContain(item: any): void;
    toThrow(): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledWith(...args: any[]): void;
    toBeInstanceOf(constructor: any): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeCloseTo(expected: number, precision?: number): void;
    toHaveLength(length: number): void;
    toMatch(regexp: RegExp | string): void;
    toHaveProperty(prop: string, value?: any): void;
    toContainEqual(item: any): void;
    toThrow(expected?: string | RegExp): void;
    resolves: Expect<Promise<T>>;
    rejects: Expect<Promise<T>>;
    not: Expect<T>;
  }

  export function expect<T>(actual: T): Expect<T>;
}
