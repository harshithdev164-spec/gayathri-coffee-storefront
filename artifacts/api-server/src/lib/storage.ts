import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const requiredEnv = ["AWS_ENDPOINT_URL_S3", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "PRODUCT_IMAGES_BUCKET"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`${key} must be set.`);
  }
}

const bucket = process.env.PRODUCT_IMAGES_BUCKET as string;
const endpoint = process.env.AWS_ENDPOINT_URL_S3 as string;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
  forcePathStyle: true,
});

export async function presignProductImageUpload(filename: string, contentType: string) {
  const safeExt = filename.includes(".") ? filename.split(".").pop()!.toLowerCase().slice(0, 10) : "bin";
  const objectKey = `products/${randomUUID()}.${safeExt}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType }),
    { expiresIn: 300 },
  );

  return {
    uploadUrl,
    objectKey,
    publicUrl: `${endpoint}/${bucket}/${objectKey}`,
  };
}

export function publicUrlForObjectKey(objectKey: string): string {
  return `${endpoint}/${bucket}/${objectKey}`;
}
