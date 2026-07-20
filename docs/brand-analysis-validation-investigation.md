# Brand-analysis validation investigation

The production failure reported on July 20, 2026 was reproduced from the persisted `website_analyses` failure records. The rejected structured response exceeded the application boundary for `brandColors`: the model returned more than eight colors, while the Zod schema permits a maximum of eight. The JSON Schema sent to the model required hex formatting but did not previously specify `maxItems`, so strict structured output did not protect this application-level limit.

Production logs from the same period also contained repeated upstream HTTP 412 retries. A live, customer-data-free structured-output probe against the current built-in model endpoint confirmed that `gpt-5.5` and JSON Schema responses were available and returned HTTP 200 at investigation time. The direct probe used the built-in Forge endpoint and a minimal one-field strict JSON schema.

The remediation adds `maxItems` and string bounds to the provider JSON Schema, normalizes and deduplicates arrays before final Zod validation, converts three-digit colors to six digits, trims and bounds strings, clamps confidence scores, and performs one fresh structured-output repair attempt only when parsing or final validation remains unrecoverable. Sanitized data must still pass the strict application Zod schema before persistence.
