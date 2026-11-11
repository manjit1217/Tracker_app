import React, { useState, useEffect } from 'react';
import { 
  Search, Filter, Plus, Calendar, Shield, ArrowLeftRight, ArrowLeft, Check, CheckCircle2, 
  MapPin, Clock, DollarSign, ArrowUpRight, ExternalLink, FileText, Edit, Trash2, 
  X, Info, Upload, Key, User, FileClock, ChevronDown, MessageSquare, Package, Eye
} from 'lucide-react';
import { Order, OrderStatus, OrderItem, Warranty, ReturnRequest } from '../types';
import { PlatformBadge } from '../App';
import { getProductEmoji } from '../data/mockData';
import { getWebProductUrl } from '../lib/productUrl';

interface OrdersPageProps {
  orders: Order[];
  onUpdateOrders: (updated: Order[]) => void;
  onRegisterWarranty: (w: Omit<Warranty, 'id' | 'status'>) => void;
  onInitiateReturn: (r: Omit<ReturnRequest, 'id' | 'status' | 'trackingNumber' | 'dateCreated' | 'history'>) => void;
  selectedOrderId: string;
  onSelectOrderId: (id: string) => void;
}

export default function OrdersPage({
  orders,
  onUpdateOrders,
  onRegisterWarranty,
  onInitiateReturn,
  selectedOrderId,
  onSelectOrderId
}: OrdersPageProps) {

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [selPlatform, setSelPlatform] = useState('All');
  const [selStatus, setSelStatus] = useState('All');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'price_high' | 'price_low'

  // On mobile screens, toggle between list view and selected order detail view
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  useEffect(() => {
    if (selectedOrderId) {
      setMobileView('detail');
    }
  }, [selectedOrderId]);

  // Manual Add state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBrand, setNewBrand] = useState('Amazon');
  const [newOrderId, setNewOrderId] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newOrderDate, setNewOrderDate] = useState('2026-06-17');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newStatus, setNewStatus] = useState<OrderStatus>('delivered');
  const [newCategory, setNewCategory] = useState('Electronics');
  const [newWarrantyMonths, setNewWarrantyMonths] = useState('12');
  const [newProductUrl, setNewProductUrl] = useState('');
  const [newInvoiceUrl, setNewInvoiceUrl] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Invoice Upload/Url editing modal state
  const [editingInvoiceOrderId, setEditingInvoiceOrderId] = useState<string | null>(null);
  const [editInvoiceUrlVal, setEditInvoiceUrlVal] = useState('');

  // Finding currently selected order of interest
  const selectedOrder = orders.find(o => o.id === selectedOrderId) || orders[0];

  // Unique list of platform domains
  const platformsList = ['All', ...Array.from(new Set(orders.map(o => o.platform || '').filter(Boolean)))];

  // Match the filter queries
  const filteredOrders = orders.filter(o => {
    const term = search.toLowerCase();
    const matchesSearch = o.id.toLowerCase().includes(term) || 
                          (o.trackingNumber && o.trackingNumber.toLowerCase().includes(term)) || 
                          o.items. some(it => it.name.toLowerCase().includes(term));
    const matchesPlatform = selPlatform === 'All' || o.platform === selPlatform;
    const matchesStatus = selStatus === 'All' || 
                         (selStatus === 'Delivered' && o.status === 'delivered') ||
                         (selStatus === 'Shipped' && ['shipped', 'in_transit', 'out_for_delivery'].includes(o.status)) ||
                         (selStatus === 'Ordered' && o.status === 'processing') ||
                         (selStatus === 'Return Requested' && o.returnStatus && o.returnStatus !== 'not_returned');
                         
    return matchesSearch && matchesPlatform && matchesStatus;
  }).sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
    }
    if (sortBy === 'oldest') {
      return new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
    }
    if (sortBy === 'price_high') {
      return b.priceTotal - a.priceTotal;
    }
    return a.priceTotal - b.priceTotal;
  });

  // Handler: Manual Purchase Add Submission
  const handleAddPurchaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newOrderId) {
      alert("Please provide Product Name and Order ID.");
      return;
    }

    const orderId = newOrderId.trim();
    const cleanPrice = parseFloat(newItemPrice) || 0;
    const cleanMonths = parseInt(newWarrantyMonths) || 0;

    // Build timeline history
    const history = [
      {
        status: newStatus,
        title: 'Order Loaded Manually',
        description: 'Customer added this purchase transaction log manually.',
        timestamp: `${newOrderDate} • 12:00 PM`,
        completed: true
      }
    ];

    // Build item
    const newItem: OrderItem = {
      id: `${orderId}-itm-0`,
      name: newItemName.trim(),
      quantity: 1,
      price: cleanPrice,
      image: getProductEmoji(newItemName),
      imageUrl: null
    };

    // Construct deadline
    const delDateObj = new Date(newOrderDate);
    delDateObj.setDate(delDateObj.getDate() + 30);
    const calculatedDeadline = delDateObj.toISOString().slice(0, 10);

    // Calculate warranty duration and expiry
    let calculatedExpiryStr: string | null = null;
    let computedWarrantyStatus = 'none';
    if (cleanMonths > 0) {
      const pDate = new Date(newOrderDate);
      pDate.setMonth(pDate.getMonth() + cleanMonths);
      calculatedExpiryStr = pDate.toISOString().slice(0, 10);
      computedWarrantyStatus = pDate >= new Date() ? 'active' : 'expired';
    }

    const newCreatedOrder: Order = {
      id: orderId,
      trackingNumber: `MAN-${orderId.slice(-6).toUpperCase() || 'TRK'}`,
      orderDate: newOrderDate,
      status: newStatus,
      items: [newItem],
      priceTotal: cleanPrice,
      shippingAddress: "Manjit's Residence, New Delhi, India",
      estimatedArrival: newStatus === 'delivered' ? `Delivered on ${newOrderDate}` : "Standard ground transition",
      courierName: "Self-Managed Delivery",
      courierPhone: "+91 99999 99999",
      history,
      platform: newBrand,
      category: newCategory,
      returnEligible: newStatus === 'delivered',
      returnDeadline: calculatedDeadline,
      returnStatus: 'not_returned',
      refundStatus: 'none',
      warrantyDurationMonths: cleanMonths > 0 ? cleanMonths : null,
      warrantyExpiryDate: calculatedExpiryStr,
      warrantyStatus: computedWarrantyStatus,
      serialNumber: cleanMonths > 0 ? `SN-MAN-${orderId.slice(-4).toUpperCase()}` : null,
      productUrl: getWebProductUrl(newBrand, newItemName, newProductUrl.trim()),
      invoiceUrl: newInvoiceUrl.trim() || null,
      notes: newNotes.trim()
    };

    onUpdateOrders([newCreatedOrder, ...orders]);
    onSelectOrderId(newCreatedOrder.id);
    
    // Reset Form
    setNewOrderId('');
    setNewItemName('');
    setNewItemPrice('');
    setNewProductUrl('');
    setNewInvoiceUrl('');
    setNewNotes('');
    setShowAddForm(false);
  };

  // Handler: Manual Return Date Update on existing order
  const handleSaveManualReturnDate = (orderId: string, customDate: string) => {
    if (!customDate) return;
    const updated = orders.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          returnDeadline: customDate,
          returnEligible: true
        };
      }
      return o;
    });
    onUpdateOrders(updated);
  };

  // Handler: Mark Delivered order as Returned manually
  const handleMarkAsReturned = (orderId: string) => {
    const updated = orders.map(o => {
      if (o.id === orderId) {
        // Trigger callback to also register a Return Request in the Exchanges Manager list
        const mainItem = o.items[0];
        onInitiateReturn({
          orderId: o.id,
          productName: mainItem?.name || "E-Commerce Package",
          returnReason: "Returned manually by customer",
          details: "Mailed via ground parcel pre-authorized dispatch code",
          refundMethod: 'original_payment'
        });

        return {
          ...o,
          returnStatus: 'refunded',
          refundStatus: 'completed',
          refundAmount: o.priceTotal,
          refundDate: new Date().toISOString().slice(0, 10),
          status: 'delivered' as OrderStatus
        };
      }
      return o;
    });
    onUpdateOrders(updated);
  };

  // Handler: Edit/Update Warranty details on existing order
  const handleUpdateManualWarranty = (orderId: string, months: number, expiryDateStr: string) => {
    const updated = orders.map(o => {
      if (o.id === orderId) {
        let wrnStatus = 'none';
        if (expiryDateStr) {
          const exp = new Date(expiryDateStr);
          wrnStatus = exp >= new Date() ? 'active' : 'expired';
          
          // Also register warranty callback to populates in WarrantyManager claims tab
          onRegisterWarranty({
            orderId: o.id,
            productName: o.items[0]?.name || "E-commerce Unit",
            serialNumber: o.serialNumber || `SN-${o.id.slice(-4).toUpperCase()}`,
            purchaseDate: o.orderDate,
            durationMonths: months,
            platform: o.platform
          });
        }

        return {
          ...o,
          warrantyDurationMonths: months,
          warrantyExpiryDate: expiryDateStr,
          warrantyStatus: wrnStatus,
          serialNumber: o.serialNumber || `SN-${o.id.slice(-4).toUpperCase()}`
        };
      }
      return o;
    });
    onUpdateOrders(updated);
  };

  // Handler: Update private notes on order
  const handleNotesChange = (orderId: string, txt: string) => {
    const updated = orders.map(o => {
      if (o.id === orderId) {
        return { ...o, notes: txt };
      }
      return o;
    });
    onUpdateOrders(updated);
  };

  // Handler: Save Invoice URL
  const handleSaveInvoiceUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoiceOrderId) return;
    const updated = orders.map(o => {
      if (o.id === editingInvoiceOrderId) {
        return { ...o, invoiceUrl: editInvoiceUrlVal.trim() || null };
      }
      return o;
    });
    onUpdateOrders(updated);
    setEditingInvoiceOrderId(null);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto anim-fade">
      
      {/* PAGE INTRO HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Purchase Logs Archive</h2>
          <p className="text-xs text-slate-500 leading-normal mt-0.5">Filter, search, review details, edit warranties, file invoices, and record return windows.</p>
        </div>

        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow-xs flex items-center gap-1.5 shrink-0"
        >
          {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span>{showAddForm ? "Collapse Form" : "Log Manual Order"}</span>
        </button>
      </div>

      {/* MANUAL ORDER ADD FORM ACCORDION BLOCK */}
      {showAddForm && (
        <form onSubmit={handleAddPurchaseSubmit} className="bg-slate-50 border border-blue-100 rounded-2xl p-6 shadow-xs anim-fade space-y-4 max-w-4xl">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-205">
            <span className="text-sm">📥</span>
            <div>
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest font-mono">Manual Order Logging Ledger</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Logs physical purchase dates for warranty reminder alarms and tracking.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 font-mono text-[10px] uppercase">Store Brand / Platform</label>
              <select 
                value={newBrand} 
                onChange={(e) => setNewBrand(e.target.value)}
                className="w-full bg-white border border-slate-205 rounded-xl py-2 px-3 focus:outline-hidden"
              >
                <option value="Amazon">Amazon</option>
                <option value="Myntra">Myntra</option>
                <option value="Flipkart">Flipkart</option>
                <option value="AJIO">AJIO</option>
                <option value="Croma">Croma</option>
                <option value="Reliance Digital">Reliance Digital</option>
                <option value="Other Stores">Other Retailers</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 font-mono text-[10px] uppercase">Order / Tracking ID</label>
              <input 
                type="text" 
                required
                placeholder="e.g. OD405908200"
                value={newOrderId} 
                onChange={(e) => setNewOrderId(e.target.value)}
                className="w-full bg-white border border-slate-205 rounded-xl py-2 px-3 focus:outline-hidden font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 font-mono text-[10px] uppercase">Product Name</label>
              <input 
                type="text" 
                required
                placeholder="e.g. Sony HT-S40R Cinema Soundbar"
                value={newItemName} 
                onChange={(e) => setNewItemName(e.target.value)}
                className="w-full bg-white border border-slate-205 rounded-xl py-2 px-3 focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 font-mono text-[10px] uppercase">Purchase Date</label>
              <input 
                type="date" 
                value={newOrderDate} 
                onChange={(e) => setNewOrderDate(e.target.value)}
                className="w-full bg-white border border-slate-205 rounded-xl py-2 px-3 focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 font-mono text-[10px] uppercase">Price Total (INR)</label>
              <input 
                type="number" 
                placeholder="e.g. 18990"
                value={newItemPrice} 
                onChange={(e) => setNewItemPrice(e.target.value)}
                className="w-full bg-white border border-slate-205 rounded-xl py-2 px-3 focus:outline-hidden font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 font-mono text-[10px] uppercase">Product Category</label>
              <select 
                value={newCategory} 
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full bg-white border border-slate-205 rounded-xl py-2 px-3 focus:outline-hidden"
              >
                <option value="Electronics">Electronics</option>
                <option value="Fashion">Fashion</option>
                <option value="Home">Home & Living</option>
                <option value="Groceries">Groceries</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-1.5 font-mono">
              <label className="font-bold text-slate-700 font-mono text-[10px] uppercase">Warranty Duration (Months)</label>
              <input 
                type="number" 
                placeholder="e.g. 12 (0 for none)"
                value={newWarrantyMonths} 
                onChange={(e) => setNewWarrantyMonths(e.target.value)}
                className="w-full bg-white border border-slate-205 rounded-xl py-2 px-3 focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 font-mono text-[10px] uppercase">Product Page Link (Optional)</label>
              <input 
                type="url" 
                placeholder={newBrand === 'Flipkart' ? 'e.g. https://www.flipkart.com/... (auto-generated if empty)' : newBrand === 'Amazon' ? 'e.g. https://www.amazon.in/dp/... (auto-generated if empty)' : 'e.g. Product web link (auto-generated if empty)'}
                value={newProductUrl} 
                onChange={(e) => setNewProductUrl(e.target.value)}
                className="w-full bg-white border border-slate-205 rounded-xl py-2 px-3 focus:outline-hidden text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 font-mono text-[10px] uppercase">Invoice Link/PDF (Optional)</label>
              <input 
                type="text" 
                placeholder="e.g. Link, S3 PDF, or URL"
                value={newInvoiceUrl} 
                onChange={(e) => setNewInvoiceUrl(e.target.value)}
                className="w-full bg-white border border-slate-205 rounded-xl py-2 px-3 focus:outline-hidden"
              />
            </div>

          </div>

          <div className="space-y-1.5 font-sans">
            <label className="font-bold text-slate-700 font-mono text-[10px] uppercase block">Purchase Memo notes</label>
            <textarea 
              rows={2}
              placeholder="Store order location, delivery code notes, receipt codes, or comments..."
              value={newNotes} 
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full bg-white border border-slate-205 rounded-xl py-2 px-3 text-xs focus:outline-hidden"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button 
              type="button" 
              onClick={() => setShowAddForm(false)}
              className="cursor-pointer bg-slate-200 text-slate-750 font-semibold px-4 py-2 rounded-lg"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="cursor-pointer bg-slate-900 border border-slate-900 hover:bg-slate-850 text-white font-bold px-5 py-2 rounded-lg"
            >
              Add Ledger Item
            </button>
          </div>
        </form>
      )}

      {/* SEARCH AND FILTERS CONTROLS AREA */}
      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-2xs flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
        
        {/* Search */}
        <div className="relative w-full md:max-w-xs flex items-center">
          <span className="absolute left-3 text-slate-400">
            <Search className="w-3.5 h-3.5" />
          </span>
          <input
            type="text"
            placeholder="Search by Product name, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-205 rounded-xl py-2 pl-9 pr-3 focus:outline-hidden focus:bg-white"
          />
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 md:flex md:flex-wrap items-center gap-3 w-full md:w-auto">
          
          <div className="flex items-center justify-between sm:justify-start gap-1.5 w-full sm:w-auto">
            <span className="text-slate-400 font-mono text-[10px] uppercase shrink-0">Platform:</span>
            <select
              value={selPlatform}
              onChange={(e) => setSelPlatform(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-hidden w-full sm:w-auto text-xs font-medium"
            >
              {platformsList.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-1.5 w-full sm:w-auto">
            <span className="text-slate-400 font-mono text-[10px] uppercase shrink-0">Status:</span>
            <select
              value={selStatus}
              onChange={(e) => setSelStatus(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-hidden w-full sm:w-auto text-xs font-medium"
            >
              <option value="All">All</option>
              <option value="Ordered">Ordered (Processing)</option>
              <option value="Shipped">Shipped / Transit</option>
              <option value="Delivered">Delivered Only</option>
              <option value="Return Requested">Returned / Refunded</option>
            </select>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-1.5 w-full sm:w-auto">
            <span className="text-slate-400 font-mono text-[10px] uppercase shrink-0">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-hidden w-full sm:w-auto text-xs font-medium"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="price_high">Price: High to Low</option>
              <option value="price_low">Price: Low to High</option>
            </select>
          </div>

        </div>

      </div>

      {/* SPLIT SYSTEM: LEFT SIDE ORDERS, RIGHT SIDE DETAILED DRAWER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: LISTING */}
        <div className={`lg:col-span-6 space-y-3 ${mobileView === 'detail' ? 'hidden lg:block' : 'block'}`}>
          {filteredOrders.length === 0 ? (
            <div className="bg-white border border-slate-200 p-12 text-center rounded-2xl flex flex-col items-center justify-center">
              <Package className="w-10 h-10 text-slate-300 mb-2" />
              <p className="font-semibold text-slate-800 text-xs">No Matches Mapped</p>
              <p className="text-slate-400 text-[11px] max-w-sm mt-1 leading-normal">Double check your filters or sync with your Gmail account to extract your direct purchase inbox data.</p>
            </div>
          ) : (
            filteredOrders.map(order => {
              const representsSelected = order.id === selectedOrder?.id;
              const mainProduct = order.items[0];
              
              // Count remaining items if any
              const totalItemsCount = order.items.reduce((acc, current) => acc + current.quantity, 0);

              // Get status tags
              return (
                <div 
                  key={order.id}
                  onClick={() => {
                    onSelectOrderId(order.id);
                    setMobileView('detail');
                  }}
                  className={`border rounded-xl p-4 transition-all duration-300 text-left cursor-pointer relative overflow-hidden group ${
                    representsSelected 
                      ? 'bg-blue-50/20 border-blue-600 shadow-md ring-1 ring-blue-500/10' 
                      : 'bg-white border-slate-200 hover:border-slate-350 shadow-sm hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1 flex-1 min-w-[200px]">
                      
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] font-bold text-slate-450 uppercase">{order.id}</span>
                        <PlatformBadge platform={order.platform} />
                        {order.category && (
                          <span className="text-[9px] bg-slate-100 text-slate-500 font-semibold px-2 py-0.2 rounded uppercase">
                            {order.category}
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-slate-900 text-xs mt-1 leading-snug group-hover:text-blue-600 transition truncate max-w-[280px]">
                        {mainProduct?.name || 'Unknown Article'}
                      </h4>
                      
                      {order.items.length > 1 && (
                        <p className="text-[10px] font-semibold text-blue-550">
                          + {order.items.length - 1} other item{order.items.length > 2 ? 's' : ''} in package
                        </p>
                      )}

                      <div className="flex items-center gap-3 pt-3 text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-slate-350" /> Ordered {order.orderDate}</span>
                        <span>•</span>
                        <span className="font-sans font-bold text-slate-800">₹{order.priceTotal.toLocaleString('en-IN')}</span>
                      </div>

                    </div>

                    <div className="text-right flex flex-col items-end justify-between self-stretch shrink-0">
                      
                      {/* Active status representation label */}
                      <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        order.status === 'delivered' ? 'bg-slate-100 text-slate-700' :
                        order.status === 'out_for_delivery' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                        'bg-blue-50 text-blue-600 border border-blue-105'
                      }`}>
                        {order.status}
                      </span>

                      {/* Display deadlines warnings in line */}
                      {order.returnDeadline && order.returnStatus === 'not_returned' && order.status === 'delivered' && (
                        <span className="text-[9px] text-amber-600 font-semibold font-mono mt-2 bg-amber-50 px-1.5 py-0.5 rounded">
                          Return window: {new Date(order.returnDeadline).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}
                        </span>
                      )}

                      {order.warrantyExpiryDate && order.warrantyStatus === 'active' && (
                        <span className="text-[9px] text-emerald-600 font-semibold font-mono mt-2 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Warranty: {new Date(order.warrantyExpiryDate).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}
                        </span>
                      )}

                      {order.returnStatus === 'refunded' && (
                        <span className="text-[9px] text-emerald-600 font-bold uppercase font-mono mt-2">
                          🔄 REFUNDED
                        </span>
                      )}

                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT COLUMN: DETAILED DRAWERS */}
        <div className={`lg:col-span-6 ${mobileView === 'list' ? 'hidden lg:block' : 'block'}`}>
          {/* Back button for mobile view */}
          <button
            onClick={() => setMobileView('list')}
            className="lg:hidden flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-4 py-3 rounded-xl transition mb-4 shadow-2xs w-full justify-center border border-slate-200/60 font-mono uppercase tracking-wider"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Back to Orders List</span>
          </button>

          {selectedOrder ? (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6 text-left anim-fade relative">
              
              <div className="flex items-center justify-between pb-4 border-b border-slate-150">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <PlatformBadge platform={selectedOrder.platform} />
                    <span className="font-mono text-[10px] text-slate-400 font-bold">LNK-ID: {selectedOrder.id}</span>
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 mt-1.5 tracking-tight flex items-center gap-1.5">
                    Order Details & Coverage
                  </h3>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-mono">EST TOTAL</span>
                  <span className="text-lg font-black text-slate-950 font-sans leading-none block">
                    ₹{selectedOrder.priceTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* PRODUCT IMAGES & INFO DETAILS */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Order Items</h4>
                {selectedOrder.items.map((item, idx) => {
                  const itemProductUrl = getWebProductUrl(
                    selectedOrder.platform,
                    item.name,
                    idx === 0 ? selectedOrder.productUrl : null,
                    selectedOrder.trackingNumber
                  );
                  
                  return (
                    <div key={item.id || idx} className="flex items-start gap-4 p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition">
                      <span className="relative shrink-0 flex items-center justify-center leading-none select-none">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-14 h-14 object-cover rounded-lg border border-slate-150 shadow-2xs"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallbackIcon = e.currentTarget.parentElement?.querySelector('.fallback-emoji');
                              if (fallbackIcon) {
                                fallbackIcon.classList.remove('hidden');
                              }
                            }}
                          />
                        ) : null}
                        <span className={`text-3xl p-2 bg-slate-50 border border-slate-100 rounded-lg fallback-emoji ${item.imageUrl ? 'hidden' : ''}`}>
                          {getProductEmoji(item.name || '')}
                        </span>
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 leading-snug break-words">{item.name || 'Unknown Item'}</h4>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                          <span className="text-[10px] text-slate-400 font-mono uppercase">
                            QTY: <strong className="text-slate-600 font-bold">{item.quantity || 1}</strong>
                          </span>
                          {item.priceKnown !== false && item.price > 0 && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-[10px] text-slate-400 font-mono uppercase">
                                Price: <strong className="text-slate-600 font-bold">₹{item.price.toLocaleString('en-IN')}</strong>
                              </span>
                            </>
                          )}
                          {item.seller && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-[10px] text-slate-400 font-mono uppercase">
                                Seller: <strong className="text-slate-600 font-bold">{item.seller}</strong>
                              </span>
                            </>
                          )}
                          {item.deliveryEstimate && (
                            <span className="w-full text-[10px] text-slate-500 mt-1">
                              Delivery estimate: {item.deliveryEstimate}
                            </span>
                          )}
                          {selectedOrder.category && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-[10px] text-slate-400 font-mono uppercase">
                                Category: <strong className="text-slate-600 font-bold">{selectedOrder.category}</strong>
                              </span>
                            </>
                          )}
                        </div>
                        
                        {itemProductUrl && (
                          <a 
                            href={itemProductUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline mt-1.5 transition"
                            title={`View on ${selectedOrder.platform || 'Store'}`}
                          >
                            <span>Web Product URL</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider font-mono">Order status & delivery</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider block font-mono">Current status</span>
                    <span className="font-semibold text-slate-800 block mt-1">{selectedOrder.status.replace(/_/g, ' ')}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider block font-mono">Delivery</span>
                    <span className="font-semibold text-slate-800 block mt-1">
                      {selectedOrder.actualDeliveryDate
                        ? `Delivered on ${new Date(selectedOrder.actualDeliveryDate).toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'})}`
                        : selectedOrder.estimatedArrival
                          ? `Expected ${new Date(selectedOrder.estimatedArrival).toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'})}`
                          : 'Date not confirmed in email'}
                    </span>
                  </div>
                </div>
              </div>

              {/* RETURN DATE AND MANAGE RETURN DETAILS CARD */}
              <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 font-mono">
                    <ArrowLeftRight className="w-4 h-4 text-rose-550" />
                    Return Policy & Refunds
                  </h4>
                  
                  {selectedOrder.returnDeadline ? (
                    <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-110 font-bold font-mono px-2 py-0.5 rounded">
                      Deadline Mapped
                    </span>
                  ) : (
                    <span className="text-[9px] bg-slate-100 text-slate-500 font-mono font-bold px-2 py-0.5 rounded">
                      Deadline Absent
                    </span>
                  )}
                </div>

                {selectedOrder.status === 'delivered' ? (
                  <div className="space-y-4 text-xs">
                    
                    {selectedOrder.returnStatus === 'refunded' ? (
                      <div className="bg-emerald-50 border border-emerald-150 p-3 rounded-lg text-[11px] text-emerald-800 space-y-1">
                        <p className="font-bold">✓ This order has been Returned & Refunded</p>
                        <p className="text-emerald-700 font-mono">Refund Disbursed: ₹{selectedOrder.refundAmount?.toLocaleString('en-IN')} on {selectedOrder.refundDate || selectedOrder.orderDate}</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider block font-mono">Return Eligibility</span>
                            <span className="font-semibold text-slate-800 block mt-0.5">
                              {selectedOrder.returnEligible === true
                                ? 'Eligible according to email details'
                                : selectedOrder.returnEligible === false
                                  ? 'Not eligible according to email details'
                                  : 'Eligibility not confirmed in email'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider block font-mono">Deadline Date</span>
                            <span className="font-mono text-slate-800 block mt-0.5 font-bold">
                              {selectedOrder.returnDeadline ? new Date(selectedOrder.returnDeadline).toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'}) : "No deadline stated in email"}
                            </span>
                          </div>
                        </div>
                        {selectedOrder.returnPolicyText && (
                          <p className="text-[10px] text-slate-500">{selectedOrder.returnPolicyText}</p>
                        )}

                        {/* Edit manual Return Date form */}
                        <div className="pt-2 border-t border-slate-200 space-y-2">
                          <label className="text-[9px] text-slate-450 font-bold uppercase tracking-wider block font-mono">Add / Edit Return Deadline Date</label>
                          <div className="flex gap-2">
                            <input 
                              type="date" 
                              defaultValue={selectedOrder.returnDeadline || ''}
                              onChange={(e) => handleSaveManualReturnDate(selectedOrder.id, e.target.value)}
                              className="bg-white border border-slate-205 rounded-lg p-1.5 font-mono text-xs focus:outline-hidden"
                            />
                            <button 
                              onClick={() => handleMarkAsReturned(selectedOrder.id)}
                              className="cursor-pointer bg-slate-900 text-white font-bold text-[10px] px-3.5 rounded-lg hover:bg-slate-800 transition"
                            >
                              Mark as Returned
                            </button>
                          </div>
                          <p className="text-[9px] text-slate-400">Updating this field will register standard alerts on the dashboard and in the active notifications banner.</p>
                        </div>
                      </>
                    )}

                  </div>
                ) : (
                  <p className="text-[11px] text-slate-450 italic leading-relaxed">Return settings will unlock once parcel is marked Delivered.</p>
                )}
              </div>

              {/* WARRANTY MANAGEMENT CARD */}
              <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-xl space-y-4">
                
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 font-mono">
                    <Shield className="w-4 h-4 text-emerald-600" />
                    Product Warranty Coverage
                  </h4>
                  
                  {selectedOrder.warrantyStatus === 'active' ? (
                    <span className="className text-[9px] bg-emerald-50 text-emerald-700 font-bold uppercase px-2 py-0.5 rounded font-mono">
                      Active Safe
                    </span>
                  ) : selectedOrder.warrantyStatus === 'expired' ? (
                    <span className="text-[9px] bg-rose-50 text-rose-600 font-bold uppercase px-2 py-0.5 rounded font-mono">
                      Expired
                    </span>
                  ) : (
                    <span className="text-[9px] bg-slate-100 text-slate-450 px-2 py-0.5 rounded font-mono">
                      No warranty registered
                    </span>
                  )}
                </div>

                <div className="space-y-4 text-xs">
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider block font-mono">Duration Months</span>
                      <span className="font-semibold text-slate-800 block mt-0.5">
                        {selectedOrder.warrantyDurationMonths ? `${selectedOrder.warrantyDurationMonths} Months Coverage` : "Not Mapped / Lifetime Only"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider block font-mono">Expiry Date</span>
                      <span className="font-mono text-slate-800 block mt-0.5 font-bold">
                        {selectedOrder.warrantyExpiryDate ? new Date(selectedOrder.warrantyExpiryDate).toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'}) : "Unassigned"}
                      </span>
                    </div>
                  </div>

                  {/* Manual Warranty editor */}
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <span className="text-[9px] text-slate-400 font-semibold font-mono block">Modify Warranty Interval Parameters:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[8px] text-slate-450 font-mono block uppercase">Duration Months</label>
                        <select 
                          defaultValue={selectedOrder.warrantyDurationMonths || '12'}
                          onChange={(e) => {
                            const months = parseInt(e.target.value);
                            const pDate = new Date(selectedOrder.orderDate);
                            pDate.setMonth(pDate.getMonth() + months);
                            const expStr = pDate.toISOString().slice(0, 10);
                            handleUpdateManualWarranty(selectedOrder.id, months, expStr);
                          }}
                          className="w-full bg-white border border-slate-205 rounded-lg p-1.5 focus:outline-hidden"
                        >
                          <option value="6">6 Months</option>
                          <option value="12">12 Months (1 Year)</option>
                          <option value="24">24 Months (2 Years)</option>
                          <option value="36">36 Months (3 Years)</option>
                          <option value="60">60 Months (5 Years)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[8px] text-slate-450 font-mono block uppercase">Expiry Date</label>
                        <input 
                          type="date"
                          value={selectedOrder.warrantyExpiryDate || ''}
                          onChange={(e) => {
                            const exp = e.target.value;
                            const months = selectedOrder.warrantyDurationMonths || 12;
                            handleUpdateManualWarranty(selectedOrder.id, months, exp);
                          }}
                          className="w-full bg-white border border-slate-205 rounded-lg p-1.5 focus:outline-hidden font-mono text-[11px]"
                        />
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* INVOICE & DOCUMENT ARCHIVE CARD */}
              <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 font-mono">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Invoices & PDFs Receipts
                  </h4>
                  <button 
                    onClick={() => {
                      setEditingInvoiceOrderId(selectedOrder.id);
                      setEditInvoiceUrlVal(selectedOrder.invoiceUrl || '');
                    }}
                    className="cursor-pointer text-[10px] font-bold text-blue-550 hover:underline flex items-center gap-1 font-sans"
                  >
                    <Edit className="w-3 h-3" />
                    <span>Upload Link</span>
                  </button>
                </div>

                {editingInvoiceOrderId === selectedOrder.id ? (
                  <form onSubmit={handleSaveInvoiceUrl} className="space-y-2 border-t border-slate-200 pt-2 anim-fade">
                    <input 
                      type="url"
                      placeholder="Paste PDF Link or Invoice cloud URL..."
                      value={editInvoiceUrlVal}
                      onChange={(e) => setEditInvoiceUrlVal(e.target.value)}
                      className="w-full bg-white border border-slate-205 rounded-lg p-1.5 text-xs focus:outline-hidden"
                    />
                    <div className="flex justify-end gap-2 text-[10px]">
                      <button 
                        type="button" 
                        onClick={() => setEditingInvoiceOrderId(null)}
                        className="cursor-pointer bg-slate-200 text-slate-700 font-bold px-3 py-1 rounded"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1 rounded"
                      >
                        Save Invoice
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center gap-2">
                      <FileClock className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-700 font-mono text-[11px] truncate max-w-[200px]">
                        {selectedOrder.invoiceUrl ? selectedOrder.invoiceUrl : "No Receipt Attachment"}
                      </span>
                    </div>

                    {selectedOrder.invoiceUrl ? (
                      <div className="flex gap-2">
                        <a 
                          href={selectedOrder.invoiceUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          className="cursor-pointer bg-white border border-slate-200 text-slate-700 hover:text-blue-600 hover:border-slate-350 p-1.5 rounded-lg transition"
                          title="View PDF invoice in a new gateway tab"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Invoice Offline</span>
                    )}
                  </div>
                )}
              </div>

              {/* PERSISTENT MEMO USER NOTES WRITER */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 font-mono">
                  <MessageSquare className="w-4 h-4 text-blue-550" />
                  Private Purchase Memo / Notes
                </h4>
                <textarea 
                  rows={2}
                  maxLength={1000}
                  placeholder="Annotate refund queries, device issues, vendor contacts, or coupon codes. Autosaves automatically..."
                  value={selectedOrder.notes || ''}
                  onChange={(e) => handleNotesChange(selectedOrder.id, e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/80 p-3 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:bg-white"
                />
              </div>

            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 p-16 text-center rounded-2xl flex flex-col items-center justify-center h-full">
              <Info className="w-10 h-10 text-slate-300 mb-2" />
              <p className="font-semibold text-slate-800 text-xs text-center">No Active Order Selected</p>
              <p className="text-slate-400 text-[11px] max-w-sm mt-1 text-center font-sans">Select any product on the left portal list to reveal deep warranty specifications, invoices uploads, and refund timelines.</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
