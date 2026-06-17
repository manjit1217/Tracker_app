import { Order, Warranty, WarrantyClaim, ReturnRequest, OrderStatus } from '../types';
import { GMAIL_RAW_DATA } from './gmailOrders';

export const COMPASS_MAP_POINTS = [
  { x: 15, y: 80, label: "Fulfillment Center" },
  { x: 35, y: 80, label: "Transit Hub A" },
  { x: 35, y: 45, label: "Oak Street Crossing" },
  { x: 70, y: 45, label: "Bay Area Depot" },
  { x: 70, y: 20, label: "Grand Avenue Turnpike" },
  { x: 85, y: 20, label: "Your Residence" }
];

export const MAP_BUILDINGS = [
  { x: 20, y: 30, w: 12, h: 12, label: "Central Park", color: "bg-emerald-50" },
  { x: 50, y: 70, w: 15, h: 10, label: "Tech Plaza", color: "bg-slate-100" },
  { x: 10, y: 15, w: 18, h: 8, label: "Midtown Mall", color: "bg-slate-100" },
  { x: 55, y: 15, w: 10, h: 14, label: "City Library", color: "bg-slate-100" },
  { x: 78, y: 65, w: 14, h: 15, label: "Marina Yacht Club", color: "bg-blue-50" }
];

// Helper to sanitize product names elegantly
export function cleanProductName(raw: string, subject: string, platform: string): string {
  let name = raw.trim();
  if (!name || name.toUpperCase() === platform.toUpperCase() || name.length <= 4) {
    name = subject;
  }
  
  // 1. Initial cleanup of common headers, status line prefixes, quotes, and punctuation
  // Remove starting/ending brackets, quotes, smart/straight quotes, numbers, or hyphens at ends
  name = name.replace(/^[“"'\s\d\-•|]+|[”"'\s\d\-•|]+$/g, '');
  
  // Trim case-tolerant status prefixes with colon or dash, often in subjects
  const prefixRegex = /^(out\s+for\s+delivery|shipped|delivered|refund\s+initiated|refund\s+success|your\s+mexpress\+?\s+order\s+item\s+is\s+delivered|your\s+mexpress\+?\s+order\s+item\s+is\s+out\s+for\s+delivery|your\s+myntra\s+return\s+request\s+processed|your\s+myntra\s+exchange\s+order\s+item\s+delivered|your\s+myntra\s+order\s+item\s+is\s+out\s+for\s+delivery|your\s+myntra\s+order\s+item\s+is\s+delivered|your\s+mexpress\+?|myntra\s+order\s+confirmation|your\s+mexpress\+?\s+myntra\s+order\s+confirmation)\.?\s*[:\-\s]*/i;
  name = name.replace(prefixRegex, '');

  // Strip trailing sharing loops and feedbacks
  name = name.replace(/\.?\s*Please share.*$/i, '');
  name = name.replace(/\.?\s*feedack.*$/i, '');
  name = name.replace(/\.?\s*feedback.*/i, '');

  // Strip trailing dot strings completely
  name = name.replace(/\.\.\.+/g, '').replace(/\s+/g, ' ').trim();

  // 2. Map-based correction for pristine human-readable names
  const lowerName = name.toLowerCase();

  if (lowerName.includes('purolift')) {
    return 'Purolift Heavy Duty PP Caster Wheels (4-Pack)';
  }
  if (lowerName.includes('regaliz densita')) {
    return 'Regaliz Densita Everyday Hair Growth Serum';
  }
  if (lowerName.includes('kbs stainless') || lowerName.includes('kbs')) {
    return 'KBS Reusable Stainless Steel Straws';
  }
  if (lowerName.includes('scotch') || lowerName.includes('3m double')) {
    return 'Scotch 3M Double Sided Heavy Duty Mounting Tape';
  }
  if (lowerName.includes('wipro')) {
    return 'Wipro 9W Bluetooth Enabled Smart LED Bulb';
  }
  if (lowerName.includes('ecovacs') || lowerName.includes('deebot')) {
    return 'Ecovacs Deebot N30 White Robotic Vacuum';
  }
  if (lowerName.includes('floral print a-line skirt') || lowerName.includes('skirt')) {
    return 'Women Floral Print A-Line Skirt';
  }
  if (lowerName.includes('slim fit geometric top') || lowerName.includes('geometric')) {
    return 'Women Slim Fit Geometric Top';
  }
  if (lowerName.includes('embroidered relaxed fit top') || lowerName.includes('embroidered')) {
    return 'Women Embroidered Relaxed Fit Top';
  }
  if (lowerName.includes('tartan checks') || lowerName.includes('tartan checked')) {
    return 'Levis Tartan Checked Casual Shirt';
  }
  if (lowerName.includes('ethnic motifs') || lowerName.includes('printed relaxed fit shir')) {
    return 'Levis Ethnic Motifs Printed Relaxed Fit Shirt';
  }
  if (lowerName.includes('calvin klein') || lowerName.includes('analogue watch')) {
    return 'Calvin Klein Elevated Analogue Watch';
  }
  if (lowerName.includes('original straight jeans') || lowerName.includes('straight jeans')) {
    return 'H&M Original Straight Jeans';
  }
  if (lowerName.includes('colourblocked suede sneakers') || lowerName.includes('rare rabbit')) {
    return 'Rare Rabbit Colourblocked Suede Sneakers';
  }
  if (lowerName.includes('myntra return request') || lowerName.includes('myntra return')) {
    return 'Premium Casual Corduroy Jacket';
  }

  // 3. Fallback gender tag and formatting cleanup
  name = name.replace(/\s*-\s*Women\s*/i, ' ');
  name = name.replace(/\s*-\s*Men\s*/i, ' ');
  name = name.replace(/\s*Men\s+Colourblocked/i, 'Colourblocked');
  name = name.replace(/\s*Women\s+Elevated/i, 'Elevated');
  name = name.replace(/\s+shir.*$/i, ' Shirt');

  // Strip dynamic quotes again just to be sure
  name = name.replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();
  
  if (name.length > 55) {
    name = name.slice(0, 52) + "...";
  }
  
  return name || "E-Commerce Package";
}

// Helper to parse price
export function parsePrice(priceStr: string | null): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[^\d.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// Emoji resolver based on product category
export function getProductEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('skirt') || lower.includes('dress') || lower.includes('floral')) return '👗';
  if (lower.includes('top') || lower.includes('blouse') || lower.includes('geometric')) return '👚';
  if (lower.includes('shirt') || lower.includes('checks')) return '👕';
  if (lower.includes('jeans') || lower.includes('pants') || lower.includes('denim')) return '👖';
  if (lower.includes('sneaker') || lower.includes('shoes') || lower.includes('boots')) return '👟';
  if (lower.includes('straw')) return '🥤';
  if (lower.includes('tape') || lower.includes('scotch') || lower.includes('sided')) return '🎗️';
  if (lower.includes('bulb') || lower.includes('wipro') || lower.includes('bluetooth enabled')) return '💡';
  if (lower.includes('deebot') || lower.includes('ecovacs') || lower.includes('vacuum')) return '🧹';
  if (lower.includes('watch') || lower.includes('analogue')) return '⌚';
  if (lower.includes('heavy duty') || lower.includes('purolift') || lower.includes('pp')) return '⚙️';
  return '📦';
}

// Deduplicate Gmail Raw Data to avoid duplicate purchases from multiple stages of transactional emails/notifications (e.g. out for delivery vs delivered)
export const DEDUPLICATED_GMAIL_RAW_DATA = (() => {
  const seenOrders = new Set<string>();
  const seenKeyless = new Set<string>();
  const list: typeof GMAIL_RAW_DATA = [];

  // Sort raw data so that more finalized statuses are processed first:
  // e.g. "Delivered", "Returned", or "Refund Success" comes before "Shipped" or "Pending"
  const sortedRaw = [...GMAIL_RAW_DATA].sort((a, b) => {
    const statusWeight = (status: string) => {
      const s = status.toLowerCase();
      if (s.includes('delivered') || s.includes('success') || s.includes('returned')) return 3;
      if (s.includes('refund') || s.includes('shipping') || s.includes('shipped')) return 2;
      return 1;
    };
    return statusWeight(b.status) - statusWeight(a.status);
  });

  for (const raw of sortedRaw) {
    const cleanName = cleanProductName(raw.product_name, raw.email_subject, raw.platform);
    
    // Check if we have an explicit valid Order ID
    if (raw.order_id && !raw.order_id.startsWith('MISSING-')) {
      const key = `${raw.platform}-${raw.order_id}-${cleanName}`;
      if (seenOrders.has(key)) {
        continue; // skip duplicate email tracking for the same order item
      }
      seenOrders.add(key);
    } else {
      // Keyless/missing order id - deduplicate by platform + clean item name + delivery date
      const key = `${raw.platform}-${cleanName}-${raw.delivery_date}`;
      if (seenKeyless.has(key)) {
        continue;
      }
      seenKeyless.add(key);
    }
    list.push(raw);
  }

  // Preserve the original ordering of GMAIL_RAW_DATA for consistency
  const keptIds = new Set(list.map(r => r.gmail_message_id));
  return GMAIL_RAW_DATA.filter(r => keptIds.has(r.gmail_message_id));
})();

// Generate structured Order list
export const INITIAL_ORDERS: Order[] = DEDUPLICATED_GMAIL_RAW_DATA.map((raw) => {
  const orderId = raw.gmail_message_id;
  const trackingNumber = raw.order_id && !raw.order_id.startsWith('MISSING-') 
    ? raw.order_id 
    : `TRK-${raw.gmail_message_id.slice(-8).toUpperCase()}`;

  // Clean status mappings
  let innerStatus: OrderStatus = 'delivered';
  const emailLower = raw.email_subject.toLowerCase();
  
  if (raw.status === 'Shipped') {
    if (emailLower.includes('out for delivery') || emailLower.includes('out_for_delivery')) {
      innerStatus = 'out_for_delivery';
    } else {
      innerStatus = 'in_transit';
    }
  } else if (raw.status === 'Pending') {
    innerStatus = 'processing';
  }

  // Split products if semicolon exists
  const itemsRaw = raw.product_name.split(';').map(itm => itm.trim()).filter(Boolean);
  const priceParsed = parsePrice(raw.price);
  
  const items = itemsRaw.map((itmName, idx) => {
    const cleanedItmName = cleanProductName(itmName, raw.email_subject, raw.platform);
    const individualPrice = priceParsed ? priceParsed / itemsRaw.length : (150 + idx * 40);
    return {
      id: `${raw.gmail_message_id}-item-${idx}`,
      name: cleanedItmName,
      quantity: 1,
      price: Math.round(individualPrice * 100) / 100,
      image: getProductEmoji(cleanedItmName),
      imageUrl: raw.product_image_url || null
    };
  });

  const priceTotal = priceParsed || items.reduce((sum, item) => sum + item.price, 0);

  // Courriers
  let courierName = "Delhivery Node";
  if (raw.platform === "Amazon") courierName = "Amazon Logistics";
  if (raw.platform === "Myntra") courierName = "Ecom Express";
  if (raw.platform === "AJIO") courierName = "Bluedart Limited";

  const courierPhone = `+91 91522 ${Math.floor(10000 + Math.random() * 90000)}`;

  // Generate logical history Timeline
  const history = [
    {
      status: 'processing',
      title: 'Order Confirmation Received',
      description: `Payment confirmation received via ${raw.platform} transactional gateways.`,
      timestamp: `${raw.delivery_date} • 10:15 AM`,
      completed: true
    }
  ];

  if (['dispatched', 'in_transit', 'out_for_delivery', 'delivered'].includes(innerStatus)) {
    history.push({
      status: 'dispatched',
      title: 'Dispatched from hub',
      description: `Parcel has departed from ${raw.platform} local distribution terminal.`,
      timestamp: `${raw.delivery_date} • 03:40 PM`,
      completed: true
    });
  }

  if (['in_transit', 'out_for_delivery', 'delivered'].includes(innerStatus)) {
    history.push({
      status: 'in_transit',
      title: 'In Transit',
      description: 'Landed at local city logistics sorting center.',
      timestamp: `${raw.delivery_date} • 11:22 PM`,
      completed: true
    });
  }

  if (['out_for_delivery', 'delivered'].includes(innerStatus)) {
    history.push({
      status: 'out_for_delivery',
      title: 'Out for Delivery Run',
      description: `Delivery associate loaded parcel into local courier van.`,
      timestamp: `${raw.delivery_date} • 08:30 AM`,
      completed: true
    });
  }

  if (innerStatus === 'delivered') {
    history.push({
      status: 'delivered',
      title: 'Package Fully Delivered',
      description: `Scanned and released at customer doorstep. Signed by MP.`,
      timestamp: `${raw.delivery_date} • 01:15 PM`,
      completed: true
    });
  } else {
    if (innerStatus !== 'out_for_delivery') {
      history.push({
        status: 'out_for_delivery',
        title: 'Out for delivery',
        description: 'Waiting for local transit courier assignment.',
        timestamp: 'Pending Dispatch',
        completed: false
      });
    }
    history.push({
      status: 'delivered',
      title: 'Delivered',
      description: 'Logistics signature verified upon parcel receipt.',
      timestamp: 'Pending Scan',
      completed: false
    });
  }

  let courierX = 100;
  if (innerStatus === 'out_for_delivery') courierX = 85;
  else if (innerStatus === 'in_transit') courierX = 35;
  else if (innerStatus === 'processing') courierX = 5;

  // Infer Category
  let category = 'Electronics';
  const itemNamesString = items.map(it => it.name).join(' ').toLowerCase();
  if (itemNamesString.includes('jeans') || itemNamesString.includes('shirt') || itemNamesString.includes('floral') || itemNamesString.includes('dress') || itemNamesString.includes('apparel') || itemNamesString.includes('sneaker') || itemNamesString.includes('shoes') || itemNamesString.includes('top') || itemNamesString.includes('jacket') || itemNamesString.includes('h&m')) {
    category = 'Fashion';
  } else if (itemNamesString.includes('vacuum') || itemNamesString.includes('scotch') || itemNamesString.includes('straw') || itemNamesString.includes('tape') || itemNamesString.includes('organizer')) {
    category = 'Home';
  } else if (itemNamesString.includes('tea') || itemNamesString.includes('organic') || itemNamesString.includes('groceries')) {
    category = 'Groceries';
  }

  // Calculate return deadlines based on 30 days after delivery_date
  let returnDeadline: string | null = null;
  if (innerStatus === 'delivered' && raw.delivery_date) {
    const delDate = new Date(raw.delivery_date);
    delDate.setDate(delDate.getDate() + 30);
    returnDeadline = delDate.toISOString().slice(0, 10);
  }

  // Refund mapping from raw status
  let rStatus = 'not_returned';
  let refAmount: number | null = null;
  let refDate: string | null = null;
  let refStatus = 'none';

  if (raw.status === 'Refund Success') {
    rStatus = 'refunded';
    refAmount = priceTotal;
    refDate = raw.delivery_date;
    refStatus = 'completed';
  } else if (raw.status === 'Returned') {
    rStatus = 'received';
    refAmount = priceTotal;
    refDate = raw.delivery_date;
    refStatus = 'processed';
  } else if (raw.status === 'Pending Refund') {
    rStatus = 'shipped';
    refAmount = priceTotal;
    refStatus = 'initiated';
  }

  // Warranty mapping
  let hasWarranty = !!raw.warranty_months;
  let warrantyDurationMonths = raw.warranty_months || (category === 'Electronics' ? 12 : null);
  let warrantyExpiryDate = raw.warranty_expiry || null;
  let warrantyStatus = 'none';

  if (warrantyDurationMonths && raw.delivery_date) {
    if (!warrantyExpiryDate) {
      const pDate = new Date(raw.delivery_date);
      pDate.setMonth(pDate.getMonth() + warrantyDurationMonths);
      warrantyExpiryDate = pDate.toISOString().slice(0, 10);
    }
    const expiry = new Date(warrantyExpiryDate);
    const now = new Date('2026-06-17');
    warrantyStatus = expiry >= now ? 'active' : 'expired';
  }

  return {
    id: orderId,
    trackingNumber,
    orderDate: raw.delivery_date,
    status: innerStatus,
    items,
    priceTotal,
    shippingAddress: "Manjit's Residence, New Delhi, India",
    estimatedArrival: innerStatus === 'delivered' ? `Delivered on ${raw.delivery_date}` : "Today, by 6:30 PM",
    courierName,
    courierPhone,
    history,
    platform: raw.platform,
    courierX,
    routePoints: COMPASS_MAP_POINTS,
    currentKmLeft: innerStatus === 'out_for_delivery' ? 1.4 : (innerStatus === 'in_transit' ? 8.6 : 0),
    minutesLeft: innerStatus === 'out_for_delivery' ? 12 : (innerStatus === 'in_transit' ? 45 : 0),
    
    // Extended properties
    category,
    returnEligible: innerStatus === 'delivered' && rStatus === 'not_returned',
    returnDeadline,
    returnStatus: rStatus,
    refundAmount: refAmount,
    refundDate: refDate,
    refundStatus: refStatus,
    warrantyDurationMonths,
    warrantyExpiryDate,
    warrantyStatus,
    serialNumber: hasWarranty ? `SN-${raw.gmail_message_id.slice(-4).toUpperCase()}-${raw.platform.slice(0, 3).toUpperCase()}` : null,
    productUrl: raw.product_url || `https://www.${raw.platform.toLowerCase()}.com/search?q=${encodeURIComponent(items[0]?.name || '')}`,
    invoiceUrl: raw.invoice_url || `https://document-node.s3.amazonaws.com/invoices/inv-pdf-${raw.gmail_message_id.slice(0,6)}.pdf`,
    notes: ""
  };
});

// Generate dynamic Warranties list
export const INITIAL_WARRANTIES: Warranty[] = DEDUPLICATED_GMAIL_RAW_DATA
  .filter(raw => raw.warranty_months && raw.warranty_months > 0)
  .map(raw => {
    const cleanedItmName = cleanProductName(raw.product_name, raw.email_subject, raw.platform);
    
    // Check if coverage is active relative to current local time of 2026-06-17
    let activeStatus: 'active' | 'expired' = 'active';
    if (raw.warranty_expiry) {
      const expiryDate = new Date(raw.warranty_expiry);
      const currentDate = new Date('2026-06-17');
      if (expiryDate < currentDate) {
        activeStatus = 'expired';
      }
    }

    let computedExpiryDate = raw.warranty_expiry || null;
    if (!computedExpiryDate && raw.warranty_months && raw.delivery_date) {
      const pDate = new Date(raw.delivery_date);
      pDate.setMonth(pDate.getMonth() + raw.warranty_months);
      computedExpiryDate = pDate.toISOString().slice(0, 10);
    }

    return {
      id: `WRN-${raw.gmail_message_id.slice(-6).toUpperCase()}`,
      orderId: raw.gmail_message_id,
      productName: cleanedItmName,
      serialNumber: `SN-${raw.gmail_message_id.slice(-4).toUpperCase()}-${raw.platform.slice(0,3).toUpperCase()}`,
      purchaseDate: raw.delivery_date,
      durationMonths: raw.warranty_months || 12,
      status: activeStatus,
      platform: raw.platform,
      warrantyExpiryDate: computedExpiryDate
    };
  });

// Preseed some warranty claims
export const INITIAL_WARRANTY_CLAIMS: WarrantyClaim[] = [
  {
    id: "CLM-812",
    warrantyId: `WRN-${DEDUPLICATED_GMAIL_RAW_DATA.find(r => r.warranty_months)?.gmail_message_id.slice(-6).toUpperCase() || 'TRK-900'}`,
    productName: cleanProductName(
      DEDUPLICATED_GMAIL_RAW_DATA.find(r => r.warranty_months)?.product_name || "Smart Home Hub",
      DEDUPLICATED_GMAIL_RAW_DATA.find(r => r.warranty_months)?.email_subject || "",
      DEDUPLICATED_GMAIL_RAW_DATA.find(r => r.warranty_months)?.platform || ""
    ),
    serialNumber: `SN-BLUE-WPR9`,
    issueDescription: "The device connection times out randomly when playing on Bluetooth networks.",
    claimType: "repair",
    status: "under_review",
    dateCreated: "2026-06-14",
    history: [
      { status: "submitted", title: "Defect report received", date: "June 14, 2026" },
      { status: "under_review", title: "Diagnostic check initiated", date: "June 16, 2026" }
    ]
  }
];

// Generate active Returns list
export const INITIAL_RETURNS: ReturnRequest[] = DEDUPLICATED_GMAIL_RAW_DATA
  .filter(raw => raw.return_id || ['Returned', 'Pending Refund', 'Refund Success'].includes(raw.status))
  .map(raw => {
    const cleanedName = cleanProductName(raw.product_name, raw.email_subject, raw.platform);
    const orderId = raw.gmail_message_id;

    let rStatus: 'requested' | 'label_generated' | 'shipped' | 'received' | 'refunded' = 'requested';
    if (raw.status === 'Refund Success') rStatus = 'refunded';
    else if (raw.status === 'Returned') rStatus = 'received';
    else if (raw.status === 'Pending Refund') rStatus = 'shipped';

    const history = [
      { status: "requested", title: "Return request processed", date: raw.delivery_date }
    ];

    if (['label_generated', 'shipped', 'received', 'refunded'].includes(rStatus)) {
      history.push({ status: "label_generated", title: "Waybill packing slip printed", date: raw.delivery_date });
    }
    if (['shipped', 'received', 'refunded'].includes(rStatus)) {
      history.push({ status: "shipped", title: "Parcel deposited at pickup terminal", date: raw.delivery_date });
    }
    if (['received', 'refunded'].includes(rStatus)) {
      history.push({ status: "received", title: "Warehouse diagnostic scans passed", date: raw.delivery_date });
    }
    if (rStatus === 'refunded') {
      history.push({ status: "refunded", title: "Reimbursement disbursed to account node", date: raw.delivery_date });
    }

    return {
      id: raw.return_id || `RET-${raw.gmail_message_id.slice(-6).toUpperCase()}`,
      orderId,
      productName: cleanedName,
      returnReason: "Return parsed from Gmail notification logs",
      details: `Return request registered reference ${raw.return_id || 'Digital RA'}. Package mapped with priority return clearance waybill scan.`,
      refundMethod: "original_payment",
      status: rStatus,
      trackingNumber: `WAYBILL-${(raw.return_id || raw.gmail_message_id).slice(-8).toUpperCase()}`,
      dateCreated: raw.delivery_date,
      history,
      platform: raw.platform
    };
  });
