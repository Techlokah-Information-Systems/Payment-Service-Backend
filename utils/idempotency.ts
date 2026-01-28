import crypto from "node:crypto";
import prisma from "./db";
import { NextFunction, Request, Response } from "express";

function hashBody(body: any) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(body || {}))
    .digest("hex");
}

export function withIdempotency(scope: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idemKey = (req.header("Idempotency-key") || "").trim();
    if (!idemKey) {
      return res.status(400).json({ error: "missing_idempotency_key" });
    }

    const requestHash = hashBody(req.body);

    try {
      const existing = await prisma.idempotencyKey.findUnique({
        where: {
          scope_idemKey: {
            scope,
            idemKey,
          },
        } as any,
      });

      if (existing) {
        if (existing.requestHash != requestHash) {
          return res.status(409).json({
            error: "idempotency_key_conflict",
            message: "Different Body for same idempotency key",
          });
        }
        return res.status(200).json(existing.response);
      }

      await prisma.idempotencyKey.create({
        data: {
          scope,
          idemKey,
          requestHash,
          response: {},
        },
      });

      (res as any).saveIdempotent = async (responseBody: any) => {
        await prisma.idempotencyKey.update({
          where: { scope_idemKey: { scope, idemKey } as any },
          data: { response: responseBody },
        });
      };
    } catch (error) {
      console.error("Idempotency middleware error:", error);
      return res.status(500).json({ error: "internal_server_error" });
    }
    next();
  };
}
