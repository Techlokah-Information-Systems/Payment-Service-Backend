import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { raw } from "body-parser";
import routes from "./routes/payment";
import { ENVIRONMENT, FRONTEND_URL } from "./utils/constants";

const app = express();

// Trust proxy for ngrok
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: [FRONTEND_URL, "http://localhost:3000"],
  }),
);
app.use(express.json({ limit: "200kb" }));
app.use(morgan(ENVIRONMENT === "production" ? "combined" : "dev"));
app.use(
  "/webhooks/razorpay",
  raw({
    type: "*/*",
    limit: "200kb",
  }),
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use(routes);
app.get("/", (req, res) => {
  res.status(200).json({ message: "Payment Service is running." });
});
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  if (ENVIRONMENT !== "production") {
    console.error(err);
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    error: "internal_server_error",
  });
});

export default app;
