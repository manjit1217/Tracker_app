import React, { useState } from 'react';
import { Shield, ShieldAlert, Award, ChevronRight, PlusCircle, AlertCircle, FileText, CheckCircle, Package, Send, Calendar, Cpu } from 'lucide-react';
import { Warranty, WarrantyClaim, Order } from '../types';
import { PlatformBadge } from '../App';

// Helper to format date without timezone shifts
const safeFormatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'Unassigned';
  const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) {
    const year = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1;
    const day = parseInt(parts[3], 10);
    const date = new Date(year, month, day);
    return date.toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'});
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'});
};

interface WarrantyManagerProps {
  warranties: Warranty[];
  claims: WarrantyClaim[];
  orders: Order[];
  onRegisterWarranty: (newWarranty: Omit<Warranty, 'id' | 'status'>) => void;
  onFileClaim: (newClaim: Omit<WarrantyClaim, 'id' | 'status' | 'dateCreated' | 'history'>) => void;
}

export default function WarrantyManager({
  warranties,
  claims,
  orders,
  onRegisterWarranty,
  onFileClaim
}: WarrantyManagerProps) {
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [selectedWarrantyForClaim, setSelectedWarrantyForClaim] = useState<string>('');

  // Register Form States
  const [regOrderId, setRegOrderId] = useState('');
  const [regProductName, setRegProductName] = useState('');
  const [regSerialNumber, setRegSerialNumber] = useState('');
  const [regPurchaseDate, setRegPurchaseDate] = useState('');
  const [regDurationMonths, setRegDurationMonths] = useState(12);
  const [regReceiptName, setRegReceiptName] = useState('');

  // Claim Form States
  const [claimWarrantyId, setClaimWarrantyId] = useState('');
  const [claimIssueDescription, setClaimIssueDescription] = useState('');
  const [claimType, setClaimType] = useState<'repair' | 'replacement' | 'refund'>('repair');

  // Retrieve delivered items from order history that aren't already registered
  const eligibleDeliveredOrders = orders.filter(o => o.status === 'delivered');

  // Handles auto-filling product name based on selected order ID in the Register Warranty Form
  const handleOrderChangeInReg = (oId: string) => {
    setRegOrderId(oId);
    const order = orders.find(o => o.id === oId);
    if (order && order.items.length > 0) {
      setRegProductName(order.items[0].name);
      setRegPurchaseDate(order.orderDate);
      // Auto generate a mock serial number
      setRegSerialNumber(`SN-${Math.floor(100000 + Math.random() * 900000)}-${order.items[0].name.slice(0, 4).toUpperCase()}`);
    } else {
      setRegProductName('');
      setRegPurchaseDate('');
      setRegSerialNumber('');
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regProductName || !regSerialNumber || !regPurchaseDate) {
      alert("Please fill in all general product specifications.");
      return;
    }
    onRegisterWarranty({
      orderId: regOrderId || 'MANUAL-ENTRY',
      productName: regProductName,
      serialNumber: regSerialNumber,
      purchaseDate: regPurchaseDate,
      durationMonths: Number(regDurationMonths)
    });

    // Reset Form
    setRegOrderId('');
    setRegProductName('');
    setRegSerialNumber('');
    setRegPurchaseDate('');
    setRegDurationMonths(12);
    setRegReceiptName('');
    setShowRegisterForm(false);
  };

  const handleClaimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const warranty = warranties.find(w => w.id === claimWarrantyId);
    if (!warranty || !claimIssueDescription) {
      alert("Please select a registered warranty registry and supply problem details.");
      return;
    }
    onFileClaim({
      warrantyId: claimWarrantyId,
      productName: warranty.productName,
      serialNumber: warranty.serialNumber,
      issueDescription: claimIssueDescription,
      claimType
    });

    // Reset
    setClaimWarrantyId('');
    setClaimIssueDescription('');
    setClaimType('repair');
    setShowClaimForm(false);
  };

  // Helper calculation to find elapsed percentage of warranty
  const getWarrantyProgress = (purchaseDateStr: string, durationMonths: number) => {
    const purchaseDate = new Date(purchaseDateStr);
    const now = new Date();
    
    // Total duration in ms
    const totalMs = durationMonths * 30 * 24 * 60 * 60 * 1000;
    const elapsedMs = now.getTime() - purchaseDate.getTime();
    
    const remainingHrs = Math.max(0, Math.ceil((totalMs - elapsedMs) / (60 * 60 * 1000)));
    const remainingDays = Math.max(0, Math.ceil(remainingHrs / 24));
    const percentRemaining = Math.max(0, Math.min(100, ((totalMs - elapsedMs) / totalMs) * 100));

    return {
      remainingDays,
      percentRemaining: percentRemaining.toFixed(0),
      isExpired: elapsedMs > totalMs
    };
  };

  return (
    <div className="space-y-6" id="warranty-manager-module">
      {/* Upper Navigation Action row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-205">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            Warranty & Coverage Panel
          </h2>
          <p className="text-slate-400 text-xs font-mono">Register electronics or transmit direct replacement claims securely</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => {
              setShowRegisterForm(true);
              setShowClaimForm(false);
            }}
            id="btn-open-register-warranty"
            className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs px-4 py-2.5 rounded-lg transition duration-200 flex items-center gap-2 shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Register Certificate
          </button>
          
          {warranties.length > 0 && (
            <button
              onClick={() => {
                setShowClaimForm(true);
                setShowRegisterForm(false);
                if (warranties.length > 0) {
                  setClaimWarrantyId(warranties[0].id);
                }
              }}
              id="btn-open-warranty-claim"
              className="cursor-pointer bg-white hover:bg-slate-50 text-slate-800 border border-slate-205 font-medium text-xs px-4 py-2.5 rounded-lg transition duration-200 flex items-center gap-2 shadow-xs"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
              File Claim Ticket
            </button>
          )}
        </div>
      </div>

      {/* Grid: Forms & Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Middle Column: Active Warranties List */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Register Form Dynamic Accordion */}
          {showRegisterForm && (
            <div className="bg-white border border-blue-200 p-6 rounded-xl shadow-xs transition-all duration-300" id="form-register-new-warranty">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <h3 className="font-semibold text-blue-600 flex items-center gap-2 text-xs uppercase tracking-wider">
                  <Award className="w-4 h-4" />
                  Product Warranty Registration
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRegisterForm(false)}
                  className="text-slate-400 hover:text-slate-700 font-mono text-xs"
                >
                  [Cancel]
                </button>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs font-sans">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-655 font-medium mb-1">Delivered Purchased Items</label>
                    <select
                      value={regOrderId}
                      onChange={(e) => handleOrderChangeInReg(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-lg p-2.5 text-slate-700 focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                    >
                      <option value="">Select a previous purchase...</option>
                      {eligibleDeliveredOrders.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.id} ({o.items[0]?.name || 'Misc Package'}) - {o.orderDate}
                        </option>
                      ))}
                      <option value="custom_order">Custom Non-Portal Order Entry</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-655 font-medium mb-1">Product Designation Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mechanical Tactile Keyboard"
                      value={regProductName}
                      onChange={(e) => setRegProductName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-lg p-2.5 text-slate-700 focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-slate-650 font-medium mb-1">Device Hardware Serial No.</label>
                    <input
                      type="text"
                      required
                      placeholder="SN-XXXXXX"
                      value={regSerialNumber}
                      onChange={(e) => setRegSerialNumber(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-lg p-2.5 text-slate-705 font-mono focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-650 font-medium mb-1">Purchase Date</label>
                    <input
                      type="date"
                      required
                      value={regPurchaseDate}
                      onChange={(e) => setRegPurchaseDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-lg p-2.5 text-slate-700 focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-650 font-medium mb-1">Warranty Term Duration</label>
                    <select
                      value={regDurationMonths}
                      onChange={(e) => setRegDurationMonths(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-205 rounded-lg p-2.5 text-slate-700 focus:ring-1 focus:ring-blue-600"
                    >
                      <option value={6}>6 Months Standard (Limited)</option>
                      <option value={12}>12 Months Platinum Coverage</option>
                      <option value={24}>24 Months Extended Enterprise Protection</option>
                      <option value={36}>36 Months Ultra Plus Lifelong Coverage</option>
                    </select>
                  </div>
                </div>

                {/* Upload Receipt Document Grid Segment */}
                <div>
                  <label className="block text-slate-650 font-medium mb-1">Store Invoice Receipt Proof</label>
                  <div className="border border-dashed border-slate-200 bg-slate-50 rounded-lg p-4 text-center cursor-pointer hover:bg-slate-100/50 transition">
                    <input 
                      type="file" 
                      id="warranty-receipt-uploader"
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setRegReceiptName(file.name);
                      }}
                    />
                    <label htmlFor="warranty-receipt-uploader" className="cursor-pointer flex flex-col items-center justify-center">
                      <FileText className="w-5 h-5 text-slate-400 mb-1" />
                      <p className="text-slate-650 text-[11px] font-mono">
                        {regReceiptName ? `Document Linked: ${regReceiptName}` : 'Click to drop or link Invoice PDF / JPG'}
                      </p>
                      <span className="text-[9px] text-slate-400 font-mono mt-0.5">Supported: PDF, JPEG, PNG (Max 5MB)</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowRegisterForm(false)}
                    className="px-4 py-2 border border-slate-205 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    id="submit-register-warranty-form"
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg shadow-xs"
                  >
                    Confirm Registration Certificate
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Claim Form Dynamic Accordion */}
          {showClaimForm && (
            <div className="bg-white border border-slate-300 p-6 rounded-xl shadow-xs transition-colors duration-200 animate-slideDown" id="form-warranty-claim-submission">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-xs uppercase tracking-wider text-blue-600">
                  <ShieldAlert className="w-4 h-4" />
                  File a Hardware Coverage Claim
                </h3>
                <button
                  type="button"
                  onClick={() => setShowClaimForm(false)}
                  className="text-slate-400 hover:text-slate-705 font-mono text-xs"
                >
                  [Cancel]
                </button>
              </div>

              <form onSubmit={handleClaimSubmit} className="space-y-4 text-xs font-sans">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-650 font-medium mb-1">Select Registered Certificate</label>
                    <select
                      required
                      value={claimWarrantyId}
                      onChange={(e) => setClaimWarrantyId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-lg p-2.5 text-slate-700 focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                    >
                      <option value="">Select equipment...</option>
                      {warranties.map(w => (
                        <option key={w.id} value={w.id}>
                          {w.productName} ({w.serialNumber})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-655 font-medium mb-1">Desired Resolution Solution</label>
                    <select
                      value={claimType}
                      onChange={(e) => setClaimType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-lg p-2.5 text-slate-700 focus:ring-1 focus:ring-blue-600"
                    >
                      <option value="repair">Under-Warranty Expert Hardware Repair</option>
                      <option value="replacement">Direct Factory Sealed Unit Replacement</option>
                      <option value="refund">Exchange for Store Credit Wallet Balance</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-650 font-medium mb-1">Explain Malfunction or Defect</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Provide a thorough explanation of what is malfunctioning, steps to reproduce, or any visual defects observed..."
                    value={claimIssueDescription}
                    onChange={(e) => setClaimIssueDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-205 rounded-lg p-2.5 text-slate-700 focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                  ></textarea>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowClaimForm(false)}
                    className="px-4 py-2 border border-slate-205 rounded-lg text-slate-500 hover:bg-slate-50 font-medium"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    id="submit-warranty-claim-form"
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-850 text-white font-medium rounded-lg shadow-xs"
                  >
                    Transmit Claim Ticket
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Active Warranties Header */}
          <div className="border-b border-slate-200 pb-2">
            <h3 className="text-slate-800 text-[10px] font-bold uppercase tracking-widest font-mono">Registered Certificates ({warranties.length})</h3>
          </div>

          {warranties.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center" id="empty-warranty-container">
              <Shield className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-805 text-xs">No Registered Protection Certificates</p>
              <p className="text-slate-400 text-xs mt-1 leading-relaxed">Register electronics and other active assets to file repairs or replacements instantly.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="registered-warranties-grid">
              {warranties.map(warranty => {
                const termInfo = getWarrantyProgress(warranty.purchaseDate, warranty.durationMonths);
                
                return (
                  <div
                    key={warranty.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-350 transition-all duration-200 relative group"
                    id={`warranty-card-${warranty.id}`}
                  >
                    <div className="absolute top-4 right-4 font-mono text-[9px] font-bold px-2 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-slate-400">
                      ID: {warranty.id}
                    </div>

                    <div>
                      {/* Product details */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="p-1 px-2 py-0.5 rounded-sm bg-slate-100 text-slate-700 font-bold font-mono tracking-wider text-[9px] uppercase border border-slate-200/50">
                          {warranty.durationMonths} MONTHS
                        </span>
                        <PlatformBadge platform={warranty.platform} />
                      </div>
                      
                      <h4 className="font-semibold text-slate-900 text-xs mt-3.5 group-hover:text-blue-600 transition">
                        {warranty.productName}
                      </h4>
                      
                      <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 mt-4 font-mono text-[9px] text-slate-550 border-t border-slate-50 pt-2">
                        <div>
                          <span className="text-slate-400 block text-[8px] font-sans">Serial Number</span>
                          <span className="text-slate-705 font-semibold">{warranty.serialNumber}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[8px] font-sans">Purchase Date</span>
                          <span className="text-slate-705 font-semibold">{safeFormatDate(warranty.purchaseDate)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[8px] font-sans">Expiry Date</span>
                          <span className="text-emerald-700 font-bold">
                            {warranty.warrantyExpiryDate ? safeFormatDate(warranty.warrantyExpiryDate) : (() => {
                              if (warranty.purchaseDate) {
                                const pDate = new Date(warranty.purchaseDate);
                                pDate.setMonth(pDate.getMonth() + warranty.durationMonths);
                                const isoyear = pDate.getFullYear();
                                const isomonth = String(pDate.getMonth() + 1).padStart(2, '0');
                                const isoday = String(pDate.getDate()).padStart(2, '0');
                                return safeFormatDate(`${isoyear}-${isomonth}-${isoday}`);
                              }
                              return 'Unassigned';
                            })()}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[8px] font-sans">Policy Term</span>
                          <span className="text-slate-705 font-semibold">{warranty.durationMonths} Months</span>
                        </div>
                      </div>
                    </div>

                    {/* Timeline bar */}
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <div className="flex justify-between items-center text-[10px] mb-1.5">
                        <span className="text-slate-400">Coverage Duration</span>
                        {termInfo.isExpired ? (
                          <span className="text-rose-600 font-medium flex items-center gap-1 font-mono text-[9px]">
                            <AlertCircle className="w-3 h-3" /> EXPIRED
                          </span>
                        ) : (
                          <span className="text-blue-600 font-bold font-mono text-[9px]">
                            {termInfo.remainingDays} days left
                          </span>
                        )}
                      </div>
                      
                      <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            termInfo.isExpired ? 'bg-slate-300' : 'bg-blue-650'
                          }`}
                          style={{ width: `${termInfo.percentRemaining}%` }}
                        ></div>
                      </div>

                      {/* File quick claim shortcut */}
                      {!termInfo.isExpired && (
                        <div className="mt-4 flex justify-between items-center">
                          <span className="text-[9px] text-slate-400 block">Verified Plan Active</span>
                          <button
                            onClick={() => {
                              setSelectedWarrantyForClaim(warranty.id);
                              setClaimWarrantyId(warranty.id);
                              setShowClaimForm(true);
                              const element = document.getElementById("form-warranty-claim-submission");
                              element?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                          >
                            Claim coverage <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Historical Pending Claims Timeline */}
        <div className="space-y-4">
          <div className="border-b border-slate-200 pb-2">
            <h3 className="text-slate-800 text-[10px] font-bold uppercase tracking-widest font-mono">Active Claims ({claims.length})</h3>
          </div>

          {claims.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center" id="empty-claims-tracker">
              <ShieldAlert className="w-6 h-6 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700 text-xs">No active service tickets</p>
              <p className="text-slate-400 text-[10px] mt-1 leading-relaxed">Diagnostic timeline logs of registered warranty claims will render here once submitted.</p>
            </div>
          ) : (
            <div className="space-y-4" id="claims-timeline-stack">
              {claims.map(claim => (
                <div key={claim.id} className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-xs" id={`claim-card-${claim.id}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="font-mono text-[9px] font-bold text-slate-900 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md uppercase">
                        TKT: {claim.id}
                      </span>
                      <h4 className="font-semibold text-slate-900 text-xs mt-2">{claim.productName}</h4>
                      <p className="font-mono text-[9px] text-slate-400">SN: {claim.serialNumber}</p>
                    </div>
                    <span className="text-[9px] font-bold font-mono tracking-wider uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {claim.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3 text-[10px] text-slate-650 border border-slate-200/60 italic mb-4">
                    Claim Type: <span className="font-bold uppercase not-italic text-slate-800 font-mono">{claim.claimType}</span>
                    <p className="mt-1 font-sans">"{claim.issueDescription}"</p>
                  </div>

                  {/* Micro timeline steps */}
                  <div className="space-y-3.5 border-l border-slate-200/80 ml-2 pl-4 relative">
                    {claim.history.map((h, hIdx) => (
                      <div key={hIdx} className="relative text-[10px]">
                        {/* Timeline Node dot */}
                        <div className="absolute -left-[21px] top-1 w-2 h-2 rounded-full border border-white bg-blue-600"></div>
                        <div className="font-semibold text-slate-750">{h.title}</div>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">{h.date}</div>
                      </div>
                    ))}
                    
                    {claim.status !== 'completed' && (
                      <div className="relative text-[10px] opacity-40">
                        <div className="absolute -left-[21px] top-1 w-2 h-2 rounded-full border border-slate-300 bg-slate-200"></div>
                        <div className="font-medium text-slate-400 font-mono">RESOLUTION SCHED</div>
                        <div className="text-[9px] mt-0.5 font-mono">Est. 2-3 business days</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
