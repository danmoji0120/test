// Portable on Windows cmd/PowerShell, macOS, and Linux.
process.env.NODE_ENV = "production";
await import("../dist/server.mjs");
