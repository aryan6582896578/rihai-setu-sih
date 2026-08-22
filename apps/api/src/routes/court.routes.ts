import { Router } from "express";
import { asyncHandler } from "../middleware/errors.js";
import { requireAuth, requireJailAccess } from "../middleware/auth.js";
import { requireAnyOf, EDITOR_ROLES, ADVANCE_ROLES } from "../middleware/roles.js";
import {
  getCourtTracking,
  getUnassignedQueue,
  listAvailableLawyers,
  getSuretyGrantedList,
} from "../services/court.service.js";

export const courtJailRouter = Router({ mergeParams: true });
courtJailRouter.use(requireAuth);

courtJailRouter.get(
  "/court-tracking",
  requireJailAccess,
  asyncHandler(async (req, res) => {
    res.json({ data: await getCourtTracking(req.params.jailId!) });
  }),
);

courtJailRouter.get(
  "/legal-aid/unassigned",
  requireJailAccess,
  asyncHandler(async (req, res) => {
    const [queue, lawyers] = await Promise.all([
      getUnassignedQueue(req.params.jailId!),
      listAvailableLawyers(req.params.jailId!),
    ]);
    res.json({ data: { queue, lawyers } });
  }),
);

courtJailRouter.get(
  "/legal-aid/granted",
  requireJailAccess,
  asyncHandler(async (req, res) => {
    res.json({ data: await getSuretyGrantedList(req.params.jailId!) });
  }),
);

void requireAnyOf;
void EDITOR_ROLES;
void ADVANCE_ROLES;
