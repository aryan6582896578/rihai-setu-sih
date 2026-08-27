import { Router, type Request, type Response } from "express";
import { getCertificateVerification } from "../services/certificates.service.js";
import { asyncHandler, ApiError } from "../middleware/errors.js";

export const verifyRouter = Router();

verifyRouter.get(
  "/certificate/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id ?? "";
    const cert = await getCertificateVerification(id);
    if (!cert) {
      throw ApiError.notFound("Certificate not found or unverified");
    }
    res.json({ data: cert });
  }),
);
