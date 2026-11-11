import { Order, Warranty, ReturnRequest, OrderStatus } from '../types';
import { GmailOrderRaw } from '../data/gmailOrders';
import { parsePrice, getProductEmoji } from '../data/mockData';
import { getWebProductUrl } from './productUrl';
import { correlateGmailOrderEvents, isStableMarketplaceOrderId } from './orderCorrelation';

const parseDateSafe = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

const datesClose = (d1Str: string, d2Str: string, maxDays = 5): boolean => {
  const d1 = parseDateSafe(d1Str); const d2 = parseDateSafe(d2Str);
  if (!d1 || !d2) return false;
  return Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24) <= maxDays;
};

const getStatusPriority = (statusStr: string, emailSubject?: string): number => {
  const s = (statusStr || '').toLowerCase();
  const sub = (emailSubject || '').toLowerCase();
  if (s.includes('refund') || s.includes('returned') || s.includes('success')) return 5;
  if (s.includes('delivered') || sub.includes('delivered')) return 4;
  if (s.includes('out') || sub.includes('out for delivery') || sub.includes('out_for_delivery')) return 3;
  if (s.includes('shipped') || s.includes('transit') || sub.includes('shipped') || sub.includes('transit')) return 2;
  return 1;
};

const isRealOrderId = (id: string | null | undefined): boolean => {
  if (!id) return false;
  const s = id.toUpperCase();
  if (s.startsWith('MISSING-') || s.startsWith('GML-') || s.startsWith('TRK-')) {
    return false;
  }
  // If it's a date in format YYYY-MM-DD or DD-MM-YYYY, it's not a real order ID
  if (/^\d{4}-\d{2}-\d{2}$/.test(id) || /^\d{2}-\d{2}-\d{4}$/.test(id)) {
    return false;
  }
  return true;
};

export const mapGmailRawToDomain = (
  rawList: GmailOrderRaw[]
 ): { orders: Order[]; warranties: Warranty[]; returns: ReturnRequest[] } => {
  const mappedOrders: Order[] = [];
  const mappedWarranties: Warranty[] = [];
  const mappedReturns: ReturnRequest[] = [];

  // Emails are events; only exact marketplace order IDs can link them.
  const mergedRaw = correlateGmailOrderEvents(rawList);

  mergedRaw.forEach((raw) => {
    const orderId = isStableMarketplaceOrderId(raw.platform, raw.order_id) ? `${raw.platform.toLowerCase()}:${raw.order_id}` : `email:${raw.gmail_message_id}`
    const trackingNumber = raw.order_id && !raw.order_id.startsWith('MISSING-') && !raw.order_id.startsWith('GML-') && !raw.order_id.startsWith('TRK-')
      ? raw.order_id
      : `TRK-${raw.gmail_message_id.slice(-8).toUpperCase()}`;

    // Map raw status to OrderStatus
    let status: OrderStatus = 'processing';
    const emailLower = (raw.email_subject || '').toLowerCase();
    
    if (raw.status === 'Delivered' || raw.status === 'Returned' || raw.status === 'Refund Success') {
      status = 'delivered';
    } else if (raw.status === 'Out for Delivery') {
      status = 'out_for_delivery';
    } else if (raw.status === 'Shipped') {
      if (emailLower.includes('out for delivery') || emailLower.includes('out_for_delivery')) {
        status = 'out_for_delivery';
      } else {
        status = 'in_transit';
      }
    } else if (raw.status === 'Pending') {
      status = 'processing';
    }

    const parsedPrice = parsePrice(raw.price);
    const priceValue = parsedPrice > 0 ? parsedPrice : 0;

    // Create item list
    const itemsRaw = (raw.product_name || '').split(';').map(itm => itm.trim()).filter(Boolean);
    const imageUrlsRaw = (raw.product_image_url || '').split(';').map(url => url.trim()).filter(Boolean);

    const items = itemsRaw.map((itmName, idx) => {
      const individualPrice = itemsRaw.length === 1 ? priceValue : 0;
      const itemImgUrl = imageUrlsRaw[idx] || null;
      return {
        id: `${raw.gmail_message_id}-item-${idx}`,
        name: itmName,
        quantity: 1,
        price: Math.round(individualPrice * 100) / 100,
        image: getProductEmoji(itmName),
        imageUrl: itemImgUrl,
      };
    });

    // Determine return eligibility & status
    const returnStatus = raw.status === 'Refund Success' ? 'refunded' : 
                         raw.status === 'Returned' ? 'received' : 'not_returned';

    // Keep only the status actually supported by the source email. Do not
    // manufacture courier scans or timestamps that were not present in Gmail.
    const history = [{
      status,
      title: raw.status === 'Unknown' ? 'Order email received' : raw.status,
      description: `Status extracted from ${raw.platform} transactional email.`,
      timestamp: raw.delivery_date || '',
      completed: true,
    }];

    const orderRecord: Order = {
      id: orderId,
      trackingNumber,
      orderDate: raw.delivery_date,
      status,
      items,
      priceTotal: priceValue,
      shippingAddress: 'Not provided by email',
      estimatedArrival: '',
      courierName: 'Not provided by email',
      courierPhone: '',
      history,
      platform: raw.platform,
      returnEligible: raw.is_returnable ?? undefined,
      returnDeadline: raw.return_by_date,
      returnStatus: raw.status === 'Pending Refund' ? 'initiated' : returnStatus,
      refundAmount: raw.status === 'Refund Success' ? priceValue : null,
      refundDate: raw.status === 'Refund Success' ? raw.delivery_date : null,
      refundStatus: raw.status === 'Refund Success' ? 'completed' : 'none',
      warrantyDurationMonths: raw.warranty_months,
      warrantyExpiryDate: raw.warranty_expiry,
      warrantyStatus: raw.warranty_months ? 'active' : 'none',
      serialNumber: null,
      productUrl: getWebProductUrl(raw.platform, items[0]?.name || raw.product_name, raw.product_url, raw.order_id),
      invoiceUrl: raw.invoice_url || null,
    };

    mappedOrders.push(orderRecord);

    // Create corresponding Warranty if applicable
    if (raw.warranty_months) {
      mappedWarranties.push({
        id: `W-${raw.gmail_message_id}`,
        orderId,
        productName: raw.product_name,
        serialNumber: '',
        purchaseDate: raw.delivery_date,
        durationMonths: raw.warranty_months,
        status: 'active',
        platform: raw.platform,
        warrantyExpiryDate: raw.warranty_expiry,
      });
    }

    // Create corresponding ReturnRequest if applicable
    if (raw.return_id) {
      mappedReturns.push({
        id: raw.return_id,
        orderId: raw.gmail_message_id,
        productName: raw.product_name,
        returnReason: 'Not specified in email',
        details: 'Return reference extracted from transactional email; reason not provided.'
        refundMethod: 'original_payment',
        status: raw.status === 'Refund Success' ? 'refunded' : 'shipped',
        trackingNumber: '',
        dateCreated: raw.return_date || raw.delivery_date,
        history: [
          { status: 'requested', title: 'Return update received', date: raw.return_date || raw.email_received_at || '' },
        ],
        platform: raw.platform,
      });
    }
  });

  return {
    orders: deduplicateOrders(mappedOrders),
    warranties: mappedWarranties,
    returns: mappedReturns,
  };
};

export const deduplicateOrders = (orders: Order[]): Order[] => {
  const merged: Order[] = [];

  const getStatusPriorityNum = (status: OrderStatus): number => {
    switch (status) {
      case 'delivered': return 5;
      case 'out_for_delivery': return 4;
      case 'in_transit': return 3;
      case 'processing': return 2;
      default: return 1;
    }
  };

  const isDatesClose = (d1Str: string, d2Str: string, maxDays = 5): boolean => {
    const t1 = new Date(d1Str).getTime();
    const t2 = new Date(d2Str).getTime();
    if (isNaN(t1) || isNaN(t2)) return true; // fallback
    const diffDays = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
    return diffDays <= maxDays;
  };

  orders.forEach((ord) => {
    // Look for an existing order in 'merged' that is a duplicate of 'ord'
    const dupIdx = merged.findIndex((existing) => {
      // Must be same platform
      if (existing.platform.toLowerCase() !== ord.platform.toLowerCase()) {
        return false;
      }

      return existing.id === ord.id || existing.trackingNumber === ord.trackingNumber;
    });

    if (dupIdx > -1) {
      const existing = merged[dupIdx];
      const ordPriority = getStatusPriorityNum(ord.status);
      const existingPriority = getStatusPriorityNum(existing.status);

      if (ordPriority > existingPriority) {
        // 'ord' has more advanced/finalized status (e.g., delivered vs out_for_delivery)
        // Keep 'ord' but merge non-duplicate items
        const existingItemNames = new Set(existing.items.map(i => i.name.toLowerCase().trim()));
        const mergedItems = [...ord.items];
        existing.items.forEach(item => {
          if (!existingItemNames.has(item.name.toLowerCase().trim())) {
            mergedItems.push(item);
          }
        });
        
        merged[dupIdx] = {
          ...ord,
          items: mergedItems,
        };
      } else {
        // Existing has higher or equal priority. Keep existing but merge new items from 'ord' if any are missing
        const existingItemNames = new Set(existing.items.map(i => i.name.toLowerCase().trim()));
        const itemsToAppend: typeof existing.items = [];
        ord.items.forEach(item => {
          if (!existingItemNames.has(item.name.toLowerCase().trim())) {
            itemsToAppend.push(item);
          }
        });
        existing.items = [...existing.items, ...itemsToAppend];
      }
    } else {
      merged.push({ ...ord });
    }
  });

  return merged.map(o => ({
    ...o,
    productUrl: getWebProductUrl(o.platform, o.items[0]?.name, o.productUrl, o.trackingNumber)
  }));
};
