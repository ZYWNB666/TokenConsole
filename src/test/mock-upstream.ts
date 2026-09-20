import { createServer, type IncomingMessage, type Server } from "node:http";

/**
 * A minimal in-process New API mock for adapter and route-handler tests.
 * It records every incoming request (method, url, headers, body) so tests
 * can assert exactly what the BFF sent upstream, and serves a scripted list
 * of routes. No production service is involved.
 */

export type RecordedRequest = {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
};

export type MockRoute = {
  method?: string;
  path: string;
  status?: number;
  /** JSON body served for the route (already envelope-shaped by the caller). */
  body?: string;
  /** Raw Set-Cookie headers served for the route. */
  setCookie?: string[];
  /** Artificial delay before responding, to simulate upstream timeouts. */
  delayMs?: number;
  /**
   * Sequential replies: each matching request consumes the next entry; when
   * the queue is empty the route 404s. Used to script multi-step flows
   * (e.g. self → 401, refresh → 200, self → 200).
   */
  replies?: Array<{ status?: number; body?: string; setCookie?: string[]; delayMs?: number }>;
};

export type MockUpstream = {
  url: string;
  requests: RecordedRequest[];
  setRoutes: (routes: MockRoute[]) => void;
  close: () => Promise<void>;
};

function serveRoute(
  route: MockRoute,
  reply: { status?: number; body?: string; setCookie?: string[] },
  response: import("node:http").ServerResponse,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const setCookie = reply.setCookie ?? route.setCookie;
  if (setCookie && setCookie.length > 0) {
    response.setHeader("Set-Cookie", setCookie);
  }
  response.writeHead(reply.status ?? route.status ?? 200, headers);
  response.end(reply.body ?? route.body ?? "{}");
}

export async function startMockUpstream(routes: MockRoute[]): Promise<MockUpstream> {
  const requests: RecordedRequest[] = [];
  let currentRoutes = routes;
  const replyQueues = new Map<
    MockRoute,
    Array<{ status?: number; body?: string; setCookie?: string[]; delayMs?: number }>
  >();
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      requests.push({
        method: request.method ?? "",
        url: request.url ?? "",
        headers: request.headers,
        body,
      });
      const route = currentRoutes.find(
        (candidate) =>
          candidate.path === request.url &&
          (candidate.method ?? request.method) === request.method,
      );
      if (!route) {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: false, message: "mock: not found" }));
        return;
      }
      if (route.replies) {
        let queue = replyQueues.get(route);
        if (!queue) {
          queue = [...route.replies];
          replyQueues.set(route, queue);
        }
        const reply = queue.shift();
        if (!reply) {
          response.writeHead(404, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ success: false, message: "mock: replies exhausted" }));
          return;
        }
        const delay = reply.delayMs ?? 0;
        setTimeout(() => serveRoute(route, reply, response), delay);
        return;
      }
      const routeDelay = route.delayMs ?? 0;
      if (routeDelay > 0) {
        setTimeout(() => serveRoute(route, {}, response), routeDelay);
        return;
      }
      serveRoute(route, {}, response);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("mock upstream failed to listen");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    setRoutes: (next: MockRoute[]) => {
      currentRoutes = next;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
