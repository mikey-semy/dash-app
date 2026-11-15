export function config(env) {
  return {
    PUBLIC_URL: "https://files.example.com",
    S3_ENDPOINT: "https://storage.yandexcloud.net",
    S3_REGION: "ru-central1",
    S3_BUCKET: "example-bucket",
    S3_PREFIX: "holder/",
    ...env,
  };
}
