# PrimeTrack order ingestion architecture

## Core invariant
An email is evidence about an order; it is not itself an order. One canonical order can have multiple source emails and lifecycle events.

## Pipeline
1. Gmail ingestion records message ID, thread ID and received timestamp.
2. MIME normalization extracts sender, subject, plain text and HTML.
3. Marketplace extractors produce typed candidates and preserve source message IDs.
4. Validation rejects subject-only product guesses, unlabelled amount guesses and synthetic order identifiers.
5. Correlation links events using exact platform + marketplace order ID. Ambiguous events remain unlinked; product-name/date similarity must never merge purchases.
6. Order projection derives current status and items from linked events while preserving original evidence.
7. The UI reads canonical orders, items, returns, invoices and warranties.

## Current deployment boundary
The deployed Vercel application currently performs Gmail OAuth and Gmail API calls in the browser. The repository also contains a separate Python/SQLite Gmail prototype using a local installed-app OAuth flow; it is not wired into the deployed frontend. These are disconnected ingestion paths. Token handling and persistence should move server-side only after a deployment target and server-side OAuth/token-storage design are selected.

## Multi-user-ready persistence target
Every record must be scoped by user_id (or tenant_id):
- email_messages(user_id, gmail_message_id, thread_id, received_at, processed_at, processing_status, error)
- order_events(user_id, platform, order_id, gmail_message_id, event_type, event_at, extracted_payload, confidence)
- orders(user_id, platform, order_id, current_status, order_date, total_amount, currency)
- order_items(order_id, marketplace_item_id, title, quantity, unit_price, product_url, image_url)
- returns(order_id, return_id, status, amount, event_at)
- warranties(order_item_id, duration_months, expiry_date, evidence_message_id)
- invoices(order_id, invoice_number, invoice_url, invoice_date, total_amount)

Unique constraints: (user_id, gmail_message_id) for source messages and (user_id, platform, order_id) for canonical orders. Product name and approximate dates are not unique identifiers.