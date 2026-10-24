import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import activitiesRouter from "./activities";
import connectionsRouter from "./connections";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(activitiesRouter);
router.use(connectionsRouter);

export default router;
