/**
 * Utility for resolving and validating authentic e-commerce web product URLs across platforms.
 * Handles Flipkart, Amazon, Myntra, AJIO, and generic retailers.
 */

export function extractProductUrlFromHtml(
  htmlContent: string,
  platform: string,
  productName?: string
): string | null {
  if (!htmlContent) return null;
  const plat = (platform || '').toLowerCase().trim();

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('a[href]'));

    if (plat.includes('flipkart') || plat === 'fk') {
      // 1. Look for direct product links with /p/ or /itm or /dl/
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = (a.textContent || '').trim().toLowerCase();
        
        if (
          href.includes('flipkart.com') && 
          (href.includes('/p/') || href.includes('itm') || href.includes('/dl/')) &&
          !href.includes('/account') &&
          !href.includes('/helpcentre') &&
          !href.includes('/unsubscribe')
        ) {
          return href;
        }

        // If link text matches product name keywords
        if (productName && text.length > 5) {
          const firstWord = productName.toLowerCase().split(' ')[0];
          if (firstWord && text.includes(firstWord) && href.includes('flipkart.com')) {
            return href;
          }
        }
      }

      // 2. Look for any Flipkart order or item tracking link
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        if (
          (href.includes('flipkart.com') || href.includes('dl.flipkart.com')) &&
          !href.includes('unsubscribe') &&
          !href.includes('helpcentre') &&
          href.length > 25
        ) {
          return href;
        }
      }
    } else if (plat.includes('amazon')) {
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        if (href.includes('amazon.in/dp/') || href.includes('amazon.com/dp/')) {
          return href;
        }
      }
    } else if (plat.includes('myntra')) {
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        if (href.includes('myntra.com/') && (href.includes('/buy') || /\/\d+/.test(href))) {
          return href;
        }
      }
    } else if (plat.includes('ajio')) {
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        if (href.includes('ajio.com/p/')) {
          return href;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to extract product link from email HTML:', err);
  }

  return null;
}

export function getWebProductUrl(
  platform?: string | null,
  productName?: string | null,
  existingUrl?: string | null,
  orderId?: string | null
): string {
  const plat = (platform || '').trim().toLowerCase();
  const cleanName = (productName || '').trim();
  const rawUrl = (existingUrl || '').trim();

  // Filter out invalid/placeholder/generic URLs
  const isGenericPlaceholder =
    !rawUrl ||
    rawUrl === 'https://www.google.com' ||
    rawUrl === 'http://www.google.com' ||
    rawUrl === 'https://www.google.com/' ||
    rawUrl === 'http://www.google.com/' ||
    rawUrl === 'https://google.com' ||
    rawUrl === 'https://www.flipkart.com' ||
    rawUrl === 'https://www.flipkart.com/' ||
    rawUrl === 'https://flipkart.com' ||
    rawUrl === 'https://flipkart.com/' ||
    rawUrl === 'https://www.amazon.in' ||
    rawUrl === 'https://www.amazon.in/' ||
    rawUrl === 'https://www.myntra.com' ||
    rawUrl === 'https://www.myntra.com/' ||
    rawUrl === 'https://www.ajio.com' ||
    rawUrl === 'https://www.ajio.com/';

  // If rawUrl is a specific, valid URL matching the platform, use it
  if (!isGenericPlaceholder) {
    if (plat.includes('flipkart') || plat === 'fk') {
      if (
        (rawUrl.includes('flipkart.com') || rawUrl.includes('dl.flipkart.com')) &&
        !rawUrl.endsWith('flipkart.com') &&
        !rawUrl.endsWith('flipkart.com/')
      ) {
        return rawUrl;
      }
    } else if (plat.includes('amazon')) {
      if (rawUrl.includes('amazon.in') || rawUrl.includes('amazon.com')) {
        return rawUrl;
      }
    } else if (plat.includes('myntra')) {
      if (rawUrl.includes('myntra.com') && !rawUrl.endsWith('myntra.com/')) {
        return rawUrl;
      }
    } else if (plat.includes('ajio')) {
      if (rawUrl.includes('ajio.com') && !rawUrl.endsWith('ajio.com/')) {
        return rawUrl;
      }
    } else if (!rawUrl.includes('google.com') && rawUrl.startsWith('http')) {
      // Custom URL for other stores
      return rawUrl;
    }
  }

  // Construct search query
  const query = encodeURIComponent(cleanName || 'Product');

  // Specific platform formatting
  if (plat.includes('flipkart') || plat === 'fk') {
    return `https://www.flipkart.com/search?q=${query}`;
  }

  if (plat.includes('amazon')) {
    return `https://www.amazon.in/s?k=${query}`;
  }

  if (plat.includes('myntra')) {
    return `https://www.myntra.com/${query}`;
  }

  if (plat.includes('ajio')) {
    return `https://www.ajio.com/search/?text=${query}`;
  }

  // Fallback for general or unclassified platform
  const searchPrefix = platform ? `${platform} ` : '';
  return `https://www.google.com/search?q=${encodeURIComponent(searchPrefix + cleanName)}`;
}
