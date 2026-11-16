import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { registerDownloads } from "../server/downloads.js";

test("private media enforces owner authentication without relying on another router", async () => {
  const app = express();
  let reads = 0;
  registerDownloads(app, {
    service: {
      get() {
        reads++;
        throw new Error("Must not read private metadata");
      },
    },
    requireOwner: (req, res) => res.sendStatus(401),
  });
  await request(app).get("/api/transfers/private/media/0").expect(401);
  await request(app).head("/api/transfers/private/media/0").expect(401);
  assert.equal(reads, 0);
});
