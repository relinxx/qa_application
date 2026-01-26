import { test, expect } from '@playwright/test';

const URL = 'https://www.saucedemo.com';
const STANDARD_USER = 'standard_user';
const PASSWORD = 'secret_sauce';

async function login(page) {
    await page.goto(URL);
    await page.fill('[data-test="username"]', STANDARD_USER);
    await page.fill('[data-test="password"]', PASSWORD);
    await page.click('[data-test="login-button"]');
}

test.describe('SauceDemo - Purchase Flow', () => {
    test('Complete purchase flow', async ({ page }) => {
        await login(page);
        
        // Add product to cart
        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');

        // Go to cart
        await page.click('[data-test="shopping-cart-link"]');

        // Verify item is in cart and checkout
        await expect(page.locator('[data-test="cart-quantity"]')).toHaveText('1');
        await page.click('[data-test="checkout"]');

        // Fill in info and continue
        await page.fill('[data-test="firstName"]', 'Test');
        await page.fill('[data-test="lastName"]', 'User');
        await page.fill('[data-test="postalCode"]', '12345');
        await page.click('[data-test="continue"]');

        // Finish checkout
        await page.click('[data-test="finish"]');

        // Verify checkout complete
        await expect(page.locator('h2')).toHaveText('Thank you for your order!');
    });
});