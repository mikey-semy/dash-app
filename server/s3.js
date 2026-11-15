import * as S from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export class Store {
  constructor(env) {
    this.bucket = env.S3_BUCKET;
    this.client = new S.S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION || "ru-central1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      requestHandler: {
        connectionTimeout: 5000,
        requestTimeout: 30000,
        socketTimeout: 30000,
      },
      maxAttempts: 3,
    });
  }
  send(name, args) {
    return this.client.send(
      new S[name + "Command"]({ Bucket: this.bucket, ...args }),
    );
  }
  async create(key) {
    return (
      await this.send("CreateMultipartUpload", {
        Key: key,
        ContentType: "application/octet-stream",
      })
    ).UploadId;
  }
  sign(key, upload, part, size) {
    return getSignedUrl(
      this.client,
      new S.UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: upload,
        PartNumber: part,
        ContentLength: size,
      }),
      { expiresIn: 300 },
    );
  }
  async parts(key, upload) {
    let parts = [],
      marker;
    do {
      const r = await this.send("ListParts", {
        Key: key,
        UploadId: upload,
        PartNumberMarker: marker,
      });
      parts.push(...(r.Parts || []));
      marker = r.IsTruncated ? r.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }
  complete(key, upload, parts) {
    return this.send("CompleteMultipartUpload", {
      Key: key,
      UploadId: upload,
      MultipartUpload: {
        Parts: parts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
      },
    });
  }
  head(key) {
    return this.send("HeadObject", { Key: key });
  }
  get(key, args = {}) {
    return this.send("GetObject", { Key: key, ...args });
  }
  empty(key) {
    return this.send("PutObject", {
      Key: key,
      Body: Buffer.alloc(0),
      ContentLength: 0,
    });
  }
  async remove(key) {
    await this.send("DeleteObject", { Key: key });
  }
  async abort(key, upload) {
    try {
      await this.send("AbortMultipartUpload", { Key: key, UploadId: upload });
    } catch (e) {
      if (e.name !== "NoSuchUpload") throw e;
    }
  }
  async purge(id, keys) {
    let marker, keyMarker;
    do {
      const r = await this.send("ListMultipartUploads", {
        Prefix: id + "/",
        KeyMarker: keyMarker,
        UploadIdMarker: marker,
      });
      for (const u of r.Uploads || []) await this.abort(u.Key, u.UploadId);
      keyMarker = r.IsTruncated ? r.NextKeyMarker : undefined;
      marker = r.IsTruncated ? r.NextUploadIdMarker : undefined;
    } while (keyMarker);
    for (const key of keys) await this.remove(key);
  }
}
