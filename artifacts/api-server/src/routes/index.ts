import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminAuthRouter from "./admin/auth";
import productsRouter from "./products";
import adminProductsRouter from "./admin/products";
import settingsRouter from "./settings";
import adminSettingsRouter from "./admin/settings";
import ordersRouter from "./orders";
import adminOrdersRouter from "./admin/orders";
import paymentRouter from "./payment";
import adminStatsRouter from "./admin/stats";
import adminPackingRecipientsRouter from "./admin/packing-recipients";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminAuthRouter);
router.use(productsRouter);
router.use(settingsRouter);
router.use(ordersRouter);
router.use(paymentRouter);
router.use(webhooksRouter);

// These routers gate themselves with `requireAdmin` — mounting them under an
// explicit /admin prefix (instead of bare `.use(...)`) ensures that gate only
// ever runs for requests actually under /admin, not for every request that
// falls through to this point in the stack.
router.use("/admin", adminProductsRouter);
router.use("/admin", adminSettingsRouter);
router.use("/admin", adminOrdersRouter);
router.use("/admin", adminStatsRouter);
router.use("/admin", adminPackingRecipientsRouter);

export default router;
