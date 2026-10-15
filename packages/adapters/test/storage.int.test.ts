import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { S3ObjectStorage } from "../src/storage/object-storage.js";
import { storageContract } from "../src/storage/storage-contract.js";

// The same SeaweedFS image as infra/docker-compose.yml (ADR 0003), with
// throwaway credentials that exist only inside this container.
const ACCESS_KEY = "contract-test-access";
const SECRET_KEY = "contract-test-secret-0123456789";

let container: StartedTestContainer;
let storage: S3ObjectStorage;

beforeAll(async () => {
  const config = JSON.stringify({
    identities: [
      {
        name: "astax",
        credentials: [{ accessKey: ACCESS_KEY, secretKey: SECRET_KEY }],
        actions: ["Admin", "Read", "Write", "List", "Tagging"],
      },
    ],
  });
  container = await new GenericContainer("chrislusf/seaweedfs:4.48")
    .withEntrypoint(["/bin/sh", "-c"])
    .withCommand([
      `mkdir -p /etc/seaweedfs && printf '%s' '${config}' > /etc/seaweedfs/s3.json && exec weed server -dir=/data -ip.bind=0.0.0.0 -master.volumeSizeLimitMB=64 -volume.max=0 -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json`,
    ])
    .withExposedPorts(8333)
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(120_000)
    .start();
  storage = new S3ObjectStorage({ ...storageConfig(), forcePathStyle: true });
  // SeaweedFS opens the S3 port a moment before it accepts requests.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await storage.ensureBucket();
      break;
    } catch (error) {
      if (attempt > 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
});

function storageConfig() {
  return {
    endpoint: `http://${container.getHost()}:${container.getMappedPort(8333)}`,
    region: "eu-south-1",
    bucket: "astax-contract-test",
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  };
}

afterAll(async () => {
  await container?.stop();
});

describe("S3 storage on SeaweedFS", () => {
  storageContract(() => storage);

  it("the signed link downloads the object with its file name", async () => {
    await storage.put({
      key: "test/link",
      body: new TextEncoder().encode("ciao"),
      contentType: "text/plain",
    });
    const url = await storage.signedDownloadUrl("test/link", {
      expiresInSeconds: 60,
      fileName: "libretto è.pdf",
    });
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ciao");
    expect(response.headers.get("content-disposition")).toContain("libretto");
  });
});
