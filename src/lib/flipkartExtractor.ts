export interface FlipkartProduct {
  name: string;
  imageUrl: string | null;
  quantity: number;
  price: number | null;
  seller: string | null;
  deliveryEstimate: string | null;
}

export interface FlipkartOrderExtraction {
  orderId: string | null;
  orderDate: string | null;
  amountPaid: number | null;
  products: FlipkartProduct[];
}

const decodeHtml = (value: string): string => value
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const textFromHtml = (html: string): string => decodeHtml(
  html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
).replace(/[\t\r\n ]+/g, ' ').trim();

const normalizeDate = (value: string): string | null => {
  const parsed = new Date(value.replace(/\b(on|by)\b/i, '').trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

/** Extracts product-level data from Flipkart order-confirmation HTML.
 * Each product is read from its own table row containing a Flipkart CDN image.
 */
export function extractFlipkartOrder(html: string): FlipkartOrderExtraction {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const products: FlipkartProduct[] = [];

  for (const row of rows) {
    const image = row.match(/<img\b[^>]*src=["'](https?:\/\/img\.fkcdn\.com\/[^"']+)["'][^>]*>/i);
    if (!image) continue;
    const imgTag = image[0];
    const alt = imgTag.match(/\balt=["']([^"']+)["']/i)?.[1] || '';
    const text = textFromHtml(row);
    const name = textFromHtml(alt) || text.split(/\s+(?:Rs\.?\s*[\d,]+|Delivery)\b/i)[0].trim();
    if (!name || /flipkart|supercoins|journey/i.test(name)) continue;

    const priceMatch = text.match(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i);
    const price = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : null;
    const seller = text.match(/Seller:\s*(.+?)(?=\s+Qty:|$)/i)?.[1]?.trim() || null;
    const quantity = Number(text.match(/Qty:\s*(\d+)/i)?.[1] || 1);
    const deliveryEstimate = text.match(/Delivery\s+(?:by|on)\s+(.+?)(?=\s+Seller:|\s+Qty:|$)/i)?.[1]?.trim() || null;

    products.push({
      name,
      imageUrl: image[1],
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      price: price !== null && Number.isFinite(price) ? price : null,
      seller,
      deliveryEstimate,
    });
  }

  const allText = textFromHtml(html);
  const orderId = allText.match(/\bOD\d{15,20}\b/i)?.[0] || null;
  const orderDateText = allText.match(/Order placed on\s+(.+?)(?=\s+Order ID|\s+Amount Paid|$)/i)?.[1] || '';
  const amountText = allText.match(/Amount Paid\s+(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const amountPaid = amountText ? Number(amountText[1].replace(/,/g, '')) : null;

  return {
    orderId,
    orderDate: orderDateText ? normalizeDate(orderDateText) : null,
    amountPaid: amountPaid !== null && Number.isFinite(amountPaid) ? amountPaid : null,
    products,
  };
}
