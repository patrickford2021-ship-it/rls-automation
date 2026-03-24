import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import rlsRouter from "./rls.js";
import voiceRouter from "./voice.js";
import logsRouter from "./logs.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rlsRouter);
router.use(voiceRouter);
router.use(logsRouter);

export default router;
