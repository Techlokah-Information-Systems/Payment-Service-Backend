import winston from "winston";
import { ENVIRONMENT } from "./constants";

const logger = winston.createLogger({
  level: ENVIRONMENT === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: "payment-service" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// In production, add file transport for error logs
if (ENVIRONMENT === "production") {
  logger.add(
    new winston.transports.File({
      filename: "error.log",
      level: "error",
      format: winston.format.json(),
    })
  );
}

export { logger };
