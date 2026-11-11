import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { correlateGmailOrderEvents } from './orderCorrelation';
import { GmailOrderRaw } from '../data/gmailOrders';
const event=(messageId:string,orderId:string|null,name:string,status='Pending'):GmailOrderRaw=>({gmail_message_id:messageId,platform:'Amazon',order_id:orderId,return_id:null,return_date:null,status,is_returnable:null,return_window_days:null,return_by_date:null,return_days_left:null,return_highlight:null,price:null,warranty_months:null,warranty_expiry:null,product_name:name,product_url:'',delivery_date:'',invoice_url:null,email_subject:'test'});
describe('Gmail order event correlation',()=>{
it('groups lifecycle emails with the same exact Amazon order ID',()=>{const r=correlateGmailOrderEvents([event('m1','407-1234567-1234567','Wireless Keyboard'),event('m2','407-1234567-1234567','Wireless Keyboard','Delivered')]);assert.equal(r.length,1);assert.equal(r[0].status,'Delivered');});
it('keeps separate purchases of the same product separate',()=>{const r=correlateGmailOrderEvents([event('m1','407-1234567-1234567','Wireless Keyboard'),event('m2','407-7654321-7654321','Wireless Keyboard')]);assert.equal(r.length,2);});
it('does not merge messages without a stable order ID',()=>{const r=correlateGmailOrderEvents([event('m1',null,'Wireless Keyboard'),event('m2',null,'Wireless Keyboard')]);assert.equal(r.length,2);});
it('drops duplicate Gmail message IDs',()=>{const r=correlateGmailOrderEvents([event('m1','407-1234567-1234567','Wireless Keyboard'),event('m1','407-1234567-1234567','Wireless Keyboard','Delivered')]);assert.equal(r.length,1);assert.equal(r[0].status,'Pending');});
it('does not promote generic subjects to product names',()=>{const r=correlateGmailOrderEvents([event('m1','407-1234567-1234567','WHAT GOT YOU HERE WON’T GET YOU THERE')]);assert.equal(r[0].product_name,'');});
});