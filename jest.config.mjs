/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  clearMocks: true,
  testMatch: ["**/__tests__/**/*.test.ts"],
  // package:action writes a second package.json with the same npm identity.
  modulePathIgnorePatterns: ["<rootDir>/publish/"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    // swc strips the types and emits ESM, which is what the tests need for
    // `jest.unstable_mockModule` and top-level await. It does not type-check,
    // so `npm test` runs tsc over src and __tests__ first - see the typecheck
    // script, which is the half of ts-jest worth keeping.
    "^.+\\.tsx?$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        module: { type: "es6" },
      },
    ],
  },
};
