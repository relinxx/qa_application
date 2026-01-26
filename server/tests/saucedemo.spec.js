const { test, expect } = require('@playwright/test');

test.describe('SauceDemo Purchase Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
  });

  test('Standard User Complete Purchase', async ({ page }) => {
    await page.fill('[data-test=username]', 'standard_user');
    await page.fill('[data-test=password]', 'secret_sauce');
    await page.click('[data-test=login-button]');
    
    // Add products to cart
    await page.click('[data-test=add-to-cart-sauce-labs-backpack]');
    await page.click('[data-test=add-to-cart-sauce-labs-bike-light]');
    await page.click('[data-test=shopping-cart-link]');
    
    // Checkout process
    await page.click('[data-test=checkout]');
    await page.fill('[data-test=firstName]', 'John');
    await page.fill('[data-test=lastName]', 'Doe');
    await page.fill('[data-test=postalCode]', '12345');
    await page.click('[data-test=continue]');
    await page.click('[data-test=finish]');
    
    // Verify completion
    await expect(page.locator('text=Thank you for your order!')).toBeVisible();
  });

  test('Locked Out User Login Attempt', async ({ page }) => {
    await page.fill('[data-test=username]', 'locked_out_user');
    await page.fill('[data-test=password]', 'secret_sauce');
    await page.click('[data-test=login-button]');
    
    // Verify error
    await expect(page.locator('text=Epic sadface: Sorry, this user has been locked out.')).toBeVisible();
  });
});
