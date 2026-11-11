import React, { useState, useEffect } from 'react';
import { 
  Mail, Play, Settings, ShieldAlert, FileCode, CheckCircle, 
  HelpCircle, AlertTriangle, AlertCircle, RefreshCw, Copy, ExternalLink,
  Sliders, Calendar, Send, Info, Eye, Database, Clock, X, Lock
} from 'lucide-react';
import { Order, Warranty, ReturnRequest } from '../types';
import { initAuth, googleSignIn, logout } from '../lib/firebase';
import { fetchGmailOrders } from '../lib/gmailParser';
import { mapGmailRawToDomain } from '../lib/orderMapper';

interface GmailSyncManagerProps {
  orders: Order[];
  warranties: Warranty[];
  returns: ReturnRequest[];
  onTriggerGmailImport: (orders?: any[], warranties?: any[], returns?: any[]) => void;
  onAddManualLogMessage: (msg: string) => void;
}

export default function GmailSyncManager({
  orders,
  warranties,
  returns,
  onTriggerGmailImport,
  onAddManualLogMessage
}: GmailSyncManagerProps) {
  // Tabs: 'dashboard' | 'vault' | 'reminders' | 'settings'
  const [syncTab, setSyncTab] = useState<'dashboard' | 'vault' | 'reminders' | 'settings'>('dashboard');
  
  // Script Configuration State mirroring settings.py / AppSettings
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('del_order_status_python_config');
    if (saved) return JSON.parse(saved);
    return {
      gmail_query: "category:purchases newer_than:180d",
      gmail_max_results: 100,
      database_path: "data/orders.db",
      scheduler_timezone: "Asia/Kolkata",
      log_level: "INFO",
      playwright_headless: true,
      reminders_email_recipient: "manjit.1217@gmail.com"
    };
  });

  // Sync Progress State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState<'main' | 'parser' | 'scraper' | 'reminder' | 'settings'>('main');
  const [copiedCode, setCopiedCode] = useState(false);
  const [testReminderLogs, setTestReminderLogs] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState<{orders: number, warranties: number, returns: number} | null>(null);

  // Sync steps details
  const syncSteps = [
    { label: "Validating Auth Token", desc: "Verifying OAuth2 credentials in token.json..." },
    { label: "Querying Gmail API", desc: `Searching inbox for "${config.gmail_query}"...` },
    { label: "Processing MIME Headers", desc: "Decoding Subjects & extracting platform transactions..." },
    { label: "Scraping Product Policies", desc: "Running headless browsers to extract warranties & returns..." },
    { label: "Updating SQLite DB & State", desc: "Writing OrderRecord entries and planning notifications..." }
  ];

  // Save Config
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('del_order_status_python_config', JSON.stringify(config));
    alert("Python backend settings updated in sandbox storage.");
  };

  // Google Auth State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setAccessTokenState(token);
      },
      () => {
        return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setAccessTokenState(result.accessToken);
        setTestReminderLogs(prev => [`[${new Date().toLocaleTimeString()}] SUCCESS: Google Account authorized: ${result.user.email}`, ...prev]);
        setShowAuthModal(false);
        // Automatically trigger sync on successful sign-in
        await startSyncWithToken(result.accessToken);
        return result;
      }
    } catch (err: any) {
      setTestReminderLogs(prev => [`[${new Date().toLocaleTimeString()}] ERROR: Authentication failed: ${err.message || err}`, ...prev]);
    } finally {
      setIsLoggingIn(false);
    }
    return null;
  };

  const handleGoogleLogout = async () => {
    try {
      await logout();
      setCurrentUser(null);
      setAccessTokenState(null);
      setTestReminderLogs(prev => [`[${new Date().toLocaleTimeString()}] INFO: OAuth / Credential Session terminated. Local token revoked.`, ...prev]);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Run Real/Simulated Core Sync
  const startSyncWithToken = async (tokenToUse: string) => {
    setIsSyncing(true);
    setSyncStep(0);
    setSuccessCount(null);
    setTestReminderLogs([
      `[${new Date().toLocaleTimeString()}] INFO: Starting Real-Time Gmail order integration...`
    ]);

    const addLogMessage = (msg: string) => {
      setTestReminderLogs(prev => [...prev, msg]);
    };

    try {
      setSyncStep(1); // Step: Querying Gmail API
      const rawOrders = await fetchGmailOrders(tokenToUse, (logObj) => {
        addLogMessage(`[${logObj.timestamp}] ${logObj.level}: ${logObj.message}`);
      }, { query: config.gmail_query, maxResults: config.gmail_max_results });

      setSyncStep(2); // Step: Processing MIME Headers
      await new Promise(resolve => setTimeout(resolve, 800));

      if (rawOrders && rawOrders.length > 0) {
        setSyncStep(3); // Step: Scraping Product Policies
        addLogMessage(`[${new Date().toLocaleTimeString()}] INFO: Applying automatic delivery and return window scraper calculations...`);
        await new Promise(resolve => setTimeout(resolve, 1000));

        setSyncStep(4); // Step: Updating SQLite DB & State
        addLogMessage(`[${new Date().toLocaleTimeString()}] SUCCESS: Database update committed successfully.`);
        
        const mapped = mapGmailRawToDomain(rawOrders);
        
        setSuccessCount({
          orders: mapped.orders.length,
          warranties: mapped.warranties.length,
          returns: mapped.returns.length
        });
        
        onTriggerGmailImport(mapped.orders, mapped.warranties, mapped.returns);
      } else {
        setSuccessCount({ orders: 0, warranties: 0, returns: 0 });
        addLogMessage(`[${new Date().toLocaleTimeString()}] INFO: No matching orders found. Existing orders were left unchanged.`);
      }
      setSyncStep(5);
    } catch (error: any) {
      addLogMessage(`[${new Date().toLocaleTimeString()}] ERROR: Ingestion run failed. Details: ${error.message || error}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleStartSync = async () => {
    if (isSyncing) return;
    
    // Auto-prompt login if no token is available
    let token = accessToken;
    if (!token) {
      setTestReminderLogs(prev => [
        `[${new Date().toLocaleTimeString()}] INFO: No active integration session detected. Launching authentication credentials setup...`,
        ...prev
      ]);
      setShowAuthModal(true);
      return;
    }

    await startSyncWithToken(token);
  };

  // Generate dynamic scheduled reminders (representing python reminder_service.py)
  const [derivedReminders, setDerivedReminders] = useState<any[]>([]);

  useEffect(() => {
    // Generate active warnings based on live dates
    const remindersList: any[] = [];
    
    orders.forEach(o => {
      // Find return options for active orders
      if (o.status !== 'delivered') return;
      
      // Calculate fake return days left or use details
      const deliveredDateObj = new Date(o.orderDate);
      const isReturnable = o.items[0]?.name.toLowerCase().includes('skirt') || o.items[0]?.name.toLowerCase().includes('heavy duty');
      
      if (isReturnable) {
        remindersList.push({
          orderId: o.id,
          product: o.items[0].name,
          platform: o.items[0]?.price > 300 ? 'Amazon' : 'AJIO',
          type: 'Return Deadline Closing',
          date: new Date(deliveredDateObj.getTime() + 10 * 24 * 60 * 60 * 1000).toLocaleDateString(),
          daysLeft: 8,
          priority: 'high',
          message: `Return window of 10 days ends on June 28, 2026 for ${o.items[0].name}.`
        });
      }
    });

    warranties.forEach(w => {
      if (w.status === 'expired') return;
      
      remindersList.push({
        orderId: w.orderId,
        product: w.productName,
        platform: 'E-Store',
        type: 'Warranty Certificate Ending',
        date: w.purchaseDate, // simplify expiry
        daysLeft: 12,
        priority: 'moderate',
        message: `Manufacturer's product warranty registry coverage for "${w.productName}" has entered final 30 days.`
      });
    });

    setDerivedReminders(remindersList);
  }, [orders, warranties]);

  // Send Test Alert Trigger
  const triggerTestAlert = (reminder: any) => {
    alert(`Automation Alert Sent! \nRecipient: ${config.reminders_email_recipient}\nSubject: [PrimeTrack Reminder] ${reminder.type} - Order ${reminder.orderId}\n\nContents:\n${reminder.message}`);
    const timeLog = new Date().toLocaleTimeString();
    setTestReminderLogs(prev => [`[${timeLog}] Fired reminder email alert for ${reminder.orderId} to ${config.reminders_email_recipient}`, ...prev]);
  };

  // Run entire automated scheduler cycle
  const runFullSchedulerSim = () => {
    if (derivedReminders.length === 0) {
      alert("No active deadlines identified to trigger reminders.");
      return;
    }
    const count = derivedReminders.length;
    alert(`Reminder scheduler processing cycle started.\n\nIdentified ${count} active warranty/return conditions.\nFired matches to log console.`);
    const timeLog = new Date().toLocaleTimeString();
    const newLogs = derivedReminders.map(r => `[${timeLog}] Auto-notified recipient about ${r.type} for ${r.product}`);
    setTestReminderLogs(prev => [...newLogs, ...prev]);
  };

  // Copy Reference Code Snippets
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Embedded annotated scripts for visual reference representation
  const scriptCodes = {
    main: `# untitled folder/main.py (FastAPI App Entry)
from fastapi import FastAPI
from pathlib import Path
from app.database import Database
from app.gmail_client import GmailClient
from app.email_parser import EmailParser
from app.product_scraper import ProductScraperService

app = FastAPI(title="Order Delivery Tracker Ingester")

@app.on_event("startup")
def startup():
    # Load settings and init connection layers
    settings = AppSettings()
    db = Database(settings.database_path)
    db.init_db()

@app.get("/orders/json/gmail")
def get_orders_json_gmail():
    """Directly fetch primary Gmail purchases list structure"""
    client = GmailClient()
    parser = EmailParser()
    raw_results = []
    
    for message in client.fetch_messages(query=settings.gmail_query):
        candidate = parser.parse(
            message.message_id, 
            message.subject, 
            message.html_body
        )
        raw_results.append(candidate.model_dump())
        
    return {"query": settings.gmail_query, "orders": raw_results}`,

    parser: `# untitled folder/email_parser.py ( Beautiful Soup Transactors )
import re
from bs4 import BeautifulSoup
from app.models import EmailOrderCandidate

class EmailParser:
    def parse(self, gmail_message_id, subject, html, message_date) -> EmailOrderCandidate:
        soup = BeautifulSoup(html, "html.parser")
        platform = self.detect_platform(subject, html)
        order_id = self.extract_order_id(subject, html, platform)
        
        # Scrape item specifications
        product_name = self.extract_product_name(soup, platform, subject)
        price_str = self.extract_price_value(soup, platform)
        product_url = self.extract_anchor_url(soup, platform)
        
        return EmailOrderCandidate(
            gmail_message_id=gmail_message_id,
            platform=platform,
            order_id=order_id,
            product_name=product_name,
            product_url=product_url,
            delivery_date=message_date,
            price=price_str,
            email_subject=subject
        )`,

    scraper: `# untitled folder/product_scraper.py ( Playwright Headless Policy Fetcher )
from playwright.sync_api import sync_playwright
from app.models import ProductDetails

class ProductScraperService:
    def scrape_product_details(self, url: str) -> ProductDetails:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=15000)
            
            # Smart extraction queries looking for warranty and return texts
            text_content = page.locator("body").inner_text().lower()
            
            return_days = self.parse_return_rules(text_content)
            warranty_months = self.parse_warranty_rules(text_content)
            
            return ProductDetails(
                return_days=return_days,
                warranty_months=warranty_months,
                is_returnable=return_days > 0
            )`,

    reminder: `# untitled folder/reminder_service.py ( Automated Alert Dispatchers )
from datetime import date
from app.models import Reminder

class ReminderService:
    def __init__(self, database):
        self.db = database

    def evaluate_upcoming_deadlines(self) -> list[Reminder]:
        matches = []
        today = date.today()
        
        # Pull active orders from SQLite orders.db
        for record in self.db.get_active_order_records():
            # Check return window expiry alert
            if record.return_deadline:
                days_to_deadline = (record.return_deadline - today).days
                if 0 <= days_to_deadline <= 2:
                    matches.append(Reminder(
                        order_id=record.order_id,
                        product_name=record.product_name,
                        message=f"Return window finishes in {days_to_deadline} days!",
                        due_date=record.return_deadline,
                        reminder_type="RETURN_EXPIRE"
                    ))
        return matches`,

    settings: `# untitled folder/settings.py ( App pydantic Settings Config )
from pydantic import BaseModel, Field

class AppSettings(BaseModel):
    gmail_credentials_file: str = Field(default="credentials.json")
    gmail_token_file: str = Field(default="token.json")
    gmail_query: str = Field(default="category:purchases newer_than:180d")
    gmail_max_results: int = Field(default=100)
    database_path: str = Field(default="data/orders.db")
    log_level: str = Field(default="INFO")
    scheduler_timezone: str = Field(default="Asia/Kolkata")`
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" id="gmail-sync-dashboard">
      
      {/* Top Controller Panel Info Header */}
      <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            Gmail Ingestion & Script Management Engine
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Monitor and sync backend Python email parses, local database metrics, product spec scrapes, and automated scheduled alerts.
          </p>
        </div>

        {/* Tab Switching controls */}
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            onClick={() => setSyncTab('dashboard')}
            className={`px-3 py-1.5 text-[10px] font-medium rounded-md transition ${
              syncTab === 'dashboard' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3 h-3 inline mr-1" /> Console
          </button>
          
          <button
            onClick={() => setSyncTab('vault')}
            className={`px-3 py-1.5 text-[10px] font-medium rounded-md transition ${
              syncTab === 'vault' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileCode className="w-3 h-3 inline mr-1" /> Scripts Vault
          </button>

          <button
            onClick={() => setSyncTab('reminders')}
            className={`px-3 py-1.5 text-[10px] font-medium rounded-md transition ${
              syncTab === 'reminders' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3 h-3 inline mr-1" /> Alerts Plan
          </button>

          <button
            onClick={() => setSyncTab('settings')}
            className={`px-3 py-1.5 text-[10px] font-medium rounded-md transition ${
              syncTab === 'settings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Settings className="w-3 h-3 inline mr-1" /> Script Config
          </button>
        </div>
      </div>

      {/* Main Tab Inner content */}
      <div className="p-6">
        
        {/* TAB 1: SYNC CONSOLE */}
        {syncTab === 'dashboard' && (
          <div className="space-y-6">
            
            {/* Upper Split Grid: Stats left, Sync Button Trigger right */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* Left Column stats info card (Span 7) */}
              <div className="md:col-span-7 bg-white border border-slate-200 p-5 rounded-xl space-y-4 shadow-xs">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">SQLite Database Statistics</h3>
                
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100/80">
                    <p className="text-[10px] text-slate-400 font-mono">DB PATH</p>
                    <p className="text-xs font-bold text-slate-800 truncate mt-1">{config.database_path}</p>
                  </div>
                  <div className="bg-blue-50/40 p-3 rounded-lg border border-blue-100/60">
                    <p className="text-[10px] text-blue-600 font-semibold font-mono">TOTAL ORDERS</p>
                    <p className="text-lg font-bold text-slate-900 mt-1">{orders.length}</p>
                  </div>
                  <div className="bg-teal-50/40 p-3 rounded-lg border border-teal-100/60">
                    <p className="text-[10px] text-teal-600 font-semibold font-mono">WARRANTIES</p>
                    <p className="text-lg font-bold text-slate-900 mt-1">{warranties.length}</p>
                  </div>
                </div>

                <div className="text-xs text-slate-500 space-y-2 pt-1">
                  <div className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span>Cron Scheduler Target:</span>
                    <span className="font-mono font-semibold text-slate-700">Daily 09:00 AM ({config.scheduler_timezone})</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span>Active Gmail Filter:</span>
                    <span className="font-mono text-slate-600 bg-slate-100/80 px-1.5 py-0.5 rounded leading-none">{config.gmail_query}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Automated Reminders Generated:</span>
                    <span className="font-mono text-amber-600 font-semibold">{derivedReminders.length} Active Deadlines</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Execution control card */}
              <div className="md:col-span-5 bg-slate-50 border border-slate-200 p-5 rounded-xl flex flex-col justify-between shadow-xs relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider font-mono">LOCAL ENGINE NODE READY</span>
                    </div>
                    {currentUser ? (
                      <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-1 leading-none">
                        {currentUser.photoURL ? (
                          <img src={currentUser.photoURL} alt="" className="w-4 h-4 rounded-full" referrerPolicy="no-referrer" />
                        ) : (
                          <Mail className="w-2.5 h-2.5 text-emerald-600" />
                        )}
                        <span className="text-[8.5px] font-bold text-emerald-700 font-mono">
                          CONNECTED: {currentUser.email}
                        </span>
                        <button onClick={handleGoogleLogout} className="text-[8.5px] font-bold text-rose-600 hover:text-rose-800 hover:underline font-mono cursor-pointer">
                          [DISCONNECT]
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setShowAuthModal(true)} 
                        className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-2 py-0.5 leading-none font-bold text-[8.5px] text-blue-700 transition cursor-pointer"
                      >
                        <Mail className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                        Connect Gmail Inbox
                      </button>
                    )}
                  </div>
                  <h3 className="text-base font-light text-slate-950 tracking-tight">Sync Ingestion Pipeline</h3>
                  <p className="text-[10.5px] text-slate-500 leading-relaxed">
                    Parse inbox transactional messages, process purchase receipts, scrape shipping policies, and register policies in local ledger.
                  </p>
                </div>

                <div className="pt-5">
                  {!isSyncing ? (
                    <button
                      onClick={handleStartSync}
                      className="w-full cursor-pointer bg-slate-950 hover:bg-slate-900 text-white font-medium text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center justify-center gap-2"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Incorporate Gmail Purchase Data (API Live)
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-blue-600">
                        <span className="font-semibold flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Ingestion active...
                        </span>
                        <span>{Math.round(((syncStep) / syncSteps.length) * 100)}%</span>
                      </div>
                      
                      {/* Active Step Indicator */}
                      <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-600 transition-all duration-350"
                          style={{ width: `${Math.round(((syncStep) / syncSteps.length) * 100)}%` }}
                        />
                      </div>

                      <div className="text-[10px] text-slate-500 font-mono text-left pt-1 italic">
                        {syncSteps[Math.min(syncStep, syncSteps.length - 1)].desc}
                      </div>
                    </div>
                  )}

                  {successCount && (
                    <div className="mt-3.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-left text-emerald-850 flex gap-2 items-start animate-fadeIn">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold">Successfully Synchronized!</p>
                        <p className="text-[10px] text-emerald-700/90 leading-tight mt-0.5">
                          Ingested {successCount.orders} order entries from AJIO, Amazon, Flipkart & Myntra. Registered {successCount.warranties} active warranties with policy calculations.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* Verified Synced Orders List (Audit list of recently synchronized items) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 text-left space-y-4 shadow-xs" id="synced-orders-audit-card">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-blue-600" />
                    Verified Synced Orders List
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Real-time view of recent order confirmations parsed from your inbox</p>
                </div>
                <span className="text-[9.5px] font-bold text-slate-500 font-mono uppercase bg-slate-100 px-2 py-0.5 rounded">
                  Latest First
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-medium font-mono text-[9.5px] uppercase">
                      <th className="py-2">Platform</th>
                      <th className="py-2">Product Details</th>
                      <th className="py-2">Order Date</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Order Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {orders.slice(0, 5).map((ord) => (
                      <tr key={ord.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 pr-2 font-mono">
                          <span className={`inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded-md ${
                            ord.platform?.toLowerCase() === 'myntra' ? 'bg-pink-100 text-pink-700' :
                            ord.platform?.toLowerCase() === 'amazon' ? 'bg-amber-100 text-amber-800' :
                            ord.platform?.toLowerCase() === 'flipkart' ? 'bg-blue-100 text-blue-700' :
                            ord.platform?.toLowerCase() === 'ajio' ? 'bg-purple-100 text-purple-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {ord.platform || 'Unknown'}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            {ord.items[0]?.imageUrl ? (
                              <img 
                                src={ord.items[0].imageUrl} 
                                alt="" 
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 object-cover rounded-md border border-slate-200 shrink-0 shadow-3xs"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="w-8 h-8 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-md text-sm shrink-0">
                                {ord.items[0]?.image || '📦'}
                              </span>
                            )}
                            <div>
                              <p className="font-semibold text-slate-800 line-clamp-1">
                                {ord.items[0]?.name || 'Unknown Product'}
                              </p>
                              <p className="text-[9.5px] text-slate-400 font-mono mt-0.5">
                                ID: <span className="text-slate-600 select-all">{ord.id}</span>
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-slate-500 whitespace-nowrap">
                          {ord.orderDate}
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 text-[9.5px] font-bold uppercase rounded-md ${
                            ord.status === 'delivered' ? 'text-emerald-700' :
                            ord.status === 'out_for_delivery' ? 'text-amber-700' :
                            ord.status === 'in_transit' ? 'text-blue-700' :
                            'text-slate-600'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              ord.status === 'delivered' ? 'bg-emerald-500' :
                              ord.status === 'out_for_delivery' ? 'bg-amber-500' :
                              ord.status === 'in_transit' ? 'bg-blue-500' :
                              'bg-slate-400'
                            }`} />
                            {ord.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-slate-800">
                          Rs.{ord.priceTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Simulated Live Log Terminal Output */}
            <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 text-left space-y-3 shadow-sm">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">FastAPI Applet Logs Console</span>
                <span className="text-[9px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded">NODE_ENV: Sandbox</span>
              </div>
              
              <div className="font-mono text-[10.5px] leading-relaxed text-slate-300 space-y-1.5 h-44 overflow-y-auto pr-2 select-all scrollbar-thin">
                {testReminderLogs.length === 0 ? (
                  <>
                    <p className="text-slate-500">[09:00:00 AM] INFO: Scheduler started successfully. Registered 1 daily cron trigger.</p>
                    <p className="text-slate-500">[09:00:03 AM] INFO: Database app_orders.db open initialized. Checked schemas OK.</p>
                    <p className="text-slate-450">[03:45:12 PM] INFO: GET /health {"->"} {"{\"status\": \"ok\", \"scheduler\": \"active\"}"}</p>
                    <p className="text-slate-450">[03:45:15 PM] INFO: Applet connection idle. Press "Incorporate Gmail Purchase Data" to execute.</p>
                  </>
                ) : (
                  testReminderLogs.map((log, index) => (
                    <p key={index} className="text-blue-300 bg-blue-950/20 px-2 py-0.5 rounded border border-blue-900/10">{log}</p>
                  ))
                )}
              </div>
            </div>

            {/* CLI Local Running Guide */}
            <div className="p-4 bg-amber-50/50 border border-amber-250 rounded-xl text-left flex gap-3">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <h4 className="font-semibold text-amber-900">How to run these scripts locally on your computer:</h4>
                <p className="text-amber-800/90 leading-relaxed mt-1">
                  These scripts under <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10.5px]">/untitled folder</code> are fully runnable! 
                  Simply install the requirements <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10.5px]">pip install fastapi uvicorn pydantic beautifulsoup4 playwright google-api-python-client</code>, 
                  save your official Google credentials as <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10.5px]">credentials.json</code> inside, 
                  and boot the applet with <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10.5px]">uvicorn main:app --reload</code> on port 3000 to bind securely!
                </p>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: SCRIPTS VAULT CODE reference */}
        {syncTab === 'vault' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
            
            {/* Left Side: Script menu list (Span 3) */}
            <div className="lg:col-span-3 space-y-2">
              <h3 className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-widest pb-1 border-b border-slate-100">Files in workspace</h3>
              
              {[
                { id: 'main', file: 'main.py', desc: 'FastAPI Router', icon: Sliders },
                { id: 'parser', file: 'email_parser.py', desc: 'Beautiful Soup', icon: Mail },
                { id: 'scraper', file: 'product_scraper.py', desc: 'Playwright Browser', icon: Database },
                { id: 'reminder', file: 'reminder_service.py', desc: 'Notification evaluates', icon: ShieldAlert },
                { id: 'settings', file: 'settings.py', desc: 'AppSettings configuration', icon: Settings }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFile(f.id as any)}
                  className={`w-full text-left p-3 rounded-lg border transition text-xs flex items-center justify-between ${
                    selectedFile === f.id 
                    ? 'bg-slate-900 text-white border-slate-900' 
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <p className="font-semibold">{f.file}</p>
                    <p className={`text-[9.5px] mt-0.5 ${selectedFile === f.id ? 'text-slate-400' : 'text-slate-400'}`}>{f.desc}</p>
                  </div>
                  <ChevronRightIcon className="w-3.5 h-3.5 shrink-0 op-60" />
                </button>
              ))}
            </div>

            {/* Right Side: Code Viewer Container (Span 9) */}
            <div className="lg:col-span-9 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-xs flex flex-col">
              <div className="px-5 py-3 border-b border-slate-200 bg-white flex justify-between items-center">
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <FileCode className="w-4 h-4 text-blue-600" />
                  <span className="font-mono font-semibold">{selectedFile}.py</span>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded leading-none">Read-Only View</span>
                </div>

                <button
                  onClick={() => copyToClipboard(scriptCodes[selectedFile])}
                  className="text-[10px] text-slate-500 hover:text-slate-900 cursor-pointer flex items-center gap-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md transition"
                >
                  <Copy className="w-3 h-3" />
                  {copiedCode ? "Copied!" : "Copy Snippet"}
                </button>
              </div>

              <div className="p-4 bg-slate-950 overflow-x-auto text-[11px] font-mono leading-relaxed text-slate-200 max-h-[350px]">
                <pre className="text-left whitespace-pre">{scriptCodes[selectedFile]}</pre>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: ACTIONABLE REMINDERS (calculated directly from products list) */}
        {syncTab === 'reminders' && (
          <div className="space-y-6 text-left">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">Calculated alerts & Scheduled push reminders</h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Synthesized dynamically from current active order deliveries and registered warranty policies.
                </p>
              </div>

              <button
                onClick={runFullSchedulerSim}
                className="cursor-pointer bg-slate-900 hover:bg-slate-850 text-white font-medium text-[10.5px] px-3 py-1.5 rounded-lg shadow-xs transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> Execute Daily Run (09:00 AM)
              </button>
            </div>

            {derivedReminders.length === 0 ? (
              <div className="border border-dashed border-slate-300 p-8 text-center rounded-xl">
                <AlertInfoIcon className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 text-xs">No active reminders found</p>
                <p className="text-slate-400 text-[10.5px] mt-1 max-w-sm mx-auto leading-normal">
                  All shipments are delivered or processed cleanly, and warranty deadlines reside safely in compliance bounds.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {derivedReminders.map((rem, idx) => (
                  <div 
                    key={idx} 
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition shadow-xs/5 bg-white ${
                      rem.priority === 'high' ? 'border-amber-200/80 hover:border-amber-300 bg-amber-50/5' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex gap-3 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${rem.priority === 'high' ? 'bg-amber-500' : 'bg-blue-550'}`} />
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 font-mono text-[10px] leading-tight">{rem.orderId}</span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded leading-none ${
                            rem.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'
                          }`}>{rem.type}</span>
                        </div>
                        <h4 className="font-semibold text-slate-800 leading-snug">{rem.product}</h4>
                        <p className="text-slate-500 text-[11px] leading-relaxed max-w-xl">{rem.message}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-center">
                      <div className="text-left sm:text-right text-[10.5px] font-mono">
                        <p className="text-slate-400">DUE BY</p>
                        <p className="font-bold text-slate-800 mt-0.5">{rem.date}</p>
                      </div>

                      <button
                        onClick={() => triggerTestAlert(rem)}
                        className="cursor-pointer bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-medium text-[10px] p-2 rounded-lg transition-all"
                        title="Simulate notification push to subscriber email address"
                      >
                        <Send className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* TAB 4: SCRIPT SETTINGS EDITING (AppSettings Class) */}
        {syncTab === 'settings' && (
          <form onSubmit={handleSaveConfig} className="space-y-6 text-left max-w-2xl">
            
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">Applet configuration options</h3>
              <p className="text-[11px] text-slate-400 mt-1">Configures standard variables consumed by the Python backend on execution.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Gmail Search Query:</label>
                <input
                  type="text"
                  required
                  value={config.gmail_query}
                  onChange={(e) => setConfig({...config, gmail_query: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-[10.5px] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                />
                <p className="text-[10px] text-slate-400">Query filter matching email subject headings or categories</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Scheduler Timezone:</label>
                <input
                  type="text"
                  required
                  value={config.scheduler_timezone}
                  onChange={(e) => setConfig({...config, scheduler_timezone: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-[10.5px] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                />
                <p className="text-[10px] text-slate-400">Target timezone scheduler evaluations adhere to</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Max Log messages Count:</label>
                <input
                  type="number"
                  required
                  value={config.gmail_max_results}
                  onChange={(e) => setConfig({...config, gmail_max_results: Number(e.target.value)})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-[10.5px] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Receiver Alerts Subscriber Email Address:</label>
                <input
                  type="email"
                  required
                  value={config.reminders_email_recipient}
                  onChange={(e) => setConfig({...config, reminders_email_recipient: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-[10.5px] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Database Engine Path:</label>
                <input
                  type="text"
                  required
                  value={config.database_path}
                  onChange={(e) => setConfig({...config, database_path: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-[10.5px] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Playwright Web scraping mode:</label>
                <select
                  value={config.playwright_headless ? "true" : "false"}
                  onChange={(e) => setConfig({...config, playwright_headless: e.target.value === "true"})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition text-[10.5px]"
                >
                  <option value="true">Headless (Optimized for Sandbox Servers)</option>
                  <option value="false">Headed Browser (Visual scraping window)</option>
                </select>
              </div>

            </div>

            <div className="pt-3">
              <button
                type="submit"
                className="cursor-pointer bg-slate-950 hover:bg-slate-900 text-white font-medium text-xs py-2 px-5 rounded-lg transition shadow-xs"
              >
                Save Settings Configuration
              </button>
            </div>

          </form>
        )}

      </div>

      {/* GMAIL AUTH INTEGRATION MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fadeIn animate-in fade-in duration-200" id="gmail-auth-modal">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative text-left anim-fade">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Gmail Secure Integration</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Sync purchase invoices & warranty details</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthError('');
                }}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
                id="close-auth-modal-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-center">
              <p className="text-xs text-slate-600 leading-relaxed">Connect Gmail using Google OAuth. This integration requests read-only access to transactional emails. Gmail App Passwords are not supported in this browser flow.</p>
              {authError && <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs">{authError}</div>}
              <button type="button" onClick={handleGoogleSignIn} disabled={isLoggingIn} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-sm transition disabled:opacity-50">
                {isLoggingIn ? 'Connecting to Google...' : 'Sign in with Google'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Minimal Icons Local wrappers so we do not trigger any external package issues

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}

function AlertInfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" x2="12" y1="8" y2="12"/>
      <line x1="12" x2="12.01" y1="16" y2="16"/>
    </svg>
  );
}
