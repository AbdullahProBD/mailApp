/**
 * E2E server.
 *
 * Playwright drives the production build over real HTTPS for two reasons:
 *   1. the session cookie is `__Host-` + `Secure`, so it is only stored on a
 *      secure origin;
 *   2. production environment validation requires an HTTPS `APP_URL` and
 *      `TRUSTED_PROXY_HEADERS=true`, and we want the tested configuration to
 *      match what is deployed.
 *
 * The script also runs a PGlite TCP server (no local PostgreSQL is required)
 * and a stub for the Have I Been Pwned range API so the suite never touches the
 * network. A throwaway self-signed certificate is generated on first run.
 */
import { execFileSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import next from "next";

import { applyMigrations, loadMigrations, type MigrationTarget } from "../src/lib/db/migrate";

const port = Number(process.env.E2E_PORT ?? 3100);
const databasePort = Number(process.env.E2E_DATABASE_PORT ?? 5432);
const hibpPort = Number(process.env.E2E_HIBP_PORT ?? 5433);
const certificateDir = path.join(process.cwd(), ".next", "e2e-tls");
const certificatePath = path.join(certificateDir, "localhost.pem");
const keyPath = path.join(certificateDir, "localhost-key.pem");

function ensureCertificate(): { cert: Buffer; key: Buffer } {
  mkdirSync(certificateDir, { recursive: true });
  if (!existsSync(certificatePath) || !existsSync(keyPath)) {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-keyout",
        keyPath,
        "-out",
        certificatePath,
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost,DNS:127.0.0.1",
      ],
      { stdio: "ignore" },
    );
  }
  return { cert: readFileSync(certificatePath), key: readFileSync(keyPath) };
}

const database = new PGlite();
const migrationTarget: MigrationTarget = {
  async transaction(run) {
    return database.transaction(async (tx) =>
      run({
        async exec(statement) {
          await tx.exec(statement);
        },
        async query<T extends Record<string, unknown>>(statement: string, params?: unknown[]) {
          return (await tx.query<T>(statement, params ?? [])).rows;
        },
      }),
    );
  },
};

await applyMigrations(
  migrationTarget,
  await loadMigrations(new URL("../db/migrations", import.meta.url).pathname),
);

const databaseServer = new PGLiteSocketServer({
  db: database,
  host: "127.0.0.1",
  port: databasePort,
  maxConnections: 10,
});
await databaseServer.start();

// The password hashing path calls the range API. Answering with a single
// non-matching hash keeps the check deterministic and offline.
const hibpServer = createHttpServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("0000000000000000000000000000000000A:1\n");
});
await new Promise<void>((resolve) => hibpServer.listen(hibpPort, "127.0.0.1", resolve));

const app = next({ dev: false, hostname: "localhost", port });
await app.prepare();
const handle = app.getRequestHandler();
const { cert, key } = ensureCertificate();

const server = createHttpsServer({ cert, key }, (request, response) => {
  void handle(request, response);
});
await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

process.stdout.write(`E2E server listening on https://localhost:${String(port)}\n`);

async function shutdown(): Promise<void> {
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
  await new Promise<void>((resolve) =>
    hibpServer.close(() => {
      resolve();
    }),
  );
  await databaseServer.stop();
  await database.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
