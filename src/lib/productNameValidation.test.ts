import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPlausibleProductName } from './productNameValidation';

describe('product name validation', () => {
  it('rejects greetings, EMI promotions and lifecycle email copy', () => {
    for (const value of [
      'Hi manjit,',
      'Congratulations! You have availed No Cost EMI discount on your order using your Visa Card ending in 4001',
      'Your Myntra return request processed.',
      'Please share your feedback',
      'Unknown Article',
      'AJIO',
    ]) assert.equal(isPlausibleProductName(value), false, value);
  });

  it('keeps genuine product titles', () => {
    for (const value of [
      'Portronics 65W Ignis 65W Fast Charging Powerbank',
      'Boldfit ArcherJr Badminton Shoes',
      'ZE VORA Unisex Denim Jeans',
      'Levis Men Tartan Checks Checked Casual Shirt',
    ]) assert.equal(isPlausibleProductName(value), true, value);
  });
});
