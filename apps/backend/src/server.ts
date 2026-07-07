import Fastify from "fastify";
import {
  Prisma,
  PrismaClient,
  type Post,
  type PostTag,
  type Source,
  type Tag
} from "@prisma/client";
import type {
  HealthResponse,
  PostDto,
  PostSummaryDto,
  SourceExportDto,
  SourceDto,
  TagDto
} from "@readlocal/shared";

const app = Fastify({
  logger: true
});

const prisma = new PrismaClient();

type CreateSourceBody = {
  url?: string;
};

type CreateTagBody = {
  name?: string;
};

const workerBaseUrl = process.env.WORKER_BASE_URL;

type PostWithTags = Post & {
  tags: Array<PostTag & { tag: Tag }>;
};

type PostWithTagsAndSource = PostWithTags & {
  source: Source;
};

type SourceWithPosts = Source & {
  posts: PostWithTags[];
};

function toSourceDto(source: Source): SourceDto {
  return {
    id: source.id,
    url: source.url,
    title: source.title,
    createdAt: source.createdAt.toISOString()
  };
}

function toTagDto(tag: Tag): TagDto {
  return {
    id: tag.id,
    name: tag.name
  };
}

function toPostTagsDto(post: PostWithTags): TagDto[] {
  return post.tags
    .map((postTag) => toTagDto(postTag.tag))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function toPostSummaryDto(post: PostWithTags): PostSummaryDto {
  return {
    id: post.id,
    sourceId: post.sourceId,
    title: post.title,
    originalUrl: post.originalUrl,
    publishedAt: post.publishedAt.toISOString(),
    tags: toPostTagsDto(post)
  };
}

function toPostDto(post: PostWithTags): PostDto {
  return {
    ...toPostSummaryDto(post),
    content: post.content
  };
}

function toSourceExportDto(source: SourceWithPosts): SourceExportDto {
  return {
    ...toSourceDto(source),
    exportedAt: new Date().toISOString(),
    posts: source.posts.map(toPostDto)
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugifyFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "export";
}

function renderPostHtml(post: PostWithTagsAndSource): string {
  const tags = toPostTagsDto(post).map((tag) => tag.name).join(", ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(post.title)}</title>
  <style>
    body { color: #1f2933; font-family: Georgia, "Times New Roman", serif; line-height: 1.7; margin: 2rem auto; max-width: 760px; padding: 0 1rem; }
    header { border-bottom: 1px solid #d8dee4; font-family: ui-sans-serif, system-ui, sans-serif; margin-bottom: 2rem; padding-bottom: 1rem; }
    h1 { font-family: Georgia, "Times New Roman", serif; line-height: 1.1; }
    a { color: #256f91; }
    img, video { height: auto; max-width: 100%; }
    pre { overflow-x: auto; }
    .meta { color: #667085; font-size: 0.9rem; }
  </style>
</head>
<body>
  <header>
    <p class="meta">${escapeHtml(post.source.title)}</p>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="meta">Published ${escapeHtml(post.publishedAt.toISOString())}</p>
    <p><a href="${escapeHtml(post.originalUrl)}">Open original</a></p>
    ${tags ? `<p class="meta">Tags: ${escapeHtml(tags)}</p>` : ""}
  </header>
  <main>
${sanitizeExportHtml(post.content)}
  </main>
</body>
</html>`;
}

function sanitizeExportHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(
      /<\/?(iframe|object|embed|form|input|button|textarea|select|link|meta|base|svg|math)[^>]*>/gi,
      ""
    )
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+srcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+href\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, "")
    .replace(/\s+src\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, "");
}

function decodeHtmlEntities(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    gt: ">",
    lt: "<",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();

    if (normalized.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    }

    if (normalized.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    }

    return entities[normalized] ?? match;
  });
}

function htmlToMarkdown(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "\n> $1\n")
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
      .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function renderPostMarkdown(post: PostWithTagsAndSource): string {
  const tags = toPostTagsDto(post).map((tag) => tag.name);
  const metadata = [
    `# ${post.title}`,
    "",
    `Source: ${post.source.title}`,
    `Published: ${post.publishedAt.toISOString()}`,
    `Original: ${post.originalUrl}`,
    tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
    "",
    "---",
    ""
  ].filter((line): line is string => line !== null);

  return `${metadata.join("\n")}${htmlToMarkdown(post.content)}\n`;
}

function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

async function enqueueSourceIngestion(sourceId: string) {
  if (!workerBaseUrl) {
    app.log.warn("WORKER_BASE_URL is not set; skipping ingestion enqueue.");
    return;
  }

  try {
    const response = await fetch(`${workerBaseUrl}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sourceId })
    });

    if (!response.ok) {
      app.log.warn(
        { sourceId, status: response.status },
        "Worker refused ingestion enqueue."
      );
    }
  } catch (error) {
    app.log.warn({ error, sourceId }, "Unable to enqueue source ingestion.");
  }
}

function getTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Untitled source";
  }
}

app.get("/health", async (): Promise<HealthResponse> => ({
  status: "ok",
  service: "backend",
  timestamp: new Date().toISOString()
}));

app.get("/sources", async (): Promise<SourceDto[]> => {
  const sources = await prisma.source.findMany({
    orderBy: {
      createdAt: "desc"
    }
  });

  return sources.map(toSourceDto);
});

app.get<{ Params: { id: string }; Querystring: { tagId?: string } }>(
  "/sources/:id/posts",
  async (request): Promise<PostSummaryDto[]> => {
    const posts = await prisma.post.findMany({
      where: {
        sourceId: request.params.id,
        ...(request.query.tagId
          ? {
              tags: {
                some: {
                  tagId: request.query.tagId
                }
              }
            }
          : {})
      },
      include: {
        tags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: {
        publishedAt: "desc"
      }
    });

    return posts.map(toPostSummaryDto);
  }
);

app.get<{ Params: { id: string } }>("/posts/:id", async (request, reply) => {
  const post = await prisma.post.findUnique({
    where: {
      id: request.params.id
    },
    include: {
      tags: {
        include: {
          tag: true
        }
      }
    }
  });

  if (!post) {
    return reply.status(404).send({ message: "Post not found." });
  }

  return toPostDto(post);
});

app.get<{
  Params: { id: string };
  Querystring: { format?: "html" | "markdown" };
}>("/posts/:id/export", async (request, reply) => {
  const format = request.query.format ?? "html";

  if (format !== "html" && format !== "markdown") {
    return reply
      .status(400)
      .send({ message: "Export format must be html or markdown." });
  }

  const post = await prisma.post.findUnique({
    where: {
      id: request.params.id
    },
    include: {
      source: true,
      tags: {
        include: {
          tag: true
        }
      }
    }
  });

  if (!post) {
    return reply.status(404).send({ message: "Post not found." });
  }

  const filename = slugifyFilename(post.title);

  if (format === "markdown") {
    return reply
      .header("Content-Type", "text/markdown; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}.md"`)
      .send(renderPostMarkdown(post));
  }

  return reply
    .header("Content-Type", "text/html; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${filename}.html"`)
    .send(renderPostHtml(post));
});

app.get<{ Params: { id: string } }>("/sources/:id/export", async (request, reply) => {
  const source = await prisma.source.findUnique({
    where: {
      id: request.params.id
    },
    include: {
      posts: {
        include: {
          tags: {
            include: {
              tag: true
            }
          }
        },
        orderBy: {
          publishedAt: "desc"
        }
      }
    }
  });

  if (!source) {
    return reply.status(404).send({ message: "Source not found." });
  }

  return reply
    .header("Content-Type", "application/json; charset=utf-8")
    .header(
      "Content-Disposition",
      `attachment; filename="${slugifyFilename(source.title)}.json"`
    )
    .send(toSourceExportDto(source));
});

app.get("/tags", async (): Promise<TagDto[]> => {
  const tags = await prisma.tag.findMany({
    orderBy: {
      name: "asc"
    }
  });

  return tags.map(toTagDto);
});

app.post<{ Params: { id: string }; Body: CreateTagBody }>(
  "/posts/:id/tags",
  async (request, reply) => {
    const name = normalizeTagName(request.body?.name ?? "");

    if (!name) {
      return reply.status(400).send({ message: "A tag name is required." });
    }

    const post = await prisma.post.findUnique({
      where: {
        id: request.params.id
      },
      select: {
        id: true
      }
    });

    if (!post) {
      return reply.status(404).send({ message: "Post not found." });
    }

    const tag = await prisma.tag.upsert({
      where: {
        name
      },
      update: {},
      create: {
        name
      }
    });

    await prisma.postTag.upsert({
      where: {
        postId_tagId: {
          postId: post.id,
          tagId: tag.id
        }
      },
      update: {},
      create: {
        postId: post.id,
        tagId: tag.id
      }
    });

    return reply.status(201).send(toTagDto(tag));
  }
);

app.delete<{ Params: { id: string; tagId: string } }>(
  "/posts/:id/tags/:tagId",
  async (request, reply) => {
    await prisma.postTag
      .delete({
        where: {
          postId_tagId: {
            postId: request.params.id,
            tagId: request.params.tagId
          }
        }
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return null;
        }

        throw error;
      });

    return reply.status(204).send();
  }
);

app.post<{ Body: CreateSourceBody }>("/sources", async (request, reply) => {
  const rawUrl = request.body?.url?.trim();

  if (!rawUrl) {
    return reply.status(400).send({ message: "A source URL is required." });
  }

  let url: string;

  try {
    url = new URL(rawUrl).toString();
  } catch {
    return reply.status(400).send({ message: "Enter a valid URL." });
  }

  try {
    const source = await prisma.source.create({
      data: {
        url,
        title: getTitleFromUrl(url)
      }
    });

    await enqueueSourceIngestion(source.id);

    return reply.status(201).send(toSourceDto(source));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return reply.status(409).send({ message: "That source already exists." });
    }

    throw error;
  }
});

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
