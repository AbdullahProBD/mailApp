/**
 * Static server for the Storybook visual-regression suite.
 *
 * The suite runs against `storybook-static`, not the dev server: no HMR, no
 * websocket, no rebuild during a run. The server binds to loopback only, sets
 * `no-store` so Chromium never reuses a stale asset between stories, and
 * refuses paths that escape the build directory.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

/* eslint-disable security/detect-non-literal-fs-filename -- every path is
   resolved from the request URL and prefix-checked against the build root in
   resolveFile() before it reaches the filesystem. */

const port = Number(process.env.STORYBOOK_PORT ?? 3200);
const root = path.resolve(process.cwd(), "storybook-static");

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function resolveFile(urlPath: string): Promise<string | null> {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const candidate = path.resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;

  try {
    const info = await stat(candidate);
    if (info.isFile()) return candidate;
    if (info.isDirectory()) {
      const index = path.join(candidate, "index.html");
      const indexInfo = await stat(index);
      if (indexInfo.isFile()) return index;
    }
  } catch {
    return null;
  }
  return null;
}

const server = createServer((request, response) => {
  void (async () => {
    const url = request.url ?? "/";
    const file = (await resolveFile(url)) ?? (await resolveFile("/iframe.html"));
    if (!file) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    createReadStream(file).pipe(response);
  })().catch(() => {
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    }
    response.end("Internal error");
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Storybook static server listening on http://127.0.0.1:${String(port)}\n`);
});
