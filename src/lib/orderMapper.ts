import { Order, Warranty, ReturnRequest, OrderStatus } from '../types';
import { GmailOrderRaw } from '../data/gmailOrders';
import { parsePrice, getProductEmoji } from '../data/mockData';

const parseDateSafe = (dateStr: string): Date => {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

const datesClose = (d1Str: string, d2Str: string, maxDays = 5): boolean => {
  const t1 = parseDateSafe(d1Str).getTime();
  const t2 = parseDateSafe(d2Str).getTime();
  const diffDays = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
  return diffDays <= maxDays;
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

  // Deduplicate and merge multi-stage transactional emails
  const mergedRaw: GmailOrderRaw[] = [];

  rawList.forEach((raw) => {
    const cleanName = (raw.product_name || '').toLowerCase().trim();
    
    const duplicateIndex = mergedRaw.findIndex((existing) => {
      // 1. Same platform
      if (existing.platform.toLowerCase() !== raw.platform.toLowerCase()) {
        return false;
      }

      // 2. If products are the same and dates are within 5 days, they are duplicates
      const isSameProduct = cleanName === (existing.product_name || '').toLowerCase().trim() ||
                            cleanName.includes((existing.product_name || '').toLowerCase().trim()) ||
                            (existing.product_name || '').toLowerCase().trim().includes(cleanName);

      if (isSameProduct && datesClose(raw.delivery_date, existing.delivery_date, 5)) {
        return true;
      }

      // 3. If both have real order IDs and they are equal, they are duplicates
      const rawHasRealId = isRealOrderId(raw.order_id);
      const existingHasRealId = isRealOrderId(existing.order_id);
      if (rawHasRealId && existingHasRealId) {
        return raw.order_id === existing.order_id;
      }

      return false;
    });

    if (duplicateIndex > -1) {
      const existing = mergedRaw[duplicateIndex];
      const rawPriority = getStatusPriority(raw.status, raw.email_subject);
      const existingPriority = getStatusPriority(existing.status, existing.email_subject);

      if (rawPriority > existingPriority) {
        // Overwrite status and tracking properties from the newer/more advanced email
        existing.status = raw.status;
        existing.email_subject = raw.email_subject;
        existing.gmail_message_id = raw.gmail_message_id;
        if (raw.price && raw.price !== '₹899.00') {
          existing.price = raw.price;
        }
        if (raw.product_image_url) {
          const existingImgs = (existing.product_image_url || '').split(';').map(u => u.trim()).filter(Boolean);
          const rawImgs = (raw.product_image_url || '').split(';').map(u => u.trim()).filter(Boolean);
          const combinedImgs = Array.from(new Set([...existingImgs, ...rawImgs]));
          existing.product_image_url = combinedImgs.join('; ');
        }
        if (raw.product_name) {
          const existingNames = (existing.product_name || '').split(';').map(n => n.trim()).filter(Boolean);
          const rawNames = (raw.product_name || '').split(';').map(n => n.trim()).filter(Boolean);
          const combinedNames = Array.from(new Set([...existingNames, ...rawNames]));
          existing.product_name = combinedNames.join('; ');
        }
        existing.is_returnable = raw.is_returnable;
        existing.return_by_date = raw.return_by_date;
        existing.return_days_left = raw.return_days_left;
        existing.return_highlight = raw.return_highlight;
        existing.delivery_date = raw.delivery_date;
      } else {
        const rawHasRealId = isRealOrderId(raw.order_id);
        const existingHasRealId = isRealOrderId(existing.order_id);
        if (rawHasRealId && !existingHasRealId) {
          existing.order_id = raw.order_id;
        }
        // Even if raw priority is lower, we should still combine product names and images if they are different
        if (raw.product_name) {
          const existingNames = (existing.product_name || '').split(';').map(n => n.trim()).filter(Boolean);
          const rawNames = (raw.product_name || '').split(';').map(n => n.trim()).filter(Boolean);
          const combinedNames = Array.from(new Set([...existingNames, ...rawNames]));
          existing.product_name = combinedNames.join('; ');
        }
        if (raw.product_image_url) {
          const existingImgs = (existing.product_image_url || '').split(';').map(u => u.trim()).filter(Boolean);
          const rawImgs = (raw.product_image_url || '').split(';').map(u => u.trim()).filter(Boolean);
          const combinedImgs = Array.from(new Set([...existingImgs, ...rawImgs]));
          existing.product_image_url = combinedImgs.join('; ');
        }
      }
    } else {
      mergedRaw.push({ ...raw });
    }
  });

  mergedRaw.forEach((raw) => {
    const orderId = raw.gmail_message_id;
    const trackingNumber = raw.order_id && !raw.order_id.startsWith('MISSING-') && !raw.order_id.startsWith('GML-') && !raw.order_id.startsWith('TRK-')
      ? raw.order_id
      : `TRK-${raw.gmail_message_id.slice(-8).toUpperCase()}`;

    // Map raw status to OrderStatus
    let status: OrderStatus = 'delivered';
    const emailLower = (raw.email_subject || '').toLowerCase();
    
    if (raw.status === 'Shipped') {
      if (emailLower.includes('out for delivery') || emailLower.includes('out_for_delivery')) {
        status = 'out_for_delivery';
      } else {
        status = 'in_transit';
      }
    } else if (raw.status === 'Pending') {
      status = 'processing';
    }

    const priceValue = parsePrice(raw.price) || 899;

    // Create item list
    const itemsRaw = (raw.product_name || '').split(';').map(itm => itm.trim()).filter(Boolean);
    const imageUrlsRaw = (raw.product_image_url || '').split(';').map(url => url.trim()).filter(Boolean);

    const items = itemsRaw.map((itmName, idx) => {
      const individualPrice = priceValue / itemsRaw.length;
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

    // Timeline history
    const history = [
      {
        status: 'processing',
        title: 'Order Confirmation Received',
        description: `Payment confirmation received via ${raw.platform} transactional gateways.`,
        timestamp: `${raw.delivery_date} • 10:15 AM`,
        completed: true,
      },
    ];

    if (['dispatched', 'in_transit', 'out_for_delivery', 'delivered'].includes(status)) {
      history.push({
        status: 'dispatched',
        title: 'Dispatched from hub',
        description: `Parcel has departed from ${raw.platform} local distribution terminal.`,
        timestamp: `${raw.delivery_date} • 03:40 PM`,
        completed: true,
      });
    }

    if (['in_transit', 'out_for_delivery', 'delivered'].includes(status)) {
      history.push({
        status: 'in_transit',
        title: 'In Transit',
        description: 'Landed at local city logistics sorting center.',
        timestamp: `${raw.delivery_date} • 11:22 PM`,
        completed: true,
      });
    }

    if (['out_for_delivery', 'delivered'].includes(status)) {
      history.push({
        status: 'out_for_delivery',
        title: 'Out for Delivery Run',
        description: `Delivery associate loaded parcel into local courier van.`,
        timestamp: `${raw.delivery_date} • 08:30 AM`,
        completed: true,
      });
    }

    if (status === 'delivered') {
      history.push({
        status: 'delivered',
        title: 'Package Fully Delivered',
        description: `Scanned and released at customer doorstep. Signed by MP.`,
        timestamp: `${raw.delivery_date} • 01:15 PM`,
        completed: true,
      });
    }

    const orderRecord: Order = {
      id: orderId,
      trackingNumber,
      orderDate: raw.delivery_date,
      status,
      items,
      priceTotal: priceValue,
      shippingAddress: 'Home Delivery (Synchronized with Gmail User Profile)',
      estimatedArrival: raw.delivery_date,
      courierName: raw.platform === 'Amazon' ? 'Amazon Logistics' : 
                   raw.platform === 'Myntra' ? 'Ecom Express' : 
                   raw.platform === 'AJIO' ? 'Bluedart Limited' : 'Delhivery Node',
      courierPhone: `+91 91522 ${Math.floor(10000 + Math.random() * 90000)}`,
      history,
      platform: raw.platform,
      returnEligible: raw.is_returnable || false,
      returnDeadline: raw.return_by_date,
      returnStatus,
      refundAmount: raw.status === 'Refund Success' ? priceValue : null,
      refundDate: raw.status === 'Refund Success' ? raw.delivery_date : null,
      refundStatus: raw.status === 'Refund Success' ? 'completed' : 'none',
      warrantyDurationMonths: raw.warranty_months,
      warrantyExpiryDate: raw.warranty_expiry,
      warrantyStatus: raw.warranty_months ? 'active' : 'none',
      serialNumber: raw.warranty_months ? `W-${raw.gmail_message_id.slice(-8).toUpperCase()}` : null,
      productUrl: raw.product_url || null,
      invoiceUrl: raw.invoice_url || null,
      // Simple coordinate helpers for the delivery map simulation
      courierX: 100,
      currentKmLeft: 0,
      minutesLeft: 0,
    };

    mappedOrders.push(orderRecord);

    // Create corresponding Warranty if applicable
    if (raw.warranty_months) {
      mappedWarranties.push({
        id: `W-${raw.gmail_message_id}`,
        orderId: raw.gmail_message_id,
        productName: raw.product_name,
        serialNumber: `W-${raw.gmail_message_id.slice(-8).toUpperCase()}`,
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
        returnReason: 'Performance not as expected or size fit issue',
        details: 'Automatically synchronized from purchase return correspondence.',
        refundMethod: 'original_payment',
        status: raw.status === 'Refund Success' ? 'refunded' : 'shipped',
        trackingNumber: `RET-${raw.gmail_message_id.slice(-8).toUpperCase()}`,
        dateCreated: raw.return_date || raw.delivery_date,
        history: [
          { status: 'requested', title: 'Return Authorization Created', date: raw.delivery_date },
          { status: 'shipped', title: 'Carrier Received Package', date: raw.delivery_date },
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

      // Check if they share the same items or similar item names
      const existingItems = existing.items.map(i => i.name.toLowerCase().trim());
      const ordItems = ord.items.map(i => i.name.toLowerCase().trim());
      
      const hasOverlap = ordItems.some(oName => 
        existingItems.some(eName => eName.includes(oName) || oName.includes(eName))
      );

      if (!hasOverlap) {
        return false;
      }

      // If dates are close
      if (isDatesClose(existing.orderDate, ord.orderDate, 5)) {
        return true;
      }

      return false;
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

  return merged;
};
