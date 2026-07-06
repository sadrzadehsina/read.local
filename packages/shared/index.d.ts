export type HealthResponse = {
  status: "ok";
  service: "backend" | "worker";
  timestamp: string;
};
