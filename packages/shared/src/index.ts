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
