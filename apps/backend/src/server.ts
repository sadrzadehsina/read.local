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
