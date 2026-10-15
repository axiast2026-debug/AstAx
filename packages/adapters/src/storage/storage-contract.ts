import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ObjectNotFoundError, type ObjectStoragePort } from "./object-storage.js";

/**
 * One contract for every ObjectStoragePort (CLAUDE.md «Come si scrivono i
 * test»: a single suite for the fake and the real adapter).
 */
export function storageContract(storage: () => ObjectStoragePort): void {
  const body = new TextEncoder().encode("documento di prova");

  it("stores and reads back an object", async () => {
    const key = `test/${randomUUID()}`;
    await storage().put({ key, body, contentType: "text/plain" });
    expect(Buffer.from(await storage().get(key)).toString("utf8")).toBe("documento di prova");
  });

  it("replaces an object written again under the same key", async () => {
    const key = `test/${randomUUID()}`;
    await storage().put({ key, body, contentType: "text/plain" });
    await storage().put({ key, body: new TextEncoder().encode("v2"), contentType: "text/plain" });
    expect(Buffer.from(await storage().get(key)).toString("utf8")).toBe("v2");
  });

  it("reports a missing object", async () => {
    await expect(storage().get(`test/${randomUUID()}`)).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it("deletes an object", async () => {
    const key = `test/${randomUUID()}`;
    await storage().put({ key, body, contentType: "text/plain" });
    await storage().delete(key);
    await expect(storage().get(key)).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it("gives a signed download link", async () => {
    const key = `test/${randomUUID()}`;
    await storage().put({ key, body, contentType: "text/plain" });
    const url = await storage().signedDownloadUrl(key, {
      expiresInSeconds: 60,
      fileName: "libretto.pdf",
    });
    expect(url.length).toBeGreaterThan(10);
  });
}
