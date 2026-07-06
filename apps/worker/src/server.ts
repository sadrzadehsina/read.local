import { Readability } from "@mozilla/readability";
import { PrismaClient, type Source } from "@prisma/client";
import Fastify from "fastify";
import { JSDOM } from "jsdom";
import Parser from "rss-parser";
import type { HealthResponse } from "@readlocal/shared";

const app = Fastify({
  logger: true
});

const prisma = new PrismaClient();
const parser = new Parser();
const queuedSourceIds: string[] = [];
const queuedSourceIdSet = new Set<string>();
let isProcessing = false;

type IngestBody = {
  sourceId?: string;
};

type ExtractedPost = {
  title: string;
  content: string;
  originalUrl: string;
  publishedAt: Date;
};

function parseDate(value: unknown): Date {
  if (typeof value !== "string" || value.trim() === "") {
    return new Date();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function resolveUrl(value: unknown, baseUrl: string, fallback: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return fallback;
  }
}

function getItemContent(item: Record<string, unknown>): string {
  const contentEncoded = item["content:encoded"];
  const content = item.content;
  const summary = item.summary;
  const contentSnippet = item.contentSnippet;

  for (const value of [contentEncoded, content, summary, contentSnippet]) {
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return "";
}

async function extractRssPosts(
  source: Source,
  body: string
): Promise<ExtractedPost[] | null> {
  try {
    const feed = await parser.parseString(body);

    if (!feed.items.length) {
      return null;
    }

    return feed.items.map((item, index) => {
      const looseItem = item as Record<string, unknown>;
      const fallbackUrl = `${source.url}#post-${index + 1}`;
      const originalUrl = resolveUrl(item.link ?? item.guid, source.url, fallbackUrl);

      return {
        title: item.title?.trim() || "Untitled post",
        content: getItemContent(looseItem),
        originalUrl,
        publishedAt: parseDate(item.isoDate ?? item.pubDate)
      };
    });
  } catch {
    return null;
  }
}

function extractHtmlPost(source: Source, body: string): ExtractedPost[] {
  const dom = new JSDOM(body, {
    url: source.url
  });
  const article = new Readability(dom.window.document).parse();
  const title =
    article?.title?.trim() ||
    dom.window.document.querySelector("title")?.textContent?.trim() ||
    source.title;
  const content =
    article?.content?.trim() ||
    dom.window.document.querySelector("body")?.innerHTML.trim() ||
    body;

  return [
    {
      title,
      content,
      originalUrl: source.url,
      publishedAt: new Date()
    }
  ];
}

async function extractPosts(source: Source): Promise<ExtractedPost[]> {
  const response = await fetch(source.url, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, text/xml, text/html;q=0.9"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed with HTTP ${response.status}`);
  }

  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const looksLikeXml =
    contentType.includes("xml") ||
    contentType.includes("rss") ||
    body.trimStart().startsWith("<?xml") ||
    body.includes("<rss") ||
    body.includes("<feed");

  if (looksLikeXml) {
    const rssPosts = await extractRssPosts(source, body);

    if (rssPosts) {
      return rssPosts;
    }
  }

  return extractHtmlPost(source, body);
}

async function savePosts(sourceId: string, posts: ExtractedPost[]) {
  for (const post of posts) {
    await prisma.post.upsert({
      where: {
        originalUrl: post.originalUrl
      },
      update: {
        title: post.title,
        content: post.content,
        publishedAt: post.publishedAt
      },
      create: {
        sourceId,
        title: post.title,
        content: post.content,
        originalUrl: post.originalUrl,
        publishedAt: post.publishedAt
      }
    });
  }
}

async function ingestSource(sourceId: string) {
  const source = await prisma.source.findUnique({
    where: {
      id: sourceId
    }
  });

  if (!source) {
    app.log.warn({ sourceId }, "Source not found for ingestion.");
    return;
  }

  const posts = await extractPosts(source);
  await savePosts(source.id, posts);
  app.log.info({ sourceId, postCount: posts.length }, "Source ingestion complete.");
}

async function processQueue() {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    while (queuedSourceIds.length > 0) {
      const sourceId = queuedSourceIds.shift();

      if (!sourceId) {
        continue;
      }

      queuedSourceIdSet.delete(sourceId);

      try {
        await ingestSource(sourceId);
      } catch (error) {
        app.log.error({ error, sourceId }, "Source ingestion failed.");
      }
    }
  } finally {
    isProcessing = false;
  }
}

function enqueueSource(sourceId: string) {
  if (queuedSourceIdSet.has(sourceId)) {
    return false;
  }

  queuedSourceIds.push(sourceId);
  queuedSourceIdSet.add(sourceId);
  void processQueue();
  return true;
}

app.get("/health", async (): Promise<HealthResponse> => ({
  status: "ok",
  service: "worker",
  timestamp: new Date().toISOString()
}));

app.post<{ Body: IngestBody }>("/ingest", async (request, reply) => {
  const sourceId = request.body?.sourceId?.trim();

  if (!sourceId) {
    return reply.status(400).send({ message: "A source id is required." });
  }

  const queued = enqueueSource(sourceId);

  return reply.status(202).send({
    status: queued ? "queued" : "already_queued",
    sourceId
  });
});

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
