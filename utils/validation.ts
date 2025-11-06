import { AnyZodObject, ZodSchema } from "zod/v3";
import { Request, Response, NextFunction } from "express";

const validate =
  (schema: AnyZodObject) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: result.error.flatten() });
    }
    next();
  };

export default validate;
