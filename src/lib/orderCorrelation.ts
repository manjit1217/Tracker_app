import { GmailOrderRaw } from '../data/gmailOrders';
const statusPriority=(status:string):number=>{const s=(status||'').toLowerCase();if(s.includes('refund success'))return 7;if(s.includes('pending refund'))return 6;if(s.includes('returned'))return 5;if(s.includes('delivered'))return 4;if(s.includes('out for delivery'))return 3;if(s.includes('shipped')||s.includes('transit'))return 2;if(s.includes('pending'))return 1;return 0;};
export const isStableMarketplaceOrderId=(platform:string,orderId:string|null|undefined):boolean=>{if(!orderId)return false;const id=orderId.trim();if(!id||/^(missing|gml|trk)-/i.test(id))return false;if(platform==='Amazon')return /^\\d{3}-\\d{7}-\\d{7}$/.test(id);if(platform==='Flipkart')return /^OD[A-Z0-9]{10,}$/i.test(id);return /^[A-Z0-9-]{6,}$/i.test(id);};
const cleanNames=(value:string):string[]=>value.split(';').map(v=>v.replace(/\\s+/g,' ').trim()).filter(v=>v.length>=8&&v.length<=220&&!/^(amazon|your order|order details|view order|track package|delivery update|invoice|payment|what got you here)$/i.test(v));
/** Correlate multiple source emails only by exact platform-specific order identity. */
export const correlateGmailOrderEvents=(events:GmailOrderRaw[]):GmailOrderRaw[]=>{
 const orders:GmailOrderRaw[]=[];const indexByKey=new Map<string,number>();const seenMessages=new Set<string>();
 for(const event of events){if(event.gmail_message_id&&seenMessages.has(event.gmail_message_id))continue;if(event.gmail_message_id)seenMessages.add(event.gmail_message_id);
  const stable=isStableMarketplaceOrderId(event.platform,event.order_id);const key=stable?`${event.platform.toLowerCase()}:${event.order_id!.trim()}`:'';const index=key?indexByKey.get(key):undefined;
  if(index===undefined){orders.push({...event,product_name:cleanNames(event.product_name||'').join('; ')});if(key)indexByKey.set(key,orders.length-1);continue;}
  const current=orders[index];current.product_name=Array.from(new Set([...cleanNames(current.product_name||''),...cleanNames(event.product_name||'')])).join('; ');
  current.product_image_url=Array.from(new Set([...(current.product_image_url||'').split(';').filter(Boolean),...(event.product_image_url||'').split(';').filter(Boolean)])).join('; ');
  if(!current.product_url&&event.product_url)current.product_url=event.product_url;if(!current.price&&event.price)current.price=event.price;if(!current.invoice_url&&event.invoice_url)current.invoice_url=event.invoice_url;if(!current.return_id&&event.return_id)current.return_id=event.return_id;if(!current.return_date&&event.return_date)current.return_date=event.return_date;if(!current.delivery_date&&event.delivery_date)current.delivery_date=event.delivery_date;
  if(statusPriority(event.status)>statusPriority(current.status)){current.status=event.status;current.email_subject=event.email_subject;current.gmail_message_id=event.gmail_message_id;current.event_type=event.event_type;}
 }return orders;
}