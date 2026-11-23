import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8",
);

function createWorker({
  fetchImpl = async () => new Response("network"),
} = {}) {
  const listeners = new Map();
  const cacheNames = [
    "pixzer-public-shell-v0",
    "pixzer-public-shell-v1",
    "unrelated-cache",
  ];
  const cacheContents = new Map();
  const addedUrls = [];
  const putUrls = [];
  const deletedNames = [];
  const cache = {
    async addAll(urls) {
      addedUrls.push(...urls);
    },
    async match(request) {
      const key =
        typeof request === "string" ? request : new URL(request.url).pathname;
      return cacheContents.get(key);
    },
    async put(request, response) {
      const url = new URL(request.url);
      putUrls.push(url.pathname);
      cacheContents.set(url.pathname, response);
    },
  };
  const caches = {
    async open() {
      return cache;
    },
    async keys() {
      return [...cacheNames, "pixzer-public-shell-v2"];
    },
    async delete(name) {
      deletedNames.push(name);
      return true;
    },
    async match(request) {
      const key =
        typeof request === "string" ? request : new URL(request.url).pathname;
      return cacheContents.get(key);
    },
  };
  const self = {
    location: { origin: "https://pixzer.test" },
    clients: { claim: async () => {} },
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
  };
  vm.runInNewContext(workerSource, {
    self,
    caches,
    fetch: fetchImpl,
    URL,
    Response,
    Promise,
  });
  return { listeners, caches, cacheContents, addedUrls, putUrls, deletedNames };
}

function dispatch(listener, fields) {
  let waitPromise;
  let responsePromise;
  listener({
    ...fields,
    waitUntil(promise) {
      waitPromise = promise;
    },
    respondWith(promise) {
      responsePromise = promise;
    },
  });
  return { waitPromise, responsePromise };
}

function basicResponse(cacheControl) {
  return {
    ok: true,
    type: "basic",
    headers: new Headers({ "cache-control": cacheControl }),
    clone() {
      return this;
    },
  };
}

test("install precaches only the generic shell and explicit public assets", async () => {
  const worker = createWorker();
  const { waitPromise } = dispatch(worker.listeners.get("install"), {});
  await waitPromise;

  assert.deepEqual(worker.addedUrls, [
    "/offline.html",
    "/brand/pixzer-logo-tv-vacia-negro.png",
    "/brand/pixzer-logo-tv-vacia-blanco.png",
  ]);
  assert.equal(
    worker.addedUrls.some((path) => /api|rom|save|auth/i.test(path)),
    false,
  );
});

test("activation deletes only old pixzer-owned shell caches", async () => {
  const worker = createWorker();
  const { waitPromise } = dispatch(worker.listeners.get("activate"), {});
  await waitPromise;

  assert.deepEqual(worker.deletedNames, [
    "pixzer-public-shell-v0",
    "pixzer-public-shell-v1",
  ]);
});

test("offline navigation falls back without storing private page HTML", async () => {
  const fallback = new Response("generic offline page");
  const worker = createWorker({
    fetchImpl: async () => {
      throw new TypeError("offline");
    },
  });
  worker.cacheContents.set("/offline.html", fallback);

  const { responsePromise } = dispatch(worker.listeners.get("fetch"), {
    request: {
      url: "https://pixzer.test/library",
      method: "GET",
      mode: "navigate",
    },
  });

  assert.equal(await (await responsePromise).text(), "generic offline page");
  assert.deepEqual(worker.putUrls, []);
});

test("private, API, external, query-bearing, and non-GET requests are not cached", () => {
  const worker = createWorker();
  const cases = [
    { url: "https://pixzer.test/api/saves", method: "GET", mode: "cors" },
    {
      url: "https://pixzer.test/auth/confirm?code=secret",
      method: "GET",
      mode: "cors",
    },
    {
      url: "https://pixzer.test/private/roms/game-1",
      method: "GET",
      mode: "cors",
    },
    {
      url: "https://storage.example.test/signed-save?token=secret",
      method: "GET",
      mode: "cors",
    },
    {
      url: "https://pixzer.test/_next/static/chunk.js",
      method: "POST",
      mode: "cors",
    },
    {
      url: "https://pixzer.test/private/icon.png?user=private",
      method: "GET",
      mode: "cors",
    },
  ];

  for (const request of cases) {
    const { responsePromise } = dispatch(worker.listeners.get("fetch"), {
      request,
    });
    assert.equal(responsePromise, undefined);
  }

  assert.deepEqual(worker.putUrls, []);
});

test("hashed Next assets are cached only when immutable and public", async () => {
  const worker = createWorker({
    fetchImpl: async (request) => {
      if (request.url.endsWith("private.js")) {
        return basicResponse("private, immutable");
      }
      return basicResponse("public, max-age=31536000, immutable");
    },
  });

  const privateResult = dispatch(worker.listeners.get("fetch"), {
    request: {
      url: "https://pixzer.test/_next/static/private.js",
      method: "GET",
      mode: "cors",
    },
  });
  await privateResult.responsePromise;
  assert.deepEqual(worker.putUrls, []);

  const publicResult = dispatch(worker.listeners.get("fetch"), {
    request: {
      url: "https://pixzer.test/_next/static/chunk-hash.js",
      method: "GET",
      mode: "cors",
    },
  });
  await publicResult.responsePromise;
  assert.deepEqual(worker.putUrls, ["/_next/static/chunk-hash.js"]);
});
