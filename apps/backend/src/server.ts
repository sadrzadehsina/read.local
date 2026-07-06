import Fastify from "fastify";
import { Prisma, PrismaClient, type Source } from "@prisma/client";
import type { HealthResponse, SourceDto } from "@readlocal/shared";

const app = Fastify({
  logger: true
});

const prisma = new PrismaClient();

type CreateSourceBody = {
  url?: string;
};

function toSourceDto(source: Source): SourceDto {
  return {
    id: source.id,
    url: source.url,
    title: source.title,
    createdAt: source.createdAt.toISOString()
  };
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
