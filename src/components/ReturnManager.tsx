import React, { useState, useMemo } from 'react';
import { PackageOpen, ArrowLeftRight, CheckCircle2, QrCode, AlertTriangle, Printer, HelpCircle, Send, Calendar, RefreshCcw, DollarSign } from 'lucide-react';
import { Order, ReturnRequest } from '../types';
import { PlatformBadge } from '../App';

interface ReturnManagerProps {
  orders: Order[];
  returns: ReturnRequest[];
  onInitiateReturn: (newReturn: Omit<ReturnRequest, 'id' | 'status' | 'trackingNumber' | 'dateCreated' | 'history'>) => void;
}

export default function ReturnManager({
  orders,
  returns,
  onInitiateReturn
}: ReturnManagerProps) {
  const [showReturnRequest, setShowReturnRequest] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [returnDetailsStr, setReturnDetailsStr] = useState('');
  const [returnReason, setReturnReason] = useState('Changed mind / No longer needed');
  const [refundMethod, setRefundMethod] = useState<'original_payment' | 'store_credit'>('original_payment');

  // Return label print / view state
  const [selectedReturnLabelId, setSelectedReturnLabelId] = useState<string | null>(null);

  // Return policy limit is 30 days
  const RETURN_WINDOW_DAYS = 30;

  // Calculate order eligibility with nice details
  const ordersEligibility = useMemo(() => {
    return orders.map(order => {
      if (order.status !== 'delivered') {
        return {
          order,
          eligible: false,
          reason: "Order has not yet been marked delivered",
          daysRemaining: 0
        };
      }

      // Parse order date
      const purchaseDate = new Date(order.orderDate);
      const now = new Date();
      const diffTime = now.getTime() - purchaseDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const daysRemaining = RETURN_WINDOW_DAYS - diffDays;

      return {
        order,
        eligible: daysRemaining > 0,
        reason: daysRemaining > 0 ? `${daysRemaining} days left inside 30-day window` : "30-day return eligibility period closed",
        daysRemaining
      };
    });
  }, [orders]);

  // Clean eligible products list for the select input
  const eligibleProductsList = useMemo(() => {
    const list: { orderId: string; productName: string; orderDate: string }[] = [];
    ordersEligibility.forEach(item => {
      if (item.eligible) {
        item.order.items.forEach(itm => {
          // Check if already in the returns list
          const alreadyReturned = returns.some(r => r.orderId === item.order.id && r.productName === itm.name);
          if (!alreadyReturned) {
            list.push({
              orderId: item.order.id,
              productName: itm.name,
              orderDate: item.order.orderDate
            });
          }
        });
      }
    });
    return list;
  }, [ordersEligibility, returns]);

  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId || !returnDetailsStr) {
      alert("Please designate a product and write standard return reason details.");
      return;
    }

    // Determine product name from compound option key
    const [orderId, productName] = selectedOrderId.split('|');

    onInitiateReturn({
      orderId,
      productName,
      returnReason,
      details: returnDetailsStr,
      refundMethod
    });

    // Reset Form
    setSelectedOrderId('');
    setReturnDetailsStr('');
    setReturnReason('Changed mind / No longer needed');
    setRefundMethod('original_payment');
    setShowReturnRequest(false);
  };

  const getStepStatusStyle = (currentStatus: string, stepStatus: string) => {
    const sequence = ['requested', 'label_generated', 'shipped', 'received', 'refunded'];
    const currentIndex = sequence.indexOf(currentStatus);
    const stepIndex = sequence.indexOf(stepStatus);

    if (currentIndex >= stepIndex) {
      return {
        bg: 'bg-blue-600',
        text: 'text-blue-600 font-semibold',
        line: 'bg-blue-600'
      };
    }
    return {
      bg: 'bg-slate-200',
      text: 'text-slate-400 font-medium',
      line: 'bg-slate-250'
    };
  };

  return (
    <div className="space-y-6" id="return-manager-module">
      {/* Return Header Nav Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-205">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            Exchange & Return Center
          </h2>
          <p className="text-slate-400 text-xs font-mono">Register hassle-free returns, download print labels, and track direct refunds</p>
        </div>
        <div>
          {eligibleProductsList.length > 0 && !showReturnRequest && (
            <button
              onClick={() => setShowReturnRequest(true)}
              id="btn-open-return-wizard"
              className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs px-4 py-2.5 rounded-lg transition duration-200 flex items-center gap-2 shadow-xs"
            >
              <PackageOpen className="w-3.5 h-3.5" />
              File Return Request
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Middle Column: Eligible orders status & returns form */}
        <div className="lg:col-span-2 space-y-5">
          
          {/* Initiate Return Form Segment */}
          {showReturnRequest && (
            <div className="bg-white border border-blue-200 p-6 rounded-xl shadow-xs transition-all duration-300" id="form-return-request-submission">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <h3 className="font-semibold text-blue-600 flex items-center gap-2 text-xs uppercase tracking-wider">
                  <PackageOpen className="w-4 h-4" />
                  Initiate Customer Product Return
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowReturnRequest(false);
                    setSelectedOrderId('');
                  }}
                  className="text-slate-400 hover:text-slate-700 font-mono text-xs"
                >
                  [Cancel]
                </button>
              </div>

              <form onSubmit={handleSubmitReturn} className="space-y-4 text-xs font-sans">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-655 font-medium mb-1">Select Eligible Product</label>
                    <select
                      required
                      value={selectedOrderId}
                      onChange={(e) => setSelectedOrderId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-lg p-2.5 text-slate-705 focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                    >
                      <option value="">Choose item...</option>
                      {eligibleProductsList.map((item, idx) => (
                        <option key={idx} value={`${item.orderId}|${item.productName}`}>
                          {item.productName} (Order: {item.orderId})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-655 font-medium mb-1">Reason for Return</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-lg p-2.5 text-slate-700 focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                    >
                      <option value="Changed mind / No longer needed">No longer needed / Changed my mind</option>
                      <option value="Wrong item delivered">Incorrect hardware / Wrong size delivered</option>
                      <option value="Defective or malfunctioning">Defective / Malfunctioning on arrival</option>
                      <option value="Damaged shipping box container">Damaged in shipping</option>
                      <option value="Quality below expectations">Aesthetic design not meeting quality limits</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-655 font-medium mb-1">Preferred Reimbursement Option</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <label className={`border rounded-lg p-3 flex flex-col justify-between cursor-pointer transition ${
                        refundMethod === 'original_payment' 
                          ? 'bg-blue-50/40 border-blue-600 text-blue-700' 
                          : 'bg-slate-50 border-slate-205 hover:bg-slate-100/50'
                      }`}>
                        <input
                          type="radio"
                          name="refund_pref"
                          value="original_payment"
                          checked={refundMethod === 'original_payment'}
                          onChange={() => setRefundMethod('original_payment')}
                          className="sr-only"
                        />
                        <DollarSign className="w-3.5 h-3.5 text-blue-600 mb-1" />
                        <div>
                          <p className="font-bold text-[10px]">Original Card</p>
                          <p className="text-[9px] text-slate-400 mt-0.5 font-mono">3-5 Banking days</p>
                        </div>
                      </label>
                      
                      <label className={`border rounded-lg p-3 flex flex-col justify-between cursor-pointer transition ${
                        refundMethod === 'store_credit' 
                          ? 'bg-blue-50/40 border-blue-600 text-blue-700' 
                          : 'bg-slate-50 border-slate-205 hover:bg-slate-100/50'
                      }`}>
                        <input
                          type="radio"
                          name="refund_pref"
                          value="store_credit"
                          checked={refundMethod === 'store_credit'}
                          onChange={() => setRefundMethod('store_credit')}
                          className="sr-only"
                        />
                        <RefreshCcw className="w-3.5 h-3.5 text-blue-600 mb-1" />
                        <div>
                          <p className="font-bold text-[10px]">Store Wallet credit</p>
                          <p className="text-[9px] text-slate-400 mt-0.5 font-mono">Instant upon scan</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-655 font-medium mb-1">Elaborate Return Specifics</label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Please note physical state, missing packaging items, or detailed description of performance issues..."
                      value={returnDetailsStr}
                      onChange={(e) => setReturnDetailsStr(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-lg p-2.5 text-slate-700 focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                    ></textarea>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReturnRequest(false);
                      setSelectedOrderId('');
                    }}
                    className="px-4 py-2 border border-slate-205 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    id="submit-return-request"
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg shadow-xs"
                  >
                    Generate Return Authorization
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Policy Information Guidelines banner */}
          <div className="bg-slate-50 border border-slate-205 rounded-lg p-4.5 flex gap-3 text-xs text-slate-600">
            <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-800">Online Returns Policy Directive</p>
              <p className="mt-0.5 text-[11px] leading-relaxed">
                Standard items possess a strict <span className="font-semibold text-slate-900">30-day trial return period</span> from receipt. Refunds will trigger back to specified method nodes immediately once the package passes diagnostic scanning.
              </p>
            </div>
          </div>

          {/* Active Returns tracker list */}
          <div className="border-b border-slate-200 pb-2">
            <h3 className="text-slate-800 text-[10px] font-bold uppercase tracking-widest font-mono">Active Return Tracking ({returns.length})</h3>
          </div>

          {returns.length === 0 ? (
            <div className="bg-white border border-slate-205 rounded-xl p-8 text-center" id="empty-returns-list">
              <PackageOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-slate-705 text-xs">No Active Product Returns</p>
              <p className="text-slate-400 text-xs mt-1 leading-relaxed">Return shipments, barcodes, and digital return authorization tracking status indicators will map here once submitted.</p>
            </div>
          ) : (
            <div className="space-y-5" id="active-product-returns-column">
              {returns.map(ret => (
                <div
                  key={ret.id}
                  className="bg-white border border-slate-202 rounded-xl p-5 shadow-xs transition hover:border-slate-350"
                  id={`return-card-${ret.id}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4 text-xs">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[9px] font-bold text-slate-900 bg-slate-50 border border-slate-200 px-2 text-center py-0.5 rounded-md uppercase">
                          RA-ID: {ret.id}
                        </span>
                        <PlatformBadge platform={ret.platform} />
                      </div>
                      <h4 className="font-semibold text-slate-900 text-xs mt-2">{ret.productName}</h4>
                      <p className="text-slate-400 text-[9px] font-mono mt-0.5">Linked Order: {ret.orderId} • Issued: {ret.dateCreated}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedReturnLabelId(selectedReturnLabelId === ret.id ? null : ret.id)}
                        id={`btn-label-${ret.id}`}
                        className="cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-205 text-slate-700 text-[10px] font-mono font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all"
                      >
                        <QrCode className="w-3.5 h-3.5 text-blue-600" />
                        {selectedReturnLabelId === ret.id ? '[Hide Packing Slip]' : '[Print Return Slip]'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5 text-[10px] leading-relaxed text-slate-650">
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg">
                      <span className="text-slate-400 font-sans block text-[9px]">Reason for refund</span>
                      <span className="text-slate-700 font-semibold">{ret.returnReason}</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg">
                      <span className="text-slate-400 font-sans block text-[9px]">Reimbursement Option</span>
                      <span className="text-slate-700 font-semibold">{ret.refundMethod === 'original_payment' ? 'Original Card Node' : 'Store wallet balance'}</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg">
                      <span className="text-slate-400 font-sans block text-[9px]">Waybill Tracking ID</span>
                      <span className="text-slate-755 font-mono font-bold">{ret.trackingNumber}</span>
                    </div>
                  </div>

                  {/* Return shipping label QR display snippet */}
                  {selectedReturnLabelId === ret.id && (
                    <div className="bg-slate-50 border border-slate-205 rounded-lg p-5 mb-5 flex flex-col md:flex-row items-center gap-5 text-xs animate-fadeIn shadow-xs" id={`label-qr-container-${ret.id}`}>
                      <div className="bg-white p-3 border border-slate-205 rounded-sm flex items-center justify-center">
                        <div className="relative flex flex-col items-center">
                          <div className="w-20 h-20 bg-[linear-gradient(45deg,#000_25%,transparent_25%),linear-gradient(-45deg,#000_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#000_75%),linear-gradient(-45deg,transparent_75%,#000_75%)] bg-[size:10px_10px] opacity-80 mb-1"></div>
                          <p className="font-mono text-[8px] text-center text-slate-500 font-bold">{ret.trackingNumber}</p>
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="font-bold text-slate-900 flex items-center gap-1 font-mono text-[10px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                          PREPAID WAYBILL AUTHORIZED
                        </p>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
                          A prepaid shipping code is created. Securely place devices in raw mail packaging slips, affix printed bar codes directly, and scan at any logistics hub.
                        </p>
                        <button
                          onClick={() => alert("Digital slip sent to defaults.")}
                          className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-[9px] px-3 py-1.5 rounded-md flex items-center gap-1 transition"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          PRINT PHYSICAL SLIP
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Return Steps horizontal tracking timeline */}
                  <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center mt-4 gap-4 pb-2">
                    {/* Horizontal Connector Line (Only Desktop) */}
                    <div className="hidden md:block absolute left-4 right-4 h-1 bg-slate-100 top-1/2 -translate-y-1/2 -z-10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{
                          width: ret.status === 'requested' ? '0%' : 
                                 ret.status === 'label_generated' ? '25%' : 
                                 ret.status === 'shipped' ? '50%' : 
                                 ret.status === 'received' ? '75%' : '100%'
                        }}
                      />
                    </div>

                    {/* Step requested */}
                    <div className="flex md:flex-col items-center gap-3 md:gap-1.5 text-center flex-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-mono font-bold ${getStepStatusStyle(ret.status, 'requested').bg}`}>
                        1
                      </div>
                      <span className={`text-[9px] font-mono uppercase tracking-wider ${getStepStatusStyle(ret.status, 'requested').text}`}>Requested</span>
                    </div>

                    {/* Step label generated */}
                    <div className="flex md:flex-col items-center gap-3 md:gap-1.5 text-center flex-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-mono font-bold ${getStepStatusStyle(ret.status, 'label_generated').bg}`}>
                        2
                      </div>
                      <span className={`text-[9px] font-mono uppercase tracking-wider ${getStepStatusStyle(ret.status, 'label_generated').text}`}>Issued</span>
                    </div>

                    {/* Step Shipped */}
                    <div className="flex md:flex-col items-center gap-3 md:gap-1.5 text-center flex-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-mono font-bold ${getStepStatusStyle(ret.status, 'shipped').bg}`}>
                        3
                      </div>
                      <span className={`text-[9px] font-mono uppercase tracking-wider ${getStepStatusStyle(ret.status, 'shipped').text}`}>Shipped</span>
                    </div>

                    {/* Step Received */}
                    <div className="flex md:flex-col items-center gap-3 md:gap-1.5 text-center flex-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-mono font-bold ${getStepStatusStyle(ret.status, 'received').bg}`}>
                        4
                      </div>
                      <span className={`text-[9px] font-mono uppercase tracking-wider ${getStepStatusStyle(ret.status, 'received').text}`}>Received</span>
                    </div>

                    {/* Step Refunded */}
                    <div className="flex md:flex-col items-center gap-3 md:gap-1.5 text-center flex-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-mono font-bold ${getStepStatusStyle(ret.status, 'refunded').bg}`}>
                        5
                      </div>
                      <span className={`text-[9px] font-mono uppercase tracking-wider ${getStepStatusStyle(ret.status, 'refunded').text}`}>Refunded</span>
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}

        </div>

        {/* Right Column: 30-Day eligibility timeline list of orders */}
        <div className="space-y-4">
          <div className="border-b border-slate-200 pb-2">
            <h3 className="text-slate-800 text-[10px] font-bold uppercase tracking-widest font-mono">30-Day Policy Check</h3>
          </div>

          <div className="space-y-3.5" id="return-eligibility-panels">
            {ordersEligibility.map(itm => {
              const mainProduct = itm.order.items[0];
              if (!mainProduct) return null;
              
              return (
                <div
                  key={itm.order.id}
                  className="bg-white border border-slate-205 rounded-xl p-4 flex flex-col justify-between hover:border-slate-350 transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-mono text-[9px] text-slate-400 font-bold">LNK ID: {itm.order.id}</p>
                        <PlatformBadge platform={itm.order.platform} />
                      </div>
                      <h4 className="font-semibold text-slate-900 text-xs mt-1.5">{mainProduct.name}</h4>
                      {itm.order.items.length > 1 && (
                        <p className="text-[9px] font-mono text-slate-450 mt-0.5">+ {itm.order.items.length - 1} OTHER ITEMS</p>
                      )}
                    </div>
                    {mainProduct.imageUrl ? (
                      <img 
                        src={mainProduct.imageUrl} 
                        alt={mainProduct.name} 
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 object-cover rounded-md border border-slate-205 shadow-2xs shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const sibling = e.currentTarget.nextElementSibling as HTMLElement;
                          if (sibling) sibling.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <span className={`text-base flex items-center justify-center w-10 h-10 bg-slate-100 rounded-md shrink-0 ${mainProduct.imageUrl ? 'hidden' : ''}`}>{mainProduct.image}</span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Order Delivery Status</span>
                    <span className={`font-bold uppercase tracking-wider ${itm.order.status === 'delivered' ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {itm.order.status}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-[10px] bg-slate-50 border border-slate-100 p-2 rounded-lg">
                    <span className="text-slate-500 font-medium font-sans">Return Window</span>
                    
                    {itm.eligible ? (
                      <span className="text-blue-600 font-bold font-mono text-[9px] bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase">
                        Eligible • {itm.daysRemaining}d left
                      </span>
                    ) : (
                      <span className="text-rose-600 font-bold font-mono text-[9px] bg-rose-50 px-2 py-0.5 rounded border border-rose-100 uppercase flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 text-rose-500" />
                        CLOSED
                      </span>
                    )}
                  </div>

                  {itm.order.returnDeadline && (
                    <div className="mt-1.5 flex items-center justify-between text-[10px] bg-slate-50 border border-slate-100 p-2 rounded-lg">
                      <span className="text-slate-500 font-medium font-sans">Deadline Date</span>
                      <span className="text-slate-700 font-mono font-bold">
                        {new Date(itm.order.returnDeadline).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'})}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
