export type HealthResponse = {
  status: "ok";
  service: "backend" | "worker";
  timestamp: string;
};

export type SourceDto = {
  id: string;
  url: string;
  title: string;
  createdAt: string;
};

export type TagDto = {
  id: string;
  name: string;
};

export type PostSummaryDto = {
  id: string;
  sourceId: string;
  title: string;
  originalUrl: string;
  publishedAt: string;
  tags: TagDto[];
};

export type PostDto = PostSummaryDto & {
  content: string;
};

export type ExportedPostDto = PostDto & {
  sourceTitle: string;
  exportedAt: string;
};

export type SourceExportDto = SourceDto & {
  exportedAt: string;
  posts: PostDto[];
};
