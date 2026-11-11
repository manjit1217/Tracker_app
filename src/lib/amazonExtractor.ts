import { isPlausibleProductName } from './productNameValidation';
export interface AmazonOrderExtraction {
  orderId: string;
  productNames: string[];
  productUrls: string[];
  productImageUrls: string[];
  itemTotal: string | null;
  orderTotal: string | null;
}

export interface AmazonEmailExtraction {
  orderId: string | null;
  productNames: string[];
  productUrls: string[];
  productImageUrls: string[];
  orderTotal: string | null;
  orders: AmazonOrderExtraction[];
}

export function extractAmazonOrderId(value: string): string | null {
  return value.match(/\b\d{3}-\d{7}-\d{7}\b/)?.[0] ?? null;
}

export function extractAmazonOrderTotal(value: string): string | null {
  const match = value.match(/(?:order total|grand total|total amount|amount charged|total for this order|total)\s*[:：]?\s*(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i);
  return match ? '₹' + match[1].replace(/,/g, '') : null;
}

const normalizeText = (value: string): string =>
  value.replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\u00a0/g, ' ').replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const money = (value: string): string | null => {
  const match = value.match(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i);
  return match ? '₹' + match[1].replace(/,/g, '') : null;
};

const decodeRedirect = (href: string): string => {
  const match = href.match(/[?&]U=([^&]+)/i);
  if (!match) return href;
  try { return decodeURIComponent(match[1]); } catch { return href; }
};

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

function extractPlainTextOrders(plainText: string): AmazonOrderExtraction[] {
  const matches = [...plainText.matchAll(/\\b\\d{3}-\\d{7}-\\d{7}\\b/g)];
  return matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index || plainText.length) : plainText.length;
    const section = plainText.slice(start, end);
    const lines = section.split(/\\r?\\n/).map(line => line.trim());
    const names: string[] = [];

    // Amazon digest emails mark each product with "*". Product titles can wrap
    // over several physical lines, so collect through the Quantity line.
    for (let i = 0; i < lines.length; i++) {
      if (!/^\\*\\s*/.test(lines[i])) continue;
      const titleParts = [lines[i].replace(/^\\*\\s*/, '')];
      for (let j = i + 1; j < lines.length && !/^Quantity\\s*:/i.test(lines[j]); j++) {
        if (lines[j] && !/^(?:Total|Order #|View or edit order)/i.test(lines[j])) titleParts.push(lines[j]);
      }
      const title = normalizeText(titleParts.join(' '));
      if (isPlausibleProductName(title)) names.push(title);
    }

    const quantityPrice = section.match(/Quantity\\s*:\\s*\\d+\\s*(?:₹|Rs\\.?|INR)?\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:INR)?/i);
    const total = section.match(/\\bTotal\\s*(?:₹|Rs\\.?|INR)?\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*INR?/i);
    return {
      orderId: match[0],
      productNames: unique(names),
      productUrls: [],
      productImageUrls: [],
      itemTotal: quantityPrice ? '₹' + quantityPrice[1].replace(/,/g, '') : null,
      orderTotal: total ? '₹' + total[1].replace(/,/g, '') : null,
    };
  });
}
export function extractAmazonEmail(html: string, plainText = ''): AmazonEmailExtraction {
  const empty: AmazonEmailExtraction = {
    orderId: null, productNames: [], productUrls: [], productImageUrls: [], orderTotal: null, orders: [],
  };
  if (!html) { const orders = extractPlainTextOrders(plainText); const first = orders[0]; return { ...empty, orderId: first?.orderId || null, productNames: unique(orders.flatMap(order => order.productNames)), orderTotal: first?.orderTotal || null, orders }; }

  // Amazon groups each order's address, order number and item rows in a table body.
  // Work per tbody so one digest email can correctly yield several independent orders.
  const blocks = html.match(/<tbody\b[^>]*>[\s\S]*?<\/tbody>/gi) || [];
  const orders: AmazonOrderExtraction[] = [];
  for (const block of blocks) {
    const orderId = extractAmazonOrderId(normalizeText(block));
    if (!orderId) continue;
    const names: string[] = [];
    const urls: string[] = [];
    const images: string[] = [];

    const imageTags = block.match(/<img\b[^>]*>/gi) || [];
    for (const tag of imageTags) {
      const alt = tag.match(/\balt=["']([^"']+)["']/i)?.[1] || '';
      const src = tag.match(/\b(?:src|data-src)=["']([^"']+)["']/i)?.[1] || '';
      const name = normalizeText(alt);
      if (isPlausibleProductName(name) && !/^(amazon|your order|view order)$/i.test(name)) names.push(name);
      if (/^https?:\/\//i.test(src)) images.push(src);
    }

    const anchors = block.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>/gi) || [];
    for (const tag of anchors) {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1] || '';
      const target = decodeRedirect(href);
      if (/^https?:\/\//i.test(target) && /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(target)) urls.push(target);
    }

    const visible = normalizeText(block);
    const itemTotal = money(visible);
    const textBlock = plainText.split(/Order\s*#\s*/i).find(part => part.includes(orderId)) || '';
    const followingText = textBlock.slice(textBlock.indexOf(orderId) + orderId.length);
    const totalMatch = followingText.match(/[\s\S]*?\bTotal\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)\s*INR?/i);
    const orderTotal = totalMatch ? '₹' + totalMatch[1].replace(/,/g, '') : null;

    orders.push({
      orderId,
      productNames: unique(names),
      productUrls: unique(urls),
      productImageUrls: unique(images),
      itemTotal,
      orderTotal,
    });
  }

  if (orders.length === 0 && plainText) orders.push(...extractPlainTextOrders(plainText));
  // If the email uses a different layout, retain the previous single-order extraction
  // rather than inventing an order or product from its subject.
  const uniqueOrders = orders.filter((order, index) => orders.findIndex(item => item.orderId === order.orderId) === index);
  const first = uniqueOrders[0];
  return {
    orderId: first?.orderId || extractAmazonOrderId(normalizeText(html)),
    productNames: unique(uniqueOrders.flatMap(order => order.productNames)),
    productUrls: unique(uniqueOrders.flatMap(order => order.productUrls)),
    productImageUrls: unique(uniqueOrders.flatMap(order => order.productImageUrls)),
    orderTotal: first?.orderTotal || null,
    orders: uniqueOrders,
  };
}
