import { Router, type IRouter, type Request, type Response } from "express";
import { getLogs } from "../lib/log-buffer.js";

const router: IRouter = Router();

router.get("/logs", (req: Request, res: Response) => {
  const since = req.query["since"] ? Number(req.query["since"]) : undefined;
  const logs = getLogs(since);
  res.json(logs);
});

export default router;
