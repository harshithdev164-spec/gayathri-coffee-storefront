import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

if (!process.env.ADMIN_SESSION_SECRET) {
  throw new Error("ADMIN_SESSION_SECRET must be set.");
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.ADMIN_SESSION_SECRET));

app.use("/api", router);

export default app;
