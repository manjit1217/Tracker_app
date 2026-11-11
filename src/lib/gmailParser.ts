import { GmailOrderRaw } from '../data/gmailOrders';
import { getWebProductUrl, extractProductUrlFromHtml } from './productUrl';
import { extractAmazonEmail } from './amazonExtractor';
import { extractFlipkartOrder } from './flipkartExtractor';

interface GmailMessageSummary {
  id: string;
  threadId: string;
}

export interface SyncDiagnosticLog {
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
  message: string;
}

export interface ParsedMyntraItem {
  brand: string;
  name: string;
  imageUrl: string;
  size: string;
  qty: number;
  price: string;
  originalPrice: string | null;
  savedPrice: string | null;
  seller: string | null;
}

function decodeBase64Html(data: string): string {
  try {
    let standardBase64 = data.replace(/-/g, '+').replace(/_/g, '/');
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    const binaryString = atob(standardBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (err) {
    console.error('Base64 decode error:', err);
    return '';
  }
}

function collectMimeBodies(payload: any, mimeType: 'text/html' | 'text/plain'): string[] {
  if (!payload) return [];
  const bodies: string[] = [];
  if (payload.mimeType === mimeType && payload.body?.data) {
    const decoded = decodeBase64Html(payload.body.data);
    if (decoded) bodies.push(decoded);
  }
  for (const part of payload.parts || []) bodies.push(...collectMimeBodies(part, mimeType));
  return bodies;
}

function getEmailHtmlBody(payload: any): string {
  return collectMimeBodies(payload, 'text/html').join('\n');
}

function getEmailTextBody(payload: any): string {
  return collectMimeBodies(payload, 'text/plain').join('\n');
}

function normalizeEmailDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value.replace(/(\d)(st|nd|rd|th)\b/gi, '$1'));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function extractDateAfter(text: string, labels: RegExp): string | null {
  const datePattern = '(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}';
  const match = text.match(new RegExp('(?:' + labels.source + ')\\s*(?:is|on|by|until|:|-)?\\s*(' + datePattern + ')', 'i'));
  return normalizeEmailDate(match?.[1]);
}

export function extractAmazonDeliveryEvidence(text: string, status: string) {
  const actualDeliveryDate = status === 'Delivered' ? extractDateAfter(text, /delivered(?:\s+on)?|delivery date/) : null;
  const expectedDeliveryDate = status !== 'Delivered' ? extractDateAfter(text, /expected delivery(?: date)?|arriving(?: on)?|delivery by|will be delivered/) : null;
  const returnByDate = extractDateAfter(text, /return(?: or replacement)?(?: eligible)? until|return by|eligible for return until|return window ends/);
  const returnWindow = text.match(/return(?: or replacement)? within\s+(\d{1,2})\s+days?/i);
  const nonReturnable = /non[- ]returnable|not eligible for (?:return|replacement)/i.test(text);
  const explicitlyReturnable = /eligible for (?:return|replacement)|returnable until|return within\s+\d{1,2}\s+days?/i.test(text);
  return {
    actualDeliveryDate, expectedDeliveryDate, returnByDate,
    returnWindowDays: returnWindow ? Number(returnWindow[1]) : null,
    isReturnable: nonReturnable ? false : explicitlyReturnable ? true : null,
    returnPolicyText: nonReturnable ? 'Email states this item is non-returnable.'
      : returnByDate ? 'Return deadline stated in the email.'
      : returnWindow ? `Email states a \${returnWindow[1]}-day return window.` : null,
  };
}

export function parseMyntraHtml(htmlContent: string): ParsedMyntraItem[] {
  const items: ParsedMyntraItem[] = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const containers = Array.from(doc.querySelectorAll('li')).filter(li => {
      const className = li.className || '';
      return className.includes('productListContainer') || 
             className.includes('productListContainerLastBeforeItem') || 
             className.includes('productListContainerLastItem');
    });
    
    for (const container of containers) {
      const brandEl = container.querySelector('[id*="ItemProductBrandName"]') || container.querySelector('.brandName');
      const brand = brandEl ? brandEl.textContent?.trim() || '' : '';
      
      const nameEl = container.querySelector('[id*="ItemProductName"]') || container.querySelector('.solidGrey');
      let name = nameEl ? nameEl.textContent?.trim() || '' : '';
      name = name.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      
      const imgEl = container.querySelector('img[class*="productListItemImage"]') || container.querySelector('img');
      let imageUrl = '';
      if (imgEl) {
        const src = imgEl.getAttribute('src') || '';
        if (src.includes('#')) {
          imageUrl = src.split('#')[1];
        } else {
          imageUrl = src;
        }
      }
      
      const sizeEl = container.querySelector('[id*="ItemSize"]');
      const size = sizeEl ? sizeEl.textContent?.trim() || '' : '';
      
      const qtyEl = container.querySelector('[id*="ItemQuantity"]');
      const qtyText = qtyEl ? qtyEl.textContent?.trim() || '1' : '1';
      const qty = parseInt(qtyText, 10) || 1;
      
      const totalEl = container.querySelector('[id*="ItemTotal"]');
      const price = totalEl ? totalEl.textContent?.trim() || '' : '';
      
      const origEl = container.querySelector('[id*="ItemPrice"]');
      const originalPrice = origEl ? origEl.textContent?.trim() || null : null;
      
      const discEl = container.querySelector('[id*="ItemDiscount"]');
      const savedPrice = discEl ? discEl.textContent?.trim() || null : null;
      
      const sellerEl = container.querySelector('[id*="ItemSellerName"]') || container.querySelector('.soldBySection');
      let seller = sellerEl ? sellerEl.textContent?.trim() || null : null;
      if (seller && seller.toLowerCase().startsWith('sold by:')) {
        seller = seller.substring(8).trim();
      }
      
      if (brand || name) {
        items.push({
          brand,
          name,
          imageUrl,
          size,
          qty,
          price,
          originalPrice,
          savedPrice,
          seller
        });
      }
    }
  } catch (err) {
    console.error('Error parsing Myntra HTML:', err);
  }
  return items;
}

// Simple cleaner for product name to make it look professional
export const cleanRawProductName = (name: string, _platform?: string, _messageId?: string): string => {
  if (!name) return '';
  let clean = name.replace(/[\"“”']/g, '').replace(/\s+/g, ' ').trim();
  const fromOrder = clean.match(/^(.+?)\s+from your order has been (?:shipped|delivered|dispatched|cancelled)/i);
  const yourOrder = clean.match(/^Your order for\s+(.+?)\s+has been (?:shipped|delivered|dispatched|confirmed)/i);
  if (fromOrder?.[1]) clean = fromOrder[1].trim();
  else if (yourOrder?.[1]) clean = yourOrder[1].trim();
  clean = clean.replace(/^(Your (?:order|package) (?:is|has been) (?:shipped|delivered|confirmed|processed):|Order (?:Confirmed|Shipped|Delivered):|Refund (?:Initiated|Processed|Success):|Return (?:Requested|Received):|Delivery Confirmation:)\s*/i, '');
  clean = clean.replace(/\.?\s*Please share.*$/i, '').replace(/\.?\s*feedback.*/i, '').trim();
  if (/^(what got you here|your amazon|amazon\.in|order update|delivery update|your order|order details|no subject)/i.test(clean)) return '';
  return clean.length > 100 ? clean.slice(0, 97) + '...' : clean;
};

// Map product title to a high-quality, professional, free CDN photo based on keyword categories
export const getProductImageByKeyword = (name: string): string => {
  const lower = name.toLowerCase();
  
  // Specific overrides for user's Myntra/MExpress items in screenshot
  if (lower.includes('chemistry') || (lower.includes('formal') && lower.includes('green') && lower.includes('shirt'))) {
    return 'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=300&q=80'; // Emerald Green top
  }
  if (lower.includes('textured blue') || (lower.includes('levis') && lower.includes('blue') && lower.includes('crew neck'))) {
    return 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=300&q=80'; // Sky blue crew neck
  }
  if (lower.includes('solid slim fit t-shirt') || lower.includes('pink t-shirt') || (lower.includes('levis') && lower.includes('pink'))) {
    return 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=300&q=80'; // Pastel pink t-shirt
  }
  if (lower.includes('vero moda') || lower.includes('floral printed') || lower.includes('floral print')) {
    return 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=300&q=80'; // Bright floral printed apparel
  }
  if (lower.includes('tartan checks') || lower.includes('tartan checked')) {
    return 'https://images.unsplash.com/photo-1589310243389-96a5483213a8?auto=format&fit=crop&w=300&q=80'; // Tartan plaid flannel shirt
  }
  if (lower.includes('ethnic motifs')) {
    return 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=300&q=80'; // Indian ethnic printed shirt
  }
  if (lower.includes('straight jeans') || lower.includes('denim') || lower.includes('jeans')) {
    return 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=300&q=80'; // Blue denim jeans
  }
  if (lower.includes('suede sneakers') || lower.includes('colourblocked') || lower.includes('rare rabbit')) {
    return 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=300&q=80'; // Suede leather sneakers
  }
  
  // Broad category matches
  if (lower.includes('bulb') || lower.includes('led') || lower.includes('lighting') || lower.includes('lamp') || lower.includes('wipro')) {
    return 'https://images.unsplash.com/photo-1550985616-10810253b84d?auto=format&fit=crop&w=300&q=80';
  }
  if (lower.includes('earbuds') || lower.includes('headphones') || lower.includes('earphone') || lower.includes('audio') || lower.includes('soundbar') || lower.includes('speaker') || lower.includes('boat')) {
    return 'https://images.unsplash.com/photo-1608156639585-b3a032ef9689?auto=format&fit=crop&w=300&q=80';
  }
  if (lower.includes('watch') || lower.includes('smartwatch') || lower.includes('band') || lower.includes('fitbit') || lower.includes('noise')) {
    return 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=300&q=80';
  }
  if (lower.includes('phone') || lower.includes('mobile') || lower.includes('iphone') || lower.includes('galaxy') || lower.includes('oneplus') || lower.includes('case') || lower.includes('cover')) {
    return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=300&q=80';
  }
  if (lower.includes('crocs') || lower.includes('clog')) {
    return 'https://images.unsplash.com/photo-1603808033192-082d6919d3e1?auto=format&fit=crop&w=300&q=80';
  }
  if (lower.includes('shoe') || lower.includes('sneaker') || lower.includes('boot') || lower.includes('footwear') || lower.includes('slipper') || lower.includes('nike') || lower.includes('adidas') || lower.includes('puma')) {
    return 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=300&q=80';
  }
  if (lower.includes('shirt') || lower.includes('tshirt') || lower.includes('hoodie') || lower.includes('jacket') || lower.includes('dress') || lower.includes('kurta') || lower.includes('apparel') || lower.includes('clothing') || lower.includes('wear') || lower.includes('top')) {
    return 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=300&q=80';
  }
  if (lower.includes('backpack') || lower.includes('bag') || lower.includes('suitcase') || lower.includes('handbag') || lower.includes('wallet')) {
    return 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=300&q=80';
  }
  if (lower.includes('perfume') || lower.includes('cologne') || lower.includes('scent') || lower.includes('fragrance') || lower.includes('makeup') || lower.includes('cosmetics') || lower.includes('cream')) {
    return 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=300&q=80';
  }
  if (lower.includes('charger') || lower.includes('cable') || lower.includes('adapter') || lower.includes('powerbank') || lower.includes('hub')) {
    return 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=300&q=80';
  }

  return '';
};

export interface GmailFetchOptions {
  query?: string;
  maxResults?: number;
}

export const fetchGmailOrders = async (
  accessToken: string,
  logCallback: (log: SyncDiagnosticLog) => void,
  options: GmailFetchOptions = {}
): Promise<GmailOrderRaw[]> => {
  const addLog = (level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR', message: string) => {
    logCallback({
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    });
  };

  addLog('INFO', 'Initiating Gmail inbox connection over secure OAuth / API bridge...');

  if (!accessToken || accessToken === 'app-password-token' || accessToken.startsWith('simulated-')) throw new Error('A valid Google OAuth access token is required. App Password login is not supported.');

  try {
    // 1. Search for orders, confirmation, delivery, return, refund emails
    const query = options.query?.trim() || 'newer_than:730d {order confirmation placed purchase shipped dispatched delivered arriving "out for delivery" return refund replacement cancelled}';
    addLog('INFO', `Searching user inbox with filter: [${query}]`);
    
    const messages: GmailMessageSummary[] = [];
    let pageToken: string | undefined;
    const maxResults = Math.min(Math.max(Math.floor(options.maxResults || 500), 1), 5000);
    do {
      const params = new URLSearchParams({ q: query, maxResults: '500' });
      if (pageToken) params.set('pageToken', pageToken);
      const searchRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?' + params.toString(), { headers: { Authorization: 'Bearer ' + accessToken } });
      if (!searchRes.ok) throw new Error('Gmail API search failed (' + searchRes.status + '): ' + await searchRes.text());
      const searchData = await searchRes.json();
      messages.push(...(searchData.messages || []).slice(0, Math.max(0, maxResults - messages.length)));
      pageToken = searchData.nextPageToken;
    } while (pageToken && messages.length < maxResults);

    addLog('SUCCESS', `Found ${messages.length} potential transactional emails in your inbox.`);

    if (messages.length === 0) {
      addLog('SUCCESS', 'No matching purchase emails found. No demo data was imported.');
      return [];
    }

    const parsedOrders: GmailOrderRaw[] = [];

    // 2. Fetch full detail for each message
    for (let i = 0; i < messages.length; i++) {
      const msgSummary = messages[i];
      addLog('INFO', `Fetching message detail [${i + 1}/${messages.length}]: ID ${msgSummary.id}`);
      
      const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgSummary.id}?format=full`;
      const detailRes = await fetch(detailUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!detailRes.ok) {
        addLog('WARN', `Failed to retrieve details for message ID ${msgSummary.id}. Skipping.`);
        continue;
      }

      const message = await detailRes.json();
      const headers = message.payload?.headers || [];
      const htmlBody = getEmailHtmlBody(message.payload);
      const plainTextBody = getEmailTextBody(message.payload);
      const bodyText = [plainTextBody, htmlBody.replace(/<[^>]*>/g, ' ')].filter(Boolean).join(' ');
      const snippet = [message.snippet || '', bodyText].join(' ').replace(/\s+/g, ' ');
      
      const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
      const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
      const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';
      
      addLog('INFO', `Processing Email: "${subject.substring(0, 40)}${subject.length > 40 ? '...' : ''}" from ${from.split('<')[0].trim()}`);

      // 3. Extract properties
      // Detect platform
      let platform = 'Unknown';
      const senderLower = from.toLowerCase();
      const subjectLower = subject.toLowerCase();
      const snippetLower = snippet.toLowerCase();

      const amazonEvidence = /amazon\.(?:in|com)/i.test(from) || /amazon\.(?:in|com)\/(?:dp|gp\/product)/i.test(htmlBody);
      if (amazonEvidence || senderLower.includes('amazon') || subjectLower.includes('amazon')) {
        platform = 'Amazon';
      } else if (senderLower.includes('flipkart') || subjectLower.includes('flipkart') || snippetLower.includes('flipkart')) {
        platform = 'Flipkart';
      } else if (senderLower.includes('myntra') || subjectLower.includes('myntra') || snippetLower.includes('myntra')) {
        platform = 'Myntra';
      } else if (senderLower.includes('ajio') || subjectLower.includes('ajio') || snippetLower.includes('ajio')) {
        platform = 'AJIO';
      }

      if (platform === 'Unknown') {
        addLog('INFO', `Skipping unsupported sender: ${from || 'unknown sender'}`);
        continue;
      }

      // Dates are extracted only when the email explicitly labels their meaning.
      let deliveryDate = '';

      // Parse Order ID
      const amazonExtraction = platform === 'Amazon' ? extractAmazonEmail(htmlBody, plainTextBody) : null;
      const flipkartExtraction = platform === 'Flipkart' && htmlBody ? extractFlipkartOrder(htmlBody) : null;
      let orderId: string | null = amazonExtraction?.orderId || flipkartExtraction?.orderId || null;
      let productImageUrl = '';
      let productUrlFromAmazon = '';
      // Match marketplace-specific identifiers from normalized email text.
      const amazonOrderMatch = snippet.match(/\b\d{3}-\d{7}-\d{7}\b/) || subject.match(/\b\d{3}-\d{7}-\d{7}\b/);
      const flipkartOrderMatch = snippet.match(/\bOD\d{15,20}\b/i) || subject.match(/\bOD\d{15,20}\b/i);
      const ajioOrderMatch = snippet.match(/\bFN\d{8,}\b/i) || subject.match(/\bFN\d{8,}\b/i);

      if (!orderId && amazonOrderMatch) {
        orderId = amazonOrderMatch[0];
      } else if (!orderId && flipkartOrderMatch) {
        orderId = flipkartOrderMatch[0];
      } else if (!orderId && platform === 'AJIO' && ajioOrderMatch) {
        orderId = ajioOrderMatch[0];
      } else {
        orderId = null;
      }

      // Parse status from explicit transactional language; unknown emails remain unknown.
      let status = 'Unknown';
      let returnId: string | null = null;
      let returnDate: string | null = null;
      const statusText = (subject + ' ' + snippet + ' ' + plainTextBody + ' ' + htmlBody.replace(/<[^>]*>/g, ' ')).toLowerCase();

      if (/refund (?:has been )?(?:credited|completed|processed)|refund successful|refund success/.test(statusText)) {
        status = 'Refund Success';
      } else if (/refund initiated|refund pending|refund is being processed/.test(statusText)) {
        status = 'Pending Refund';
      } else if (/return picked up|return received|item returned|returned successfully/.test(statusText)) {
        status = 'Returned';
      } else if (/return requested|return request (?:placed|created|received)|return initiated/.test(statusText)) {
        status = 'Return Requested';
      } else if (/out for delivery|out-for-delivery/.test(statusText)) {
        status = 'Out for Delivery';
      } else if (/delivered|delivery completed|successfully delivered/.test(statusText)) {
        status = 'Delivered';
      } else if (/shipped|dispatched|in transit|on its way/.test(statusText)) {
        status = 'Shipped';
      } else if (/order (?:confirmed|placed)|thank you for your order|payment successful|order received/.test(statusText)) {
        status = 'Pending';
      }
      const returnMatch = snippet.match(/(?:return|refund)\s*(?:id|num|number|#)?\s*[:#-]?\s*([a-zA-Z0-9-]{5,})/i);
      if (returnMatch) returnId = returnMatch[1];
      const deliveryEvidence = extractAmazonDeliveryEvidence(
        `${subject} ${snippet} ${plainTextBody} ${htmlBody.replace(/<[^>]*>/g, ' ')}`,
        status
      );
      deliveryDate = deliveryEvidence.actualDeliveryDate || '';

      // Parse Price / Amount
      let price: string | null = amazonExtraction?.orderTotal || null;
      if (platform !== 'Amazon') {
        const currencyMatch = snippet.match(/(?:₹|Rs\.?|INR)\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/i) ||
                              subject.match(/(?:₹|Rs\.?|INR)\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
        if (currencyMatch) price = `₹${currencyMatch[1]}`;
      }

      // Product Name Extraction
      let productName = '';
      if (flipkartExtraction?.products.length) {
        productName = flipkartExtraction.products.map(item => item.name).join('; ');
        productImageUrl = flipkartExtraction.products.map(item => item.imageUrl || '').join('; ');
        if (flipkartExtraction.amountPaid !== null) price = `₹${flipkartExtraction.amountPaid.toFixed(2)}`;
      }
      if (platform === 'Amazon' && amazonExtraction) {
        productName = amazonExtraction.productNames.join('; ');
        productImageUrl = amazonExtraction.productImageUrls.join('; ');
        productUrlFromAmazon = amazonExtraction.productUrls[0] || '';
      }

      // 1. Flipkart / General subject formats:
      // e.g. "CROCS Unisex Clogs from your order has been shipped"
      const fromOrderMatch = subject.match(/^(.+?)\s+from your order has been (?:shipped|delivered|dispatched|cancelled)/i);
      const yourOrderForMatch = subject.match(/^Your order for\s+(.+?)\s+has been (?:shipped|delivered|dispatched|confirmed)/i);
      const hasBeenShippedMatch = subject.match(/^(.+?)\s+(?:has been|is)\s+(?:shipped|delivered|dispatched)/i);

      if (fromOrderMatch && fromOrderMatch[1]) {
        productName = fromOrderMatch[1].trim();
      } else if (yourOrderForMatch && yourOrderForMatch[1]) {
        productName = yourOrderForMatch[1].trim();
      } else if (platform === 'Amazon' && !productName) {
        const itemMatch = subject.match(/(?:shipped|delivered|confirmed):\s*[“"]?([^”"]{12,120})[”"]?$/i);
        if (itemMatch && !/^(your order|order update|delivery update|what got you here)/i.test(itemMatch[1])) productName = itemMatch[1].trim();
      } else if (platform === 'Myntra') {
        const itemMatch = subject.match(/(?:delivery confirmation|order update):\s*([^-]+)/i);
        if (itemMatch) productName = itemMatch[1];
      } else if (platform === 'Flipkart') {
        const fkMatch = subject.match(/(?:delivered|shipped|confirmed):\s*([^,-]+)/i);
        if (fkMatch && fkMatch[1]) productName = fkMatch[1].trim();
      } else if (hasBeenShippedMatch && hasBeenShippedMatch[1] && !hasBeenShippedMatch[1].toLowerCase().includes('order') && !hasBeenShippedMatch[1].toLowerCase().includes('package')) {
        productName = hasBeenShippedMatch[1].trim();
      }
      
      if (!productName && platform !== 'Amazon') productName = cleanRawProductName(subject, platform, msgSummary.id);
      if (platform === 'Myntra' && htmlBody) {
        const parsedItems = parseMyntraHtml(htmlBody);
        if (parsedItems.length > 0) {
          productName = parsedItems.map(item => `${item.brand} - ${item.name}`).join('; ');
          const imgUrls = parsedItems.map(item => item.imageUrl).filter(Boolean);
          productImageUrl = imgUrls.join('; ');
          const totalSum = parsedItems.reduce((sum, item) => {
            const val = parseFloat(item.price.replace(/[^\d.]/g, ''));
            return isNaN(val) ? sum : sum + val;
          }, 0);
          if (totalSum > 0) {
            price = `₹${totalSum.toFixed(2)}`;
          }
          const myntraOrderMatch = htmlBody.match(/\b\d+-\d+-\d+\b/);
          if (myntraOrderMatch) {
            orderId = myntraOrderMatch[0];
          }
        }
      }

      // Do not substitute stock images for missing source images.

      // Determine return policy details based on platform
      let isReturnable: boolean | null = deliveryEvidence.isReturnable;
      let returnWindowDays: number | null = deliveryEvidence.returnWindowDays;
      const returnByDate: string | null = deliveryEvidence.returnByDate;
      const returnDaysLeft: number | null = null;

      // Warranty calculation
      let warrantyMonths: number | null = null;
      let warrantyExpiry: string | null = null;
      
      const electronicKeywords = ['bulb', 'led', 'smart', 'charger', 'cable', 'headphones', 'earbuds', 'watch', 'clock', 'laptop', 'phone', 'device', 'appliance'];
      const productLower = productName.toLowerCase();
      const matchesElectronic = electronicKeywords.some(keyword => productLower.includes(keyword) || subjectLower.includes(keyword));

      // Warranty details stay unknown unless explicitly present in the email.

      const extractedUrl = productUrlFromAmazon || (htmlBody ? extractProductUrlFromHtml(htmlBody, platform, productName) : null);
      const resolvedProductUrl = getWebProductUrl(platform, productName, extractedUrl, orderId);

      const baseOrder: GmailOrderRaw = {
        gmail_message_id: msgSummary.id,
        platform,
        order_id: orderId,
        return_id: returnId,
        return_date: returnDate,
        status,
        is_returnable: isReturnable,
        return_window_days: returnWindowDays,
        return_by_date: returnByDate,
        return_days_left: returnDaysLeft > 0 ? returnDaysLeft : 0,
        return_highlight: returnDaysLeft <= 3 && returnDaysLeft > 0 ? `Only ${returnDaysLeft} days left!` : null,
        price,
        warranty_months: warrantyMonths,
        warranty_expiry: warrantyExpiry,
        product_name: productName,
        product_image_url: productImageUrl,
        product_url: resolvedProductUrl,
        delivery_date: deliveryDate,
        expected_delivery_date: deliveryEvidence.expectedDeliveryDate,
        return_policy_text: deliveryEvidence.returnPolicyText,
        invoice_url: null,
        email_subject: subject,
        email_received_at: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
        order_date: flipkartExtraction?.orderDate || null,
        products: flipkartExtraction?.products,
        event_type: status === 'Unknown' ? 'unknown' : status.toLowerCase().replace(/\\s+/g, '_'),
      };

      if (platform === 'Amazon' && amazonExtraction?.orders.length) {
        for (const amazonOrder of amazonExtraction.orders) {
          const name = amazonOrder.productNames.join('; ');
          const image = amazonOrder.productImageUrls.join('; ');
          const productUrl = amazonOrder.productUrls[0] || getWebProductUrl('Amazon', name, null, amazonOrder.orderId);
          parsedOrders.push({
            ...baseOrder,
            order_id: amazonOrder.orderId,
            product_name: name,
            product_image_url: image,
            product_url: productUrl,
            price: amazonOrder.orderTotal || amazonOrder.itemTotal || null,
          });
          addLog('SUCCESS', `Parsed Amazon order ${amazonOrder.orderId}: ${name || 'product details unavailable'}`);
        }
      } else {
        parsedOrders.push(baseOrder);
      }
      
      addLog('SUCCESS', `Successfully parsed: ${productName} (${platform}) - Value: ${price}`);
    }

    addLog('SUCCESS', `Ingested ${parsedOrders.length} live synchronized items securely!`);
    return parsedOrders;

  } catch (error: any) {
    addLog('ERROR', `Synchronization error: ${error.message || error}`);
    console.error('Gmail Ingestion Error:', error);
    throw error;
  }
};
