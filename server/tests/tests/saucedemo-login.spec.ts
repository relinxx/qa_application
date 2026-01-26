import { test, expect } from '@playwright/test';

const URL = 'https://www.saucedemo.com';
const STANDARD_USER = 'standard_user';
const LOCKED_OUT_USER = 'locked_out_user';
const PASSWORD = 'secret_sauce';

test.describe('SauceDemo - Login', () => {
    test('Standard user login should succeed', async ({ page }) => {
        await page.goto(URL);
        await page.fill('[data-test="username"]', STANDARD_USER);
        await page.fill('[data-test="password"]', PASSWORD);
        await page.click('[data-test="login-button"]');
        await expect(page).toHaveURL('https://www.saucedemo.com/inventory.html');
    });

    test('Locked out user login should fail', async ({ page }) => {
        await page.goto(URL);
        await page.fill('[data-test="username"]', LOCKED_OUT_USER);
        await page.fill('[data-test="password"]', PASSWORD);
        await page.click('[data-test="login-button"]');
        const errorMessage = await page.locator('[data-test="error"]').innerText();
        await expect(errorMessage).toContain('Epic sadface: Sorry, this user has been locked out.');
    });
});