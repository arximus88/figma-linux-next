import { describe, expect, it } from "bun:test";
import { keysToCamelCase, keysToKebabCase } from "./object";

describe("object utils", () => {
  describe("keysToCamelCase", () => {
    it("converts kebab-case keys to camelCase", () => {
      const input = {
        "first-name": "John",
        "last-name": "Doe",
        "age-in-years": "30",
      };
      const expected = {
        firstName: "John",
        lastName: "Doe",
        ageInYears: "30",
      };
      expect(keysToCamelCase(input)).toEqual(expected);
    });

    it("leaves already camelCase keys unchanged", () => {
      const input = {
        firstName: "John",
        lastName: "Doe",
      };
      expect(keysToCamelCase(input)).toEqual(input);
    });

    it("handles empty objects", () => {
      expect(keysToCamelCase({})).toEqual({});
    });

    it("does not modify nested objects (shallow transform)", () => {
      const input = {
        "user-info": {
          "first-name": "John",
        } as any, // Cast because the type is Record<string, string>
      };
      const expected = {
        userInfo: {
          "first-name": "John",
        },
      };
      expect(keysToCamelCase(input)).toEqual(expected);
    });
  });

  describe("keysToKebabCase", () => {
    it("converts camelCase keys to kebab-case", () => {
      const input = {
        firstName: "John",
        lastName: "Doe",
        ageInYears: "30",
      };
      const expected = {
        "first-name": "John",
        "last-name": "Doe",
        "age-in-years": "30",
      };
      expect(keysToKebabCase(input)).toEqual(expected);
    });

    it("leaves already kebab-case keys unchanged", () => {
      const input = {
        "first-name": "John",
        "last-name": "Doe",
      };
      expect(keysToKebabCase(input)).toEqual(input);
    });

    it("handles empty objects", () => {
      expect(keysToKebabCase({})).toEqual({});
    });

    it("does not modify nested objects (shallow transform)", () => {
      const input = {
        userInfo: {
          firstName: "John",
        } as any,
      };
      const expected = {
        "user-info": {
          firstName: "John",
        },
      };
      expect(keysToKebabCase(input)).toEqual(expected);
    });
  });
});
