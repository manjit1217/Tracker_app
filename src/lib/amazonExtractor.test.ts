import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractAmazonOrderId, extractAmazonOrderTotal } from './amazonExtractor';
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
