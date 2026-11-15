Настройки применяются администратором к **новому отдельному приватному бакету**. Сначала замените домен, BUCKET и SERVICE_ACCOUNT_ID в JSON. Не применяйте эти команды к бакету других приложений: они заменяют соответствующую конфигурацию.

```sh
aws --endpoint-url https://storage.yandexcloud.net s3api put-bucket-cors --bucket YOUR_BUCKET --cors-configuration file://deploy/cors.json
aws --endpoint-url https://storage.yandexcloud.net s3api put-bucket-lifecycle-configuration --bucket YOUR_BUCKET --lifecycle-configuration file://deploy/lifecycle.json
aws --endpoint-url https://storage.yandexcloud.net s3api put-bucket-policy --bucket YOUR_BUCKET --policy file://deploy/bucket-policy.json
```

AWS CLI должен быть заранее авторизован административным аккаунтом; административные ключи приложению не передавайте. Приложению нужны только статические ключи отдельного сервисного аккаунта с операциями из policy. Убедитесь, что аккаунт не наследует широкие роли на каталог/облако, а бакет не разрешает публичное чтение/запись. Versioning и Object Lock должны быть выключены, иначе подтверждённое удаление текущего объекта не гарантирует освобождение физического места.

После настройки проверьте прямую загрузку из браузера, HEAD/Range через backend, удаление и отсутствие незавершённых multipart после отмены. Lifecycle через сутки страхует аварийные multipart, но не заменяет ежеминутную уборку приложения.

Официальные инструкции: [CORS](https://yandex.cloud/en/docs/storage/operations/buckets/cors), [bucket policy](https://yandex.cloud/en/docs/storage/operations/buckets/policy), [разрешения S3](https://yandex.cloud/en/docs/storage/s3/api-ref/policy/actions), [lifecycle](https://yandex.cloud/en/docs/storage/operations/buckets/lifecycles).
