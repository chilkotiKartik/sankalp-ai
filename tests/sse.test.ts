import { describe, it, expect, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { server, stopApp, deptToken } from "./helpers";
import { openStreamCount } from "../server/lib/sse";

afterAll(() => stopApp());

describe("m11 SSE connection limits", () => {
  it("a department session may hold 3 live streams; the 4th gets 429; slots free on disconnect", async () => {
    const srv = server();
    await new Promise<void>(r => (srv.listening ? r() : srv.listen(0, "127.0.0.1", () => r())));
    const port = (srv.address() as AddressInfo).port;
    const tok = await deptToken("ulb");
    const url = `http://127.0.0.1:${port}/api/dept/ulb/stream?token=${encodeURIComponent(tok)}`;
    const ctrls = [new AbortController(), new AbortController(), new AbortController()];
    const res = await Promise.all(ctrls.map(c => fetch(url, { signal: c.signal })));
    expect(res.map(r => r.status)).toEqual([200, 200, 200]);
    const fourth = await fetch(url);
    expect(fourth.status).toBe(429);
    expect(openStreamCount("uttarakhand:d:ulb")).toBe(3);
    ctrls.forEach(c => c.abort());
    await new Promise(r => setTimeout(r, 200));
    expect(openStreamCount("uttarakhand:d:ulb")).toBe(0);
  });
});
