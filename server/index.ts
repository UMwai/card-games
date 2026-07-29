import compression from "compression";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { RoomManager } from "./rooms.js";

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "0.0.0.0";
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true }
});

app.use(cors());
app.use(compression());
app.use(express.json());

function localUrls(): string[] {
  const urls: string[] = [];
  try {
    for (const addresses of Object.values(networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === "IPv4" && !address.internal) urls.push(`http://${address.address}:${port}`);
      }
    }
  } catch {
    // Some locked-down containers disallow interface enumeration. Local play
    // still works; PUBLIC_URL can provide a friend-facing address explicitly.
  }
  return urls;
}

const publicBase = process.env.PUBLIC_URL ?? localUrls()[0] ?? `http://localhost:${port}`;
const rooms = new RoomManager(io, () => publicBase);
io.on("connection", (socket) => rooms.attach(socket));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "double-happiness", games: ["shengji", "guandan"] });
});
app.get("/api/network-info", (_request, response) => {
  response.json({ local: `http://localhost:${port}`, network: localUrls(), recommended: publicBase });
});

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(currentDir, "../../dist");
app.use(express.static(staticDir));
app.use((request, response, next) => {
  if (request.path.startsWith("/api/") || request.path.startsWith("/socket.io")) return next();
  response.sendFile(path.join(staticDir, "index.html"));
});

httpServer.listen(port, host, () => {
  console.log(`\n  Double Happiness is ready`);
  console.log(`  Local:   http://localhost:${port}`);
  for (const url of localUrls()) console.log(`  Friends: ${url}`);
  console.log("");
});
