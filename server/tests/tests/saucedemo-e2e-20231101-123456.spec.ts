import { test, expect } from '@playwright/test';

test.describe('SauceDemo E2E Test', () => {
  test('Purchase Flow - Standard User', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.fill('[data-test="username"]', 'standard_user');
    await page.fill('[data-test="password"]', 'secret_sauce');
    await page.click('[data-test="login-button"]');
    
    await expect(page).toHaveURL('https://www.saucedemo.com/inventory.html');

    await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
    await page.click('.shopping_cart_link');
    await expect(page).toHaveURL('https://www.saucedemo.com/cart.html');

    await page.click('[data-test="checkout"]');
    await page.fill('[data-test="firstName"]', 'John');
    await page.fill('[data-test="lastName"]', 'Doe');
    await page.fill('[data-test="postalCode"]', '12345');
    await page.click('[data-test="continue"]');
    await page.click('[data-test="finish"]');

    await expect(page).toHaveURL('https://www.saucedemo.com/checkout-complete.html');
  });

  test('Negative Login - Locked Out User', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.fill('[data-test="username"]', 'locked_out_user');
    await page.fill('[data-test="password"]', 'secret_sauce');
    await page.click('[data-test="login-button"]');

    const errorMessage = await page.textContent('[data-test="error"]');
    await expect(errorMessage).toContain('Sorry, this user has been locked out.');
  });
});
