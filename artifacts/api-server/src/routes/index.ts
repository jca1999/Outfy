import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import activitiesRouter from "./activities";
import connectionsRouter from "./connections";
import followsRouter from "./follows";
import notificationsRouter from "./notifications";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(activitiesRouter);
router.use(connectionsRouter);
router.use(followsRouter);
router.use(notificationsRouter);
router.use(pushRouter);

export default router;
