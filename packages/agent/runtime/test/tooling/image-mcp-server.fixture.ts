import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const width = 6000, height = 2;
const bmp = Buffer.alloc(54 + width * height * 3, 128);
bmp.fill(0, 0, 54);
bmp.write("BM"); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10);
bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(width, 18); bmp.writeInt32LE(height, 22);
bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
const data = Buffer.from(await new Bun.Image(bmp).png().bytes()).toString("base64");
const server = new Server({ name: "image-fixture", version: "1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "screenshot", inputSchema: { type: "object" } }] }));
server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [
  { type: "text", text: "Captured the page successfully" },
  { type: "image", mimeType: "image/jpeg", data }, // Deliberately incorrect MIME.
  { type: "image", mimeType: "image/png", data: "YWJj" }, // Valid Base64, invalid image.
  { type: "text", text: "Page title: fixture" },
] }));
await server.connect(new StdioServerTransport());
