import React, { useState, useEffect, useRef } from 'react';
import { 
  Package, Truck, Calendar, DollarSign, Search, Shield, ShieldAlert, 
  ArrowLeftRight, CheckCircle2, MapPin, User, Mail, FileText, 
  Warehouse, ChevronRight, PlusCircle, AlertCircle, Phone, Clock, 
  ArrowRight, Inbox, RefreshCw, Sparkles, AlertTriangle, LayoutDashboard
} from 'lucide-react';

import { Order, Warranty, WarrantyClaim, ReturnRequest, OrderStatus } from './types';
import { INITIAL_ORDERS, INITIAL_WARRANTIES, INITIAL_WARRANTY_CLAIMS, INITIAL_RETURNS } from './data/mockData';
import OrdersDashboard from './components/OrdersDashboard';
import OrdersPage from './components/OrdersPage';
import WarrantyManager from './components/WarrantyManager';
import ReturnManager from './components/ReturnManager';
import GmailSyncManager from './components/GmailSyncManager';

export function PlatformBadge({ platform }: { platform?: string }) {
  if (!platform) return null;
  const p = platform.trim().toLowerCase();
  
  if (p === 'amazon') {
    return (
      <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-2xs shrink-0 select-none">
        <svg className="w-2.5 h-2.5 text-amber-600 fill-amber-500" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M 3.8 17.2 C 7.2 19.8 11.8 21.2 16.4 20 C 18.3 19.5 20.1 18.5 21.6 17.2 C 21.9 16.9 21.6 16.5 21.2 16.7 C 17.5 19 12.3 19.5 7.8 17.7 C 5.9 16.9 4.2 15.8 2.7 14.4 C 2.3 14.1 1.9 14.6 2.3 14.9 C 2.8 15.7 3.3 16.5 3.8 17.2 Z" className="fill-amber-600"/>
        </svg>
        <span className="text-amber-855 tracking-tight font-sans text-[9.5px] uppercase font-black">Amazon</span>
      </span>
    );
  }
  
  if (p === 'myntra') {
    return (
      <span className="inline-flex items-center gap-1 bg-pink-500/10 border border-pink-400/20 text-pink-850 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-2xs shrink-0 select-none">
        <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-tr from-pink-500 to-amber-500 flex items-center justify-center text-white text-[7px] font-black leading-none">
          M
        </span>
        <span className="text-pink-650 tracking-tight font-sans text-[9.5px] font-extrabold uppercase">Myntra</span>
      </span>
    );
  }
  
  if (p === 'flipkart' || p === 'fk' || p === 'flipkart.com') {
    return (
      <span className="inline-flex items-center gap-1 bg-blue-500/10 border border-blue-400/20 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-2xs shrink-0 select-none">
        <span className="w-2.5 h-2.5 rounded-xs bg-yellow-400 flex items-center justify-center text-blue-900 text-[8px] font-black leading-none">
          F
        </span>
        <span className="text-blue-700 tracking-tight font-sans text-[9.5px] font-extrabold uppercase">Flipkart</span>
      </span>
    );
  }
  
  if (p === 'ajio' || p === 'reliance ajio') {
    return (
      <span className="inline-flex items-center gap-1 bg-cyan-700/10 border border-cyan-400/25 text-cyan-950 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-2xs shrink-0 select-none">
        <span className="font-extrabold text-white text-[7px] bg-slate-900 rounded-xs px-0.5 leading-none">
          A
        </span>
        <span className="text-slate-800 tracking-tight font-mono text-[9.5px] font-black uppercase">AJIO</span>
      </span>
    );
  }
  
  return (
    <span className="inline-flex items-center gap-1 bg-slate-500/10 border border-slate-400/20 text-slate-700 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 select-none">
      <span className="text-slate-600 truncate max-w-[60px] font-mono text-[9px] uppercase">{platform}</span>
    </span>
  );
}

export default function App() {
  // Load State from LocalStorage or fallback to Mock Data
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('del_order_status_orders');
    if (saved) {
      const parsed = JSON.parse(saved) as Order[];
      // If the cached orders has less items than the latest extracted Gmail dataset, force upgrade
      if (parsed.length < INITIAL_ORDERS.length) {
        return INITIAL_ORDERS;
      }
      return parsed;
    }
    return INITIAL_ORDERS;
  });

  const [warranties, setWarranties] = useState<Warranty[]>(() => {
    const saved = localStorage.getItem('del_order_status_warranties');
    if (saved) {
      const parsed = JSON.parse(saved) as Warranty[];
      if (parsed.length < INITIAL_WARRANTIES.length) {
        return INITIAL_WARRANTIES;
      }
      return parsed;
    }
    return INITIAL_WARRANTIES;
  });

  const [claims, setClaims] = useState<WarrantyClaim[]>(() => {
    const saved = localStorage.getItem('del_order_status_claims');
    return saved ? JSON.parse(saved) : INITIAL_WARRANTY_CLAIMS;
  });

  const [returns, setReturns] = useState<ReturnRequest[]>(() => {
    const saved = localStorage.getItem('del_order_status_returns');
    if (saved) {
      const parsed = JSON.parse(saved) as ReturnRequest[];
      if (parsed.length < INITIAL_RETURNS.length) {
        return INITIAL_RETURNS;
      }
      return parsed;
    }
    return INITIAL_RETURNS;
  });

  // UI Navigation states
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'warranty' | 'returns' | 'gmail-sync'>('dashboard');
  const [selectedOrderId, setSelectedOrderId] = useState<string>(() => {
    return INITIAL_ORDERS[0]?.id || '';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSimulatingId, setIsSimulatingId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<{message: string, type: 'success' | 'info'} | null>(null);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('del_order_status_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('del_order_status_warranties', JSON.stringify(warranties));
  }, [warranties]);

  useEffect(() => {
    localStorage.setItem('del_order_status_claims', JSON.stringify(claims));
  }, [claims]);

  useEffect(() => {
    localStorage.setItem('del_order_status_returns', JSON.stringify(returns));
  }, [returns]);

  // Find currently selected order
  const selectedOrder = orders.find(o => o.id === selectedOrderId) || orders[0];

  // Simulation loop for live driver tracking movement
  useEffect(() => {
    if (!isSimulatingId) return;

    const interval = setInterval(() => {
      setOrders(prevOrders => {
        return prevOrders.map(order => {
          if (order.id !== isSimulatingId) return order;

          // Increment courier coordinate percentage
          const currentProgress = order.courierX || 0;
          if (currentProgress >= 100) {
            // Already delivered! Stop simulation.
            setIsSimulatingId(null);
            
            // Pop success toast
            setShowToast({
              message: `Order ${order.id} has reached destination and scanned delivered successfully!`,
              type: 'success'
            });

            // If selected order was completed, make sure state history updates
            const alreadyLoggedDelivered = order.history.some(h => h.status === 'delivered' && h.completed);
            if (alreadyLoggedDelivered) return order;

            const updatedHistory = order.history.map(item => {
              if (item.status === 'delivered') {
                return {
                  ...item,
                  completed: true,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " (Live scanned)"
                };
              }
              return { ...item, completed: true };
            });

            return {
              ...order,
              status: 'delivered' as OrderStatus,
              courierX: 100,
              history: updatedHistory,
              estimatedArrival: "Delivered just now"
            };
          }

          // Move the van forward by 4%
          const nextProgress = Math.min(100, currentProgress + 4);
          
          let nextStatus: OrderStatus = order.status;
          const updatedHistoryList = [...order.history];

          // Dynamically change status transition phases based on coordinates
          if (nextProgress >= 100) {
            nextStatus = 'delivered';
            const deliveredIdx = updatedHistoryList.findIndex(h => h.status === 'delivered');
            if (deliveredIdx !== -1) {
              updatedHistoryList[deliveredIdx] = {
                ...updatedHistoryList[deliveredIdx],
                completed: true,
                timestamp: new Date().toLocaleDateString() + " - " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              };
            }
          } else if (nextProgress > 75) {
            nextStatus = 'out_for_delivery';
          } else {
            nextStatus = 'in_transit';
          }

          return {
            ...order,
            courierX: nextProgress,
            status: nextStatus,
            history: updatedHistoryList.map(h => {
              // Ensure past statuses are completed
              const sequence = ['processing', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered'];
              const currentStepIdx = sequence.indexOf(nextStatus);
              const stepIdx = sequence.indexOf(h.status as any);
              if (stepIdx <= currentStepIdx && h.status !== 'delivered') {
                return { ...h, completed: true };
              }
              return h;
            })
          };
        });
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isSimulatingId]);

  // Clean success toast timer
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 5000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [showToast]);

  // Handles fast search bar selection (order ID or tracking number)
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toUpperCase();
    if (!query) return;

    // Look up by ID
    const matchById = orders.find(o => o.id.toUpperCase().includes(query));
    // Look up by tracking number
    const matchByTracking = orders.find(o => o.trackingNumber.toUpperCase().includes(query));

    const match = matchById || matchByTracking;
    if (match) {
      setSelectedOrderId(match.id);
      setActiveTab('tracking');
      setSearchQuery('');
      setShowToast({
        message: `Found and tracking order ${match.id}!`,
        type: 'info'
      });
    } else {
      alert(`No active order matching ID or Tracking No: "${query}" was found.`);
    }
  };

  // Add warranty registry entry state modifier
  const handleAddNewWarranty = (newW: Omit<Warranty, 'id' | 'status'>) => {
    const id = `WRN-${Math.floor(100000 + Math.random() * 900000)}`;
    let calculatedExpiry: string | null = null;
    if (newW.purchaseDate && newW.durationMonths) {
      const pDate = new Date(newW.purchaseDate);
      pDate.setMonth(pDate.getMonth() + newW.durationMonths);
      calculatedExpiry = pDate.toISOString().slice(0, 10);
    }
    const warranty: Warranty = {
      ...newW,
      warrantyExpiryDate: calculatedExpiry,
      id,
      status: 'active'
    };
    setWarranties(prev => [warranty, ...prev]);
    setShowToast({
      message: `Warranty Certificate registered for ${newW.productName}!`,
      type: 'success'
    });
  };

  // Create warranty claim ticket state modifier
  const handleAddClaimTicket = (newClaim: Omit<WarrantyClaim, 'id' | 'status' | 'dateCreated' | 'history'>) => {
    const id = `CLM-${Math.floor(100 + Math.random() * 900)}`;
    const claim: WarrantyClaim = {
      ...newClaim,
      id,
      status: 'submitted',
      dateCreated: new Date().toISOString().slice(0, 10),
      history: [
        { status: 'submitted', title: 'Claim Ticket Logged', date: new Date().toLocaleDateString() }
      ]
    };
    setClaims(prev => [claim, ...prev]);
    setShowToast({
      message: `Warranty Service Claim ticket ${id} submitted!`,
      type: 'success'
    });
  };

  // Create return request receipt modifier
  const handleAddReturnRequest = (newR: Omit<ReturnRequest, 'id' | 'status' | 'trackingNumber' | 'dateCreated' | 'history'>) => {
    const id = `RET-${Math.floor(100 + Math.random() * 900)}`;
    const trackingNumber = `RET-TRK-${Math.floor(1000000 + Math.random() * 9000000)}`;
    const returnReq: ReturnRequest = {
      ...newR,
      id,
      status: 'label_generated',
      trackingNumber,
      dateCreated: new Date().toISOString().slice(0, 10),
      history: [
        { status: 'requested', title: 'Return Pre-Authorized', date: new Date().toLocaleDateString() },
        { status: 'label_generated', title: 'Prepaid parcel waypoint label generated', date: new Date().toLocaleDateString() }
      ]
    };
    setReturns(prev => [returnReq, ...prev]);
    setShowToast({
      message: `Return request Authorized! Secure printable parcel label generated.`,
      type: 'success'
    });
  };

  const handleGmailSync = () => {
    setOrders(INITIAL_ORDERS);
    setWarranties(INITIAL_WARRANTIES);
    setReturns(INITIAL_RETURNS);
    setSelectedOrderId(INITIAL_ORDERS[0]?.id || '');
    setShowToast({
      message: "Sync Complete: Ingested 21 order items with warranty/return details successfully from Gmail service flow.",
      type: "success"
    });
  };

  // Reset interactive data helper to initial setup
  const resetToFactoryDefaultData = () => {
    if (confirm("Reset application data to initial e-commerce orders, active courier routes, and warranty registry examples?")) {
      setOrders(INITIAL_ORDERS);
      setWarranties(INITIAL_WARRANTIES);
      setClaims(INITIAL_WARRANTY_CLAIMS);
      setReturns(INITIAL_RETURNS);
      setSelectedOrderId(INITIAL_ORDERS[0]?.id || '');
      setIsSimulatingId(null);
      setShowToast({ message: "Default demo database loaded.", type: "info" });
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans" id="applet-viewport">
      
      {/* Toast Alert Banner */}
      {showToast && (
        <div 
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm max-w-sm transition-all duration-300"
          id="global-toast-notification"
        >
          <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
          <p className="text-xs font-semibold text-slate-800 leading-normal">{showToast.message}</p>
        </div>
      )}

      {/* Main Account Portal Header Area (Clean Minimalism: Bright white, modern sans serif, thin lines) */}
      <header className="bg-white border-b border-slate-200 shrink-0 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4.5 flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-650 flex items-center justify-center text-white font-mono font-bold text-sm shadow-xs">
              P
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold text-slate-900 tracking-tight">PrimeTrack</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">Hub</span>
              </div>
              <p className="text-[9px] text-slate-400 font-mono tracking-wider uppercase">Order status & coverage</p>
            </div>
          </div>

          {/* Quick Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative w-full max-w-md flex items-center" id="header-search-form">
            <span className="absolute left-3.5 text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              required
              placeholder="Search Waybill or Order ID (e.g. FN8798700600)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-205 rounded-xl py-2 pl-9 pr-24 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-600 focus:bg-white focus:border-slate-350 transition-all duration-200"
            />
            <button
              type="submit"
              className="absolute right-1.5 cursor-pointer bg-slate-900 hover:bg-slate-850 text-white font-medium text-[10px] px-3.5 py-1.2 rounded-lg transition"
            >
              Lookup
            </button>
          </form>

          {/* Customer Profile Widget */}
          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100 text-xs">
            <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
              M
            </div>
            <div className="text-left font-sans pr-1">
              <p className="font-semibold text-slate-800">Manjit</p>
              <p className="text-[9px] text-slate-400 font-mono">manjit.1217@gmail.com</p>
            </div>
          </div>

        </div>
      </header>

      {/* Primary Navigation and Control Header Tabs */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          
          {/* Main Module Toggle Tab Controls */}
          <div className="flex" id="portal-main-tabs">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`cursor-pointer px-5 py-4 text-xs font-medium flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'dashboard' 
                  ? 'border-blue-600 text-blue-600 font-semibold' 
                  : 'border-transparent text-slate-505 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Intelligence Dashboard
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`cursor-pointer px-5 py-4 text-xs font-medium flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'orders' 
                  ? 'border-blue-600 text-blue-600 font-semibold' 
                  : 'border-transparent text-slate-505 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              Orders Ledger
            </button>
            <button
              onClick={() => setActiveTab('warranty')}
              className={`cursor-pointer px-5 py-4 text-xs font-medium flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'warranty' 
                  ? 'border-blue-600 text-blue-600 font-semibold' 
                  : 'border-transparent text-slate-505 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Warranty Hub
            </button>
            <button
              onClick={() => setActiveTab('returns')}
              className={`cursor-pointer px-5 py-4 text-xs font-medium flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'returns' 
                  ? 'border-blue-600 text-blue-600 font-semibold' 
                  : 'border-transparent text-slate-505 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Returns & Refunds
            </button>
            <button
              onClick={() => setActiveTab('gmail-sync')}
              className={`cursor-pointer px-5 py-4 text-xs font-medium flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'gmail-sync' 
                  ? 'border-blue-600 text-blue-600 font-semibold' 
                  : 'border-transparent text-slate-505 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Gmail Sync Ingestion
            </button>
          </div>

          {/* Quick Stats overview capsules */}
          <div className="flex items-center gap-3 py-3 md:py-0">
            
            <span className="font-mono text-[10px] text-slate-500 bg-slate-50 rounded-lg py-1 px-2.5 border border-slate-200/60">
              Active Shipments: <strong className="text-slate-900 font-semibold">{orders.filter(o => o.status !== 'delivered').length}</strong>
            </span>
            
            <span className="font-mono text-[10px] text-blue-600 bg-blue-50/50 rounded-lg py-1 px-2.5 border border-blue-100">
              Coverage Policies: <strong className="text-blue-700 font-semibold">{warranties.length}</strong>
            </span>

            {/* Reset mock database button */}
            <button
              onClick={resetToFactoryDefaultData}
              title="Reset sandbox orders back to initial settings"
              className="cursor-pointer font-sans text-[10px] text-slate-500 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border border-slate-200 rounded-lg py-1 px-2.5 transition flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Reset Demo
            </button>

          </div>

        </div>
      </div>

      {/* Main Scrollable Content Panel Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:py-8 overflow-y-auto">
        
        {/* VIEW 0: INTELLIGENCE DASHBOARD OVERVIEW */}
        {activeTab === 'dashboard' && (
          <OrdersDashboard 
            orders={orders}
            returns={returns}
            warranties={warranties}
            onNavigateToTab={(tab) => setActiveTab(tab)}
            onSelectOrder={(id) => setSelectedOrderId(id)}
          />
        )}

        {/* VIEW 1: CENTRAL ORDERS PAGE & LOGS LEDGER */}
        {activeTab === 'orders' && (
          <OrdersPage 
            orders={orders}
            onUpdateOrders={(updated) => setOrders(updated)}
            onRegisterWarranty={handleAddNewWarranty}
            onInitiateReturn={handleAddReturnRequest}
            selectedOrderId={selectedOrderId}
            onSelectOrderId={(id) => setSelectedOrderId(id)}
          />
        )}

        {/* VIEW 2: PRODUCT WARRANTY PROTECTION PORTAL */}
        {activeTab === 'warranty' && (
          <WarrantyManager
            warranties={warranties}
            claims={claims}
            orders={orders}
            onRegisterWarranty={handleAddNewWarranty}
            onFileClaim={handleAddClaimTicket}
          />
        )}

        {/* VIEW 3: RETURNS & REFUNDS CENTER */}
        {activeTab === 'returns' && (
          <ReturnManager
            orders={orders}
            returns={returns}
            onInitiateReturn={handleAddReturnRequest}
          />
        )}

        {/* VIEW 4: GMAIL INGESTION AND SYNCHRONIZATION ENGINE */}
        {activeTab === 'gmail-sync' && (
          <GmailSyncManager
            orders={orders}
            warranties={warranties}
            returns={returns}
            onTriggerGmailImport={handleGmailSync}
            onAddManualLogMessage={(msg) => console.log(msg)}
          />
        )}

      </main>

      {/* Footer System credits (Clean Minimalism: Soft, clean gray, small text) */}
      <footer className="bg-white border-t border-slate-200 py-6 px-6 shrink-0 text-[11px] text-slate-400 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© 2580 E-Commerce Logistics. Customer Care Hub Operations.</p>
          <div className="flex gap-4">
            <span className="hover:text-slate-700 cursor-pointer">Protocol TLS 1.3</span>
            <span className="hover:text-slate-700 cursor-pointer">Terms & Security</span>
            <span className="hover:text-slate-700 cursor-pointer">Active Sandbox Node</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
