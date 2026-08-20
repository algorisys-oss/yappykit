import { expect, test } from '@playwright/test';

/**
 * Random word generator.
 *
 * The properties worth proving in a real browser are the ones a unit test
 * cannot reach: that the tool is findable, that a seeded draw really does
 * reproduce across a fresh page load, and that the game deck does not repeat
 * while being driven by the keyboard.
 */

test('is reachable from the header search', async ({ page }) => {
  await page.goto('/');
  // Searching by what someone came to do, not by the tool's name.
  await page.getByRole('combobox').fill('pictionary');
  const option = page.getByRole('option').filter({ hasText: 'Random word generator' });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(/\/random-word-generator$/);
  await expect(page.getByRole('heading', { name: 'Random word generator', level: 1 })).toBeVisible();
});

test('draws a list with no repeats', async ({ page }) => {
  await page.goto('/random-word-generator');
  await page.getByRole('button', { name: 'Generate words' }).click();
  const words = await page.locator('ul li button').allInnerTexts();
  expect(words).toHaveLength(10);
  expect(new Set(words).size, 'a draw must not repeat a word').toBe(10);
});

test('honours the letter filter', async ({ page }) => {
  await page.goto('/random-word-generator');
  await page.getByText('Letters and length').click();
  await page.getByLabel('Starts with').fill('z');
  await page.getByRole('button', { name: 'Generate words' }).click();
  const words = await page.locator('ul li button').allInnerTexts();
  expect(words.length).toBeGreaterThan(0);
  expect(words.every((w) => w.startsWith('z'))).toBe(true);
});

test('deals a game deck from the keyboard without repeating', async ({ page }) => {
  await page.goto('/random-word-generator');
  await page.getByRole('radio', { name: 'Game cards' }).click();
  await page.getByRole('button', { name: 'Deal a card' }).click();

  const seen: string[] = [];
  const card = page.locator('p.text-4xl');
  seen.push((await card.innerText()).trim());
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Space');
    seen.push((await card.innerText()).trim());
  }
  expect(new Set(seen).size, 'the deck must deal 21 distinct cards').toBe(21);
});

test('a shared code reproduces the same draw on a fresh load', async ({ page }) => {
  await page.goto('/random-word-generator');
  await page.getByRole('button', { name: 'Use this code' }).click();
  const code = await page.getByLabel('Code').inputValue();
  expect(code).toMatch(/^[a-hjkmnp-z2-9]{6}$/);
  const first = await page.locator('ul li button').allInnerTexts();
  expect(first.length).toBe(10);

  // A different browser, holding only the code, must see the same words.
  await page.goto(`/random-word-generator?seed=${code}&kind=all&n=10`);
  const second = await page.locator('ul li button').allInnerTexts();
  expect(second).toEqual(first);
});

test('reports real strength for a passphrase and never repeats a word', async ({ page }) => {
  await page.goto('/random-word-generator');
  await page.getByRole('radio', { name: 'Passphrase' }).click();
  await page.getByRole('button', { name: 'Generate passphrase' }).click();

  const phrase = (await page.locator('p.font-mono').first().innerText()).trim();
  const words = phrase.split('-');
  expect(words).toHaveLength(8);
  expect(new Set(words).size, 'a passphrase must not reuse a word').toBe(8);

  // The figure is computed from the pool, not a decorative constant.
  await expect(page.getByText(/82\.6 bits of entropy/)).toBeVisible();
  await expect(page.getByText(/for an offline attacker to find it/)).toBeVisible();

  // Two presses must not produce the same phrase.
  await page.getByRole('button', { name: 'Generate passphrase' }).click();
  const again = (await page.locator('p.font-mono').first().innerText()).trim();
  expect(again).not.toBe(phrase);
});

test('offers no way to seed a passphrase', async ({ page }) => {
  await page.goto('/random-word-generator');
  await expect(page.getByRole('heading', { name: 'Share this draw' })).toBeVisible();
  await page.getByRole('radio', { name: 'Passphrase' }).click();
  // A reproducible passphrase is not a secret, so the control is absent.
  await expect(page.getByRole('heading', { name: 'Share this draw' })).toBeHidden();
});

test('prerendered content is present without JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto('/random-word-generator');
  await expect(p).toHaveTitle(/Random Word Generator/i);
  await expect(p.getByText(/How random are the words/i)).toBeVisible();
  await ctx.close();
});
