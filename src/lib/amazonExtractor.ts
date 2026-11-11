export interface AmazonEmailExtraction { orderId: string | null; productNames: string[]; productUrls: string[]; productImageUrls: string[]; orderTotal: string | null; }
export function extractAmazonEmail(html: string): AmazonEmailExtraction {
  const result: AmazonEmailExtraction = { orderId: null, productNames: [], productUrls: [], productImageUrls: [], orderTotal: null };
  if (!html || typeof DOMParser === 'undefined') return result;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = (doc.body?.innerText || doc.body?.textContent || '').replace(/\\s+/g, ' ').trim();
  result.orderId = text.match(/\\b\\d{3}-\\d{7}-\\d{7}\\b/)?.[0] || null;
  const useful = (value: string) => { const name=value.replace(/\\s+/g,' ').trim(); return name.length>=8 && name.length<=220 && !/^(amazon|your order|order details|view order|track package|delivery update|invoice|payment|shop now|learn more)$/i.test(name); };
  for (const link of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href=link.getAttribute('href')||''; if(!/(?:\\/dp\\/|\\/gp\\/product\\/)[A-Z0-9]{8,}/i.test(href))continue;
    const image=link.querySelector('img'); const name=(link.innerText||link.textContent||image?.getAttribute('alt')||'').replace(/\\s+/g,' ').trim();
    if(useful(name))result.productNames.push(name); if(/^https?:\\/\\//i.test(href))result.productUrls.push(href); if(image?.src&&/^https?:\\/\\//i.test(image.src))result.productImageUrls.push(image.src);
  }
  if(!result.productNames.length){for(const link of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))){if(!/(?:\\/dp\\/|\\/gp\\/product\\/)[A-Z0-9]{8,}/i.test(link.getAttribute('href')||''))continue;let node:HTMLElement|null=link;for(let depth=0;depth<4&&node;depth++,node=node.parentElement){const candidate=(node.innerText||'').replace(/\\s+/g,' ').trim();if(useful(candidate)){result.productNames.push(candidate);break;}}}}
  const total=text.match(/(?:order total|grand total|total amount|amount charged|total for this order)\\s*[:：]?\\s*(?:₹|Rs\\.?|INR)\\s*([\\d,]+(?:\\.\\d{1,2})?)/i);
  if(total)result.orderTotal='₹'+total[1].replace(/,/g,'');
  result.productNames=Array.from(new Set(result.productNames));result.productUrls=Array.from(new Set(result.productUrls));result.productImageUrls=Array.from(new Set(result.productImageUrls));return result;
}