// Vercel serverless entry point. The actual Express app is built by
// `pnpm --filter @workspace/api-server run build` (part of the root `build`
// script) into artifacts/api-server/dist/vercel.mjs — this file just
// re-exports it so Vercel routes every /api/* request into it.
// @ts-expect-error — dist/vercel.mjs is a build artifact with no .d.ts; it's produced correctly, just untyped.
export { default } from "../artifacts/api-server/dist/vercel.mjs";
