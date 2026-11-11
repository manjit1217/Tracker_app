import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractAmazonEmail, extractAmazonOrderId, extractAmazonOrderTotal } from './amazonExtractor';
import { isStableMarketplaceOrderId } from './orderCorrelation';

describe('Amazon email field extraction', () => {
  it('extracts only a correctly formatted Amazon order ID', () => {
    assert.equal(extractAmazonOrderId('Order number: 407-5855217-5876321'), '407-5855217-5876321');
    assert.equal(extractAmazonOrderId('Reference 407-5855217'), null);
  });

  it('extracts a labelled order total, not an arbitrary item price', () => {
    assert.equal(extractAmazonOrderTotal('Order Total: ₹1,299.00'), '₹1299.00');
    assert.equal(extractAmazonOrderTotal('Item price: ₹1,299.00'), null);
  });

  it('extracts product data from Amazon tracking links and separates multiple orders in one email', () => {
    const html = `
      <table><tbody>
        <tr><td>Order # 404-4525516-9016340</td></tr>
        <tr><td><a href="https://www.amazon.in/gp/r.html?U=https%3A%2F%2Fwww.amazon.in%2Fdp%2FB0ABCDE123"><img alt="Portronics 65W Ignis 65 20000mAh Fast Charging Powerbank" src="https://m.media-amazon.com/images/I/61VjRhvvtzL._SS90_.jpg"></a></td></tr>
        <tr><td>Quantity: 1 ₹ 1,999 00</td></tr>
      </tbody></table>
      <table><tbody>
        <tr><td>Order # 404-2453989-1047536</td></tr>
        <tr><td><a href="https://www.amazon.in/gp/r.html?U=https%3A%2F%2Fwww.amazon.in%2Fdp%2FC0ABCDE123"><img alt="GoTrippin by Destinio Weight Machine for Luggage" src="https://m.media-amazon.com/images/I/61tBIXOpw2L._SS90_.jpg"></a></td></tr>
        <tr><td>Quantity: 1 ₹ 579 00</td></tr>
      </tbody></table>`;
    const plain = 'Order # 404-4525516-9016340 Portronics 1999 INR Total 2028 INR Order # 404-2453989-1047536 GoTrippin 579 INR Total 579 INR';
    const result = extractAmazonEmail(html, plain);
    assert.equal(result.orders.length, 2);
    assert.equal(result.orders[0].orderId, '404-4525516-9016340');
    assert.equal(result.orders[0].productNames[0], 'Portronics 65W Ignis 65 20000mAh Fast Charging Powerbank');
    assert.equal(result.orders[0].itemTotal, '₹1999');
    assert.equal(result.orders[0].orderTotal, '₹2028');
    assert.equal(result.orders[0].productUrls[0], 'https://www.amazon.in/dp/B0ABCDE123');
    assert.equal(result.orders[1].orderId, '404-2453989-1047536');
    assert.equal(result.orders[1].orderTotal, '₹579');
  });
});

describe('Amazon digest order correlation', () => {
  it('preserves multiple order IDs carried by one Gmail message', () => {
    const shared = {
      gmail_message_id: 'same-message',
      platform: 'Amazon',
      status: 'Pending',
      product_name: 'Product',
    } as any;
    const result = correlateGmailOrderEvents([
      { ...shared, order_id: '404-4525516-9016340' },
      { ...shared, order_id: '404-2453989-1047536' },
      { ...shared, order_id: '404-4525516-9016340' },
    ]);
    assert.equal(result.length, 2);
    assert.deepEqual(result.map(order => order.order_id), [
      '404-4525516-9016340',
      '404-2453989-1047536',
    ]);
  });
});

describe('marketplace order ID validation', () => {
  it('accepts known marketplace ID formats', () => {
    assert.equal(isStableMarketplaceOrderId('Amazon', '407-5855217-5876321'), true);
    assert.equal(isStableMarketplaceOrderId('Flipkart', 'OD123456789012345'), true);
    assert.equal(isStableMarketplaceOrderId('Myntra', '1332770-0642999-0225201'), true);
    assert.equal(isStableMarketplaceOrderId('AJIO', 'FN8798700600'), true);
  });

  it('rejects placeholders and unrecognized generic IDs', () => {
    assert.equal(isStableMarketplaceOrderId('Myntra', 'MISSING-abc123'), false);
    assert.equal(isStableMarketplaceOrderId('Unknown', 'ORDER123456'), false);
  });
});
