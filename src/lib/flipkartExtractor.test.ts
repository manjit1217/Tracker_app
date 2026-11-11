import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractFlipkartOrder } from './flipkartExtractor';

describe('Flipkart order confirmation extraction', () => {
  it('extracts one order with multiple individual product rows', () => {
    const html = `
      <div>Order placed on Nov 14, 2025</div>
      <div>Order ID: OD335995124092270100</div>
      <div>Amount Paid Rs 9,339</div>
      <table>
        <tr><td><img src="https://img.fkcdn.com/image/a.jpeg" alt="Cetaphil Gentle Skin Cleanser 1 Lit Face Wash"></td><td>Rs. 1289.0</td><td>Delivery by Sat, Nov 15, 2025</td><td>Seller: SuperComNet</td><td>Qty: 1</td></tr>
        <tr><td><img src="https://img.fkcdn.com/image/b.jpeg" alt="Minimalist Vitamin C Serum"></td><td>Rs. 514.0</td><td>Delivery by Sun, Nov 16, 2025</td><td>Seller: Minimalist</td><td>Qty: 2</td></tr>
      </table>`;
    const result = extractFlipkartOrder(html);
    assert.equal(result.orderId, 'OD335995124092270100');
    assert.equal(result.orderDate, '2025-11-14');
    assert.equal(result.amountPaid, 9339);
    assert.equal(result.products.length, 2);
    assert.equal(result.products[0].name, 'Cetaphil Gentle Skin Cleanser 1 Lit Face Wash');
    assert.equal(result.products[0].price, 1289);
    assert.equal(result.products[0].seller, 'SuperComNet');
    assert.equal(result.products[0].deliveryEstimate, 'Sat, Nov 15, 2025');
    assert.equal(result.products[1].quantity, 2);
  });

  it('preserves missing item prices instead of inferring them from the order total', () => {
    const html = `
      <div>Order placed on Oct 15, 2026</div>
      <div>Order ID: OD338894394886298100</div>
      <div>Amount Paid Rs 1,696</div>
      <table><tr><td><img src="https://img.fkcdn.com/image/c.jpeg" alt="CROCS Unisex Clogs"></td><td>Delivery by Sat, Oct 24, 2026</td><td>Seller: CrocsIndiaPvtLtd</td><td>Qty: 1</td></tr></table>`;
    const result = extractFlipkartOrder(html);
    assert.equal(result.amountPaid, 1696);
    assert.equal(result.products[0].price, null);
    assert.equal(result.products[0].name, 'CROCS Unisex Clogs');
  });

  it('ignores rows without a Flipkart product image', () => {
    const result = extractFlipkartOrder('<tr><td>Amount Paid Rs 100</td></tr>');
    assert.equal(result.products.length, 0);
  });
});
