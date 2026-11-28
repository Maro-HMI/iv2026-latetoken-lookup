(() => {
  // The tracker publishes HTML, JS, JSON and images. Restore the original
  // Godot binaries from the compressed bundle inside the game document.
  const base = new URL(".", document.currentScript.src);
  const files = new Map(
    [
      ["index.wasm", "application/wasm"],
      ["index.pck", "application/octet-stream"],
    ].map(([name, mime]) => [new URL(name, base).href, { name, mime }]),
  );

  const fetchFromNetwork = window.fetch.bind(window);
  let bundle;

  async function loadBundle() {
    const response = await fetchFromNetwork(new URL("runtime.json", base));
    if (!response.ok) {
      throw new Error(`Could not load the Godot runtime (HTTP ${response.status}).`);
    }
    return response.json();
  }

  function decodeBase64(encoded) {
    if (typeof Uint8Array.fromBase64 === "function") {
      return Uint8Array.fromBase64(encoded);
    }
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let offset = 0; offset < bytes.length; offset += 1) {
      bytes[offset] = binary.charCodeAt(offset);
    }
    return bytes;
  }

  window.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input, document.baseURI);
    const file = files.get(url.href);
    if (!file) {
      return fetchFromNetwork(input, options);
    }

    bundle ??= loadBundle().catch((error) => {
      bundle = undefined;
      throw error;
    });
    const { gzip, size } = (await bundle)[file.name];
    const stream = new Blob([decodeBase64(gzip)])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream, {
      headers: { "Content-Type": file.mime, "Content-Length": String(size) },
    });
  };
})();
