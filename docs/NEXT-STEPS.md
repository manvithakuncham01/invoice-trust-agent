# Continue development

1. ITA-03: implement seller invoice form, POST /api/invoices, Decimal validation and immutable version-1 storage. No PayPal call in this story.
2. ITA-04: add persisted seller chat, provider adapter, schema-validated questions and unapplied proposed changes.
3. ITA-05: add server-only OAuth and PayPal draft creation using the approved version.

For parallel development: Developer A can start ITA-03/04. Developer B can build case-scoped evidence/extraction (ITA-06) and curated retrieval (ITA-07) using explicit mock case IDs until invoice persistence is available. Keep authorization boundaries in all endpoints.

Python/FastAPI backend; Vue/JavaScript frontend. SQLite is the zero-install local starter database. PostgreSQL/pgvector and private object storage are later integration changes, not present services in this scaffold.
