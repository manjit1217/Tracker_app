export interface AmazonEmailExtraction {
  orderId: string | null;
  productNames: string[];
  productUrls: string[];
  productImageUrls: string[];
  orderTotal: string | null;
}

/** Extract an Amazon order number from visible email text. */
export function extractAmazonOrderId(value: string): string | null {
  return value.match(/\b\d{3}-\d{7}-\d{7}\b/)?.[0] ?? null;
}

/** Extract a labelled order total; never treat an arbitrary item price as the order total. */
export function extractAmazonOrderTotal(value: string): string | null {
  const match = value.match(
    /(?:order total|grand total|total amount|amount charged|total for this order)\s*[:：]?\s*(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  return match ? '₹' + match[1].replace(/,/g, '') : null;
}

const normalizeText = (value: string): string =>
  value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

const isUsefulProductName = (value: string): boolean => {
  const name = normalizeText(value);
  return name.length >= 8 &&
    name.length <= 220 &&
    !/^(amazon|your order|order details|view order|track package|delivery update|invoice|payment|shop now|learn more)$/i.test(name);
};

const getAsin = (href: string): string | null =>
  href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i)?.[1] ?? null;

export function extractAmazonEmail(html: string): AmazonEmailExtraction {
  const result: AmazonEmailExtraction = {
    orderId: null,
    productNames: [],
    productUrls: [],
    productImageUrls: [],
    orderTotal: null,
  };

  if (!html || typeof DOMParser === 'undefined') return result;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = normalizeText(doc.body?.innerText || doc.body?.textContent || '');
  result.orderId = extractAmazonOrderId(text);
  result.orderTotal = extractAmazonOrderTotal(text);

  const seenAsins = new Set<string>();
  for (const link of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = link.getAttribute('href') || '';
    const asin = getAsin(href);
    if (!asin || seenAsins.has(asin)) continue;
    seenAsins.add(asin);

    const image = link.querySelector('img') ||
      link.parentElement?.querySelector('img') ||
      link.parentElement?.parentElement?.querySelector('img');
    const candidates = [
      link.innerText || link.textContent || '',
      image?.getAttribute('alt') || '',
      link.parentElement?.innerText || '',
      link.parentElement?.parentElement?.innerText || '',
    ];
    const name = candidates.map(normalizeText).find(isUsefulProductName);

    if (name) result.productNames.push(name);
    try {
      const absoluteUrl = new URL(href, doc.baseURI).toString();
      if (/^https?:$/.test(new URL(absoluteUrl).protocol)) result.productUrls.push(absoluteUrl);
    } catch {
      // Ignore malformed or non-web product links.
    }
    const imageUrl = image?.getAttribute('src') || image?.getAttribute('data-src') || '';
    if (/^https?:\/\//i.test(imageUrl)) result.productImageUrls.push(imageUrl);
  }

  result.productNames = Array.from(new Set(result.productNames));
  result.productUrls = Array.from(new Set(result.productUrls));
  result.productImageUrls = Array.from(new Set(result.productImageUrls));
  return result;
}
