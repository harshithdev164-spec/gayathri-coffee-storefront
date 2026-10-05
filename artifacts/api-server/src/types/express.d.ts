import "express";
import "http";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}
