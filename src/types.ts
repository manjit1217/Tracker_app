export type OrderStatus = 'processing' | 'dispatched' | 'in_transit' | 'out_for_delivery' | 'delivered';

export type OrderEventType = 'order_placed' | 'invoice_issued' | 'shipped' | 'out_for_delivery' | 'delivered' | 'return_requested' | 'returned' | 'refund_pending' | 'refund_completed' | 'unknown';

/** Immutable evidence extracted from one source email. */
export interface OrderEvent {
  id: string;
  userId: string;
  platform: string;
  orderId: string | null;
  gmailMessageId: string;
  gmailThreadId?: string | null;
  eventType: OrderEventType;
  eventAt: string | null;
  receivedAt: string | null;
  extractedFields: Record<string, unknown>;
  confidence: number;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  image: string;
  imageUrl?: string | null;
  priceKnown?: boolean;
  seller?: string | null;
  deliveryEstimate?: string | null;
}

export interface StatusHistory {
  status: OrderStatus | string;
  title: string;
  description: string;
  timestamp: string;
  completed: boolean;
}

export interface Coordinates {
  x: number; // percentage based for simple robust SVG mapping
  y: number;
}

export interface Order {
  id: string;
  trackingNumber: string;
  orderDate: string;
  status: OrderStatus;
  items: OrderItem[];
  priceTotal: number;
  shippingAddress: string;
  estimatedArrival: string;
  courierName: string;
  courierPhone: string;
  history: StatusHistory[];
  platform?: string;
  
  // Return Tracking
  returnEligible?: boolean;
  returnDeadline?: string | null;
  returnStatus?: 'not_returned' | 'return_requested' | 'shipped' | 'received' | 'refunded' | string | null;
  
  // Refund Tracking
  refundAmount?: number | null;
  refundDate?: string | null;
  refundStatus?: 'none' | 'initiated' | 'processed' | 'completed' | string | null;

  // Warranty Info
  warrantyDurationMonths?: number | null;
  warrantyExpiryDate?: string | null;
  warrantyStatus?: 'none' | 'active' | 'expired' | string | null;
  serialNumber?: string | null;

  // Additional link pointers & notes
  productUrl?: string | null;
  invoiceUrl?: string | null;
  notes?: string | null;
  category?: string | null; // e.g. Electronics, Fashion, Home, Groceries, etc.

  // Real-time navigation properties
  courierX?: number; // 0 to 100 on map route
  routePoints?: Coordinates[]; // the route the driver takes
  currentKmLeft?: number;
  minutesLeft?: number;
}

export interface Warranty {
  id: string;
  orderId: string;
  productName: string;
  serialNumber: string;
  purchaseDate: string;
  durationMonths: number;
  status: 'active' | 'expired';
  platform?: string;
  warrantyExpiryDate?: string | null;
}

export interface WarrantyClaim {
  id: string;
  warrantyId: string;
  productName: string;
  serialNumber: string;
  issueDescription: string;
  claimType: 'repair' | 'replacement' | 'refund';
  status: 'submitted' | 'under_review' | 'approved' | 'shipped' | 'completed';
  dateCreated: string;
  history: { status: string; title: string; date: string }[];
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  productName: string;
  returnReason: string;
  details: string;
  refundMethod: 'original_payment' | 'store_credit';
  status: 'requested' | 'label_generated' | 'shipped' | 'received' | 'refunded';
  trackingNumber: string;
  dateCreated: string;
  history: { status: string; title: string; date: string }[];
  platform?: string;
}
