import React from 'react';
import { 
  Package, Calendar, Shield, ArrowLeftRight, CheckCircle2, 
  Clock, DollarSign, ArrowUpRight, Sparkles, TrendingUp, 
  TrendingDown, ShoppingBag, Eye, HelpCircle, Mail, AlertTriangle, Info, Bell
} from 'lucide-react';
import { Order, ReturnRequest, Warranty } from '../types';
import { PlatformBadge } from '../App';

interface OrdersDashboardProps {
  orders: Order[];
  returns: ReturnRequest[];
  warranties: Warranty[];
  onNavigateToTab: (tab: 'orders' | 'warranty' | 'returns' | 'gmail-sync') => void;
  onSelectOrder: (orderId: string) => void;
}

export default function OrdersDashboard({ 
  orders, 
  returns, 
  warranties, 
  onNavigateToTab,
  onSelectOrder
}: OrdersDashboardProps) {

  // Dates anchor: 2026-06-17. Let's calculate:
  const anchorDateStr = "2026-06-17";
  const anchorDate = new Date(anchorDateStr);

  // Stats Counters
  const totalOrdersCount = orders.length;
  
  // Total Spent
  const totalSpent = orders.reduce((sum, o) => sum + o.priceTotal, 0);

  // Orders This Month (June 2026)
  const ordersThisMonth = orders.filter(o => {
    if (!o.orderDate) return false;
    return o.orderDate.startsWith('2026-06');
  });
  const spentThisMonth = ordersThisMonth.reduce((sum, o) => sum + o.priceTotal, 0);

  // Active Returns
  const activeReturns = returns.filter(r => r.status !== 'refunded');

  // Pending Refunds
  const pendingRefunds = orders.filter(o => 
    o.refundStatus && ['initiated', 'processed'].includes(o.refundStatus)
  );

  // Active Warranties
  const activeWarranties = warranties.filter(w => w.status === 'active');

  // Warranty Expiring Soon (within 60 days of June 17, 2026)
  const warrantiesExpiringSoon = warranties.filter(w => {
    if (w.status !== 'active' || !w.warrantyExpiryDate) return false;
    const exp = new Date(w.warrantyExpiryDate);
    const diffMs = exp.getTime() - anchorDate.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 60;
  });

  // Categories spending
  const categorySpent: { [key: string]: number } = {
    'Electronics': 0,
    'Fashion': 0,
    'Home': 0,
    'Groceries': 0,
    'Other': 0
  };
  orders.forEach(o => {
    const cat = o.category || 'Other';
    const cleanCat = categorySpent[cat] !== undefined ? cat : 'Other';
    categorySpent[cleanCat] += o.priceTotal;
  });

  // Platforms spending
  const platformSpent: { [key: string]: number } = {};
  orders.forEach(o => {
    if (o.platform) {
      platformSpent[o.platform] = (platformSpent[o.platform] || 0) + o.priceTotal;
    }
  });

  // Formulate notifications
  const dynamicNotifications: { id: string, type: 'alert' | 'success' | 'info', title: string, message: string, linkTab: 'orders' | 'warranty' | 'returns', linkId?: string }[] = [];

  // 1. Returns expiring notifications
  orders.forEach(o => {
    if (o.status === 'delivered' && o.returnDeadline && o.returnStatus === 'not_returned') {
      const deadline = new Date(o.returnDeadline);
      const diffMs = deadline.getTime() - anchorDate.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0 && diffDays <= 15) {
        dynamicNotifications.push({
          id: `ret-exp-${o.id}`,
          type: diffDays <= 3 ? 'alert' : 'info',
          title: `Return Deadline Approaching`,
          message: `Your ${o.platform || 'store'} order for "${o.items[0]?.name || 'Apparel'}" can be returned until ${new Date(o.returnDeadline).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})} (${diffDays} days left).`,
          linkTab: 'orders',
          linkId: o.id
        });
      }
    }
  });

  // 2. Pending refunds
  orders.forEach(o => {
    if (o.refundStatus && ['initiated', 'processed'].includes(o.refundStatus)) {
      dynamicNotifications.push({
        id: `ref-pend-${o.id}`,
        type: 'info',
        title: `Refund Pending`,
        message: `Refund of ₹${(o.refundAmount || o.priceTotal).toLocaleString('en-IN')} from ${o.platform} for "${o.items[0]?.name}" is still pending processing.`,
        linkTab: 'returns'
      });
    }
  });

  // 3. Warranty expiring soon
  warranties.forEach(w => {
    if (w.status === 'active' && w.warrantyExpiryDate) {
      const exp = new Date(w.warrantyExpiryDate);
      const diffMs = exp.getTime() - anchorDate.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0 && diffDays <= 45) {
        dynamicNotifications.push({
          id: `wrn-exp-${w.id}`,
          type: 'alert',
          title: `Warranty Expiring Soon`,
          message: `Warranty coverage for "${w.productName}" purchased on ${new Date(w.purchaseDate).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})} expires in ${diffDays} days.`,
          linkTab: 'warranty'
        });
      }
    }
  });

  // 4. In Transit / Out for delivery notifications
  orders.forEach(o => {
    if (o.status === 'dispatched' || o.status === 'in_transit' || o.status === 'out_for_delivery') {
      const isOut = o.status === 'out_for_delivery';
      dynamicNotifications.push({
        id: `ship-status-${o.id}`,
        type: isOut ? 'alert' : 'info',
        title: isOut ? 'Out for Delivery Run' : 'Order Shipped & Transit Tracking',
        message: `Your ${o.platform} package for "${o.items[0]?.name}" is ${isOut ? 'loaded and out for delivery today' : 'on the courier transit route'}.`,
        linkTab: 'orders',
        linkId: o.id
      });
    }
  });

  // Limit notifications to display
  const displayNotifications = dynamicNotifications.slice(0, 5);

  return (
    <div className="space-y-6 max-w-7xl mx-auto anim-fade">
      
      {/* SECTION 1: HEADER SUMMARY GRIDS */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Total Purchases</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-900">{totalOrdersCount}</span>
            <span className="text-[9px] text-slate-400 font-mono">Items Ingested</span>
          </div>
          <div className="mt-2 text-[9px] bg-slate-50 border border-slate-100 p-1 rounded font-mono text-slate-500">
            Total Spend: <strong className="text-slate-800">₹{Math.round(totalSpent).toLocaleString('en-IN')}</strong>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Spent This Month</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-blue-600">₹{Math.round(spentThisMonth).toLocaleString('en-IN')}</span>
          </div>
          <div className="mt-2 text-[9px] bg-blue-50/50 border border-blue-105 p-1 rounded font-mono text-blue-600">
            <strong>{ordersThisMonth.length}</strong> new orders in June
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Active Returns</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-rose-600">{activeReturns.length}</span>
            <span className="text-[9px] text-slate-400 font-mono">Pending</span>
          </div>
          <button 
            onClick={() => onNavigateToTab('returns')}
            className="cursor-pointer text-left w-full mt-2 text-[9px] hover:underline text-blue-550 font-semibold flex items-center justify-between"
          >
            <span>Exchanges & Details</span>
            <ArrowUpRight className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Pending Refunds</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-amber-600">{pendingRefunds.length}</span>
            <span className="text-[9px] text-slate-400 font-mono">Disbursing</span>
          </div>
          <div className="mt-2 text-[9px] bg-amber-50 p-1 rounded font-mono text-amber-700">
            Awaiting bank receipt
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Active Warranties</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-emerald-600">{activeWarranties.length}</span>
            <span className="text-[9px] text-slate-400 font-mono">Policies</span>
          </div>
          <button 
            onClick={() => onNavigateToTab('warranty')}
            className="cursor-pointer text-left w-full mt-2 text-[9px] hover:underline text-blue-550 font-semibold flex items-center justify-between"
          >
            <span>Claims Desk</span>
            <ArrowUpRight className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Warranty Expiring</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-xl font-bold ${warrantiesExpiringSoon.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
              {warrantiesExpiringSoon.length}
            </span>
            <span className="text-[9px] text-slate-400 font-mono">Under 60 days</span>
          </div>
          <div className="mt-2 text-[9px] bg-slate-50 border border-slate-100 p-1 rounded font-mono text-slate-500">
            Requires attention
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* SECTION 2: DYNAMIC IN-APP NOTIFICATIONS FEED */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-400" />
              Intelligence Notifications ({dynamicNotifications.length})
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">Anchor: Jun 17, 2026</span>
          </div>

          {displayNotifications.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center flex flex-col items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
              <p className="text-xs font-bold text-slate-800">All Systems Clear</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs">No imminent return deadlines, pending refunds, or warranty expiry warnings detected.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayNotifications.map((notif, index) => (
                <div 
                  key={notif.id}
                  className={`border rounded-xl p-4 bg-white shadow-2xs flex gap-3 transition-all hover:border-slate-350 cursor-pointer ${
                    notif.type === 'alert' ? 'border-amber-450 bg-amber-50/5' : 'border-slate-200'
                  }`}
                  onClick={() => {
                    if (notif.linkTab === 'orders' && notif.linkId) {
                      onSelectOrder(notif.linkId);
                      onNavigateToTab('orders');
                    } else {
                      onNavigateToTab(notif.linkTab);
                    }
                  }}
                >
                  <span className="text-lg mt-0.5 shrink-0 select-none">
                    {notif.type === 'alert' ? '⚠️' : notif.type === 'success' ? '✅' : '🔔'}
                  </span>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900 leading-tight flex items-center gap-1.5 flex-wrap">
                      {notif.title}
                      {notif.type === 'alert' && (
                        <span className="text-[8px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.2 rounded font-bold uppercase">URGENT</span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{notif.message}</p>
                    
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-550 hover:underline mt-1 pt-1 border-t border-slate-50 w-full">
                      <span>Take Action</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* QUICK MANUAL ENTRY ENTRY-WAY CARD */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-xs relative overflow-hidden">
            <div className="relative z-10 space-y-4">
              <span className="text-[9px] uppercase tracking-widest font-mono text-indigo-200 font-extrabold bg-indigo-500/20 py-1 px-2.5 rounded-full border border-indigo-500/30">
                Order Management
              </span>
              <div>
                <h4 className="text-sm font-semibold tracking-tight">Manual Purchase Entry</h4>
                <p className="text-xs text-indigo-200 mt-1 leading-relaxed">Purchased from other physical/online store nodes? Add manually to centralize invoices, warranties, and return reminders.</p>
              </div>
              <button 
                onClick={() => onNavigateToTab('orders')}
                className="cursor-pointer bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs tracking-tight px-4 py-2 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5"
              >
                <span>Add Purchase Receipt</span>
                <ArrowUpRight className="w-4 h-4 text-slate-800" />
              </button>
            </div>
            <div className="absolute right-[-10px] bottom-[-20px] opacity-10 font-bold text-[110px] font-sans pointer-events-none select-none select-none leading-none shrink-0">
              📥
            </div>
          </div>
        </div>

        {/* SECTION 3: ANALYTICS & SPENDING SPLITS */}
        <div className="lg:col-span-7 space-y-6">
          <div className="border-b border-slate-200 pb-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              Spend Analytics & Allocation Matrix
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* SPENDING BY PLATFORM GRAPH */}
            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-2xs space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-800">Platform Distribution</span>
                <span className="text-[10px] text-slate-400 font-mono">Sorted by spend value</span>
              </div>

              <div className="space-y-3 pt-2">
                {Object.entries(platformSpent)
                  .sort((a, b) => b[1] - a[1])
                  .map(([plat, amt]) => {
                    const percentage = totalSpent ? (amt / totalSpent) * 100 : 0;
                    return (
                      <div key={plat} className="text-xs space-y-1">
                        <div className="flex justify-between items-center text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <PlatformBadge platform={plat} />
                          </div>
                          <span className="font-mono font-bold text-slate-800">
                            ₹{Math.round(amt).toLocaleString('en-IN')}{" "}
                            <span className="text-slate-400 font-normal">({Math.round(percentage)}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              plat.toLowerCase() === 'amazon' ? 'bg-amber-500' :
                              plat.toLowerCase() === 'myntra' ? 'bg-pink-500' :
                              plat.toLowerCase() === 'ajio' ? 'bg-cyan-600' :
                              plat.toLowerCase() === 'flipkart' ? 'bg-blue-600' : 'bg-slate-600'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* SPENDING BY CATEGORY GRAPH */}
            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-2xs space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-800">Category Allocations</span>
                <span className="text-[10px] text-slate-400 font-mono">Assigned via invoice items</span>
              </div>

              <div className="space-y-3.5 pt-2">
                {Object.entries(categorySpent)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amt]) => {
                    const percentage = totalSpent ? (amt / totalSpent) * 100 : 0;
                    
                    // Emoji representation 
                    const emoji = cat === 'Electronics' ? '💻' : cat === 'Fashion' ? '👕' : cat === 'Home' ? '🏠' : cat === 'Groceries' ? '🥕' : '📦';
                    
                    return (
                      <div key={cat} className="text-xs space-y-1">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="font-medium text-slate-700 flex items-center gap-1">
                            <span className="select-none text-xs">{emoji}</span> {cat}
                          </span>
                          <span className="font-mono font-bold text-slate-800">
                            ₹{Math.round(amt).toLocaleString('en-IN')}{" "}
                            <span className="text-slate-400 font-normal">({Math.round(percentage)}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              cat === 'Electronics' ? 'bg-indigo-600' :
                              cat === 'Fashion' ? 'bg-indigo-400' :
                              cat === 'Home' ? 'bg-sky-500' :
                              cat === 'Groceries' ? 'bg-emerald-500' : 'bg-slate-450'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

          </div>

          {/* SPENDING MONTHLY TIMELINE TRENDS BAR CHART */}
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-2xs space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs font-bold text-slate-800 block">E-Store Monthly Order Ingestion</span>
                <span className="text-[10px] text-slate-400 mt-0.5 font-mono">Order volumes mapped chronologically</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md font-bold">
                Spend Peak is June 2026
              </span>
            </div>

            {/* Custom SVG/HTML Bar Diagram for Monthly trends */}
            <div className="pt-6 flex items-end justify-around h-36 border-b border-slate-100 pb-2">
              {[
                { month: 'Jan 2026', spend: 4200, count: 2 },
                { month: 'Feb 2026', spend: 8900, count: 4 },
                { month: 'Mar 2026', spend: 5800, count: 3 },
                { month: 'Apr 2026', spend: 11000, count: 5 },
                { month: 'May 2026', spend: totalSpent - spentThisMonth, count: orders.length - ordersThisMonth.length },
                { month: 'Jun 2026', spend: spentThisMonth, count: ordersThisMonth.length },
              ].map((item, idx) => {
                const maxSpend = 25000;
                const barHeight = Math.min(95, Math.max(15, (item.spend / maxSpend) * 100));
                
                return (
                  <div key={idx} className="flex flex-col items-center flex-1 group relative">
                    {/* Tooltip on hover */}
                    <div className="absolute top-[-44px] hidden group-hover:flex flex-col items-center bg-slate-900 text-white rounded text-[10px] px-2 py-1 z-20 whitespace-nowrap shadow-md pointer-events-none">
                      <p className="font-bold">₹{Math.round(item.spend).toLocaleString('en-IN')}</p>
                      <p className="text-[8px] text-slate-450">{item.count} order{item.count !== 1 ? 's' : ''}</p>
                    </div>

                    {/* Bar visual representation */}
                    <div className="w-8 sm:w-12 bg-slate-50 border border-slate-100 rounded-t-md hover:border-indigo-400 transition-all duration-300 flex items-end justify-center overflow-hidden h-24">
                      <div 
                        className={`w-full rounded-t-sm transition-all duration-500 ${
                          item.month === 'Jun 2026' ? 'bg-gradient-to-t from-blue-700 to-indigo-500' : 'bg-slate-400'
                        }`}
                        style={{ height: `${barHeight}%` }}
                      />
                    </div>

                    <span className="text-[9px] font-mono font-bold text-slate-400 mt-2 block tracking-tight truncate max-w-full">
                      {item.month}
                    </span>
                    <span className="text-[10px] font-sans font-bold text-slate-800 select-none block mt-0.5">
                      ₹{Math.round(item.spend / 100) / 10}k
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
