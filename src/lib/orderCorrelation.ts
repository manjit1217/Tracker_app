import { GmailOrderRaw } from '../data/gmailOrders';

const statusPriority = (status: string): number => {
  const value = (status || '').toLowerCase();
  if (value.includes('refund success')) return 7;
  if (value.includes('pending refund')) return 6;
  if (value.includes('returned')) return 5;
  if (value.includes('delivered')) return 4;
  if (value.includes('out for delivery')) return 3;
  if (value.includes('shipped') || value.includes('transit')) return 2;
  if (value.includes('pending')) return 1;
  return 0;
};

export const isStableMarketplaceOrderId = (
  platform: string,
  orderId: string | null | undefined
): boolean => {
  if (!orderId) return false;
  const id = orderId.trim();
  if (!id || /^(missing|gml|trk)-/i.test(id)) return false;
  if (platform === 'Amazon') return /^\d{3}-\d{7}-\d{7}$/.test(id);
  if (platform === 'Flipkart') return /^OD[A-Z0-9]{10,}$/i.test(id);
  if (platform === 'Myntra') return /^\d{5,}-\d{5,}-\d{5,}$/.test(id);
  if (platform === 'AJIO') return /^[A-Z]{1,4}\d{6,}$/i.test(id);
  return false;
};

const cleanNames = (value: string): string[] =>
  value.split(';')
    .map(item => item.replace(/\s+/g, ' ').trim())
    .filter(item =>
      item.length >= 8 &&
      item.length <= 220 &&
      !/^(amazon|your order|order details|view order|track package|delivery update|invoice|payment|what got you here\b.*)$/i.test(item)
    );

/** Correlate lifecycle emails only when a marketplace-specific order ID is valid. */
export const correlateGmailOrderEvents = (events: GmailOrderRaw[]): GmailOrderRaw[] => {
  const orders: GmailOrderRaw[] = [];
  const indexByKey = new Map<string, number>();
  const seenMessageOrders = new Set<string>();

  for (const event of events) {
    const stable = isStableMarketplaceOrderId(event.platform, event.order_id);
    // A single Amazon digest can contain several distinct order IDs. Deduplicate
    // repeated copies of the same message/order pair, not the entire message.
    const messageKey = event.gmail_message_id
      ? `${event.gmail_message_id}:${stable ? `${event.platform.toLowerCase()}:${event.order_id!.trim()}` : 'no-stable-order'}`
      : '';
    if (messageKey && seenMessageOrders.has(messageKey)) continue;
    if (messageKey) seenMessageOrders.add(messageKey);
    const key = stable ? `${event.platform.toLowerCase()}:${event.order_id!.trim()}` : '';
    const index = key ? indexByKey.get(key) : undefined;

    if (index === undefined) {
      orders.push({ ...event, product_name: cleanNames(event.product_name || '').join('; ') });
      if (key) indexByKey.set(key, orders.length - 1);
      continue;
    }

    const current = orders[index];
    current.product_name = Array.from(new Set([
      ...cleanNames(current.product_name || ''),
      ...cleanNames(event.product_name || ''),
    ])).join('; ');
    current.product_image_url = Array.from(new Set([
      ...(current.product_image_url || '').split(';').filter(Boolean),
      ...(event.product_image_url || '').split(';').filter(Boolean),
    ])).join('; ');

    if (!current.product_url && event.product_url) current.product_url = event.product_url;
    if (!current.price && event.price) current.price = event.price;
    if (!current.invoice_url && event.invoice_url) current.invoice_url = event.invoice_url;
    if (!current.return_id && event.return_id) current.return_id = event.return_id;
    if (!current.return_date && event.return_date) current.return_date = event.return_date;
    if (!current.delivery_date && event.delivery_date) current.delivery_date = event.delivery_date;
    if (!current.expected_delivery_date && event.expected_delivery_date) current.expected_delivery_date = event.expected_delivery_date;
    if (!current.return_by_date && event.return_by_date) current.return_by_date = event.return_by_date;
    if (current.return_window_days == null && event.return_window_days != null) current.return_window_days = event.return_window_days;
    if (current.is_returnable == null && event.is_returnable != null) current.is_returnable = event.is_returnable;
    if (!current.return_policy_text && event.return_policy_text) current.return_policy_text = event.return_policy_text;
    if (!current.order_date && event.order_date) current.order_date = event.order_date;
    if (!current.return_id && event.return_id) current.return_id = event.return_id;
    if (!current.return_date && event.return_date) current.return_date = event.return_date;
    if (!current.invoice_url && event.invoice_url) current.invoice_url = event.invoice_url;
    if (!current.product_url && event.product_url) current.product_url = event.product_url;
    if (!current.price && event.price) current.price = event.price;
    if ((!current.products || current.products.length === 0) && event.products?.length) current.products = event.products;
    if (!current.product_image_url && event.product_image_url) current.product_image_url = event.product_image_url;
    if (!current.email_received_at && event.email_received_at) current.email_received_at = event.email_received_at;

    if (statusPriority(event.status) > statusPriority(current.status)) {
      current.status = event.status;
      current.email_subject = event.email_subject;
      current.gmail_message_id = event.gmail_message_id;
      current.event_type = event.event_type;
    }
  }

  return orders;
};
