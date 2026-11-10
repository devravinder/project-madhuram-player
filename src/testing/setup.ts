import "fake-indexeddb/auto";

// Tests must never reach a real server. Code under test gets the fake GitHub
// passed in, or a test stubs fetch itself.
globalThis.fetch = (input) =>
  Promise.reject(new Error(`Real network is blocked in tests: ${String(input)}`));