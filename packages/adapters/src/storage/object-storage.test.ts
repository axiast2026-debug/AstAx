import { describe } from "vitest";
import { InMemoryObjectStorage } from "./object-storage.js";
import { storageContract } from "./storage-contract.js";

describe("in-memory storage", () => {
  const storage = new InMemoryObjectStorage();
  storageContract(() => storage);
});
