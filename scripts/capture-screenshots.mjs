import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotDir = path.join(projectRoot, "docs", "screenshots");
const port = 4199;
const baseUrl = `http://127.0.0.1:${port}`;

await mkdir(screenshotDir, { recursive: true });

const server = spawn(process.execPath, ["dist-server/server/index.js"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    PORT: String(port),
    PUBLIC_URL: `http://192.168.1.42:${port}`
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk.toString()));
server.stderr.on("data", (chunk) => (serverLog += chunk.toString()));

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Screenshot server did not start.\n${serverLog}`);
}

async function settle(page) {
  await page.waitForTimeout(900);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    `
  });
  await page.evaluate(() => document.fonts.ready);
}

async function openHome(browser, viewport) {
  const isPhone = Math.min(viewport.width, viewport.height) < 600;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "light",
    isMobile: isPhone,
    hasTouch: isPhone
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await settle(page);
  return { context, page };
}

async function openRoom(
  browser,
  { game, mode, name, avatar = "Dragon", viewport = { width: 1440, height: 960 } }
) {
  const session = await openHome(browser, viewport);
  const { page } = session;
  await page.locator("#player-name").fill(name);
  await page.getByRole("button", { name: `${avatar} zodiac avatar` }).click();
  if (game === "guandan") {
    await page.locator(".game-segment button").filter({ hasText: "Guan Dan" }).click();
  }
  if (mode === "friends") {
    await page.locator(".mode-segment button").filter({ hasText: "Nearby friends" }).click();
  }
  await page.locator("button.launch-button").click();
  await page.waitForURL(/\/room\/[A-Z0-9]{5}$/);
  await page.waitForSelector(mode === "friends" ? ".waiting-page" : ".game-shell");
  await settle(page);
  return session;
}

async function openGuanDanWithWild(browser, viewport) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const session = await openRoom(browser, {
      game: "guandan",
      mode: "solo",
      name: "Alex",
      viewport
    });
    await session.page.waitForFunction(
      () => document.querySelector(".seat-bottom.active-seat"),
      undefined,
      { timeout: 20_000 }
    );
    await settle(session.page);
    if ((await session.page.locator(".player-hand .wild-card").count()) > 0) return session;
    await session.context.close();
  }
  throw new Error("Could not deal a screenshot hand containing a heart-level wild card.");
}

async function verifyPortraitHand(
  page,
  { expectedRows = 3, minimumPitch = 38 } = {}
) {
  const cards = page.locator(".player-hand .playing-card");
  const cardCount = await cards.count();
  if (cardCount !== 27) {
    throw new Error(`Portrait screenshot has ${cardCount} cards instead of 27.`);
  }

  const frame = await page.locator(".hand-scroll").boundingBox();
  if (!frame) throw new Error("Portrait hand frame is missing.");
  const rows = new Map();
  for (let index = 0; index < cardCount; index += 1) {
    const card = await cards.nth(index).boundingBox();
    if (
      !card ||
      card.x < frame.x - 1 ||
      card.y < frame.y - 1 ||
      card.x + card.width > frame.x + frame.width + 1 ||
      card.y + card.height > frame.y + frame.height + 1
    ) {
      throw new Error(`Card ${index + 1} is clipped outside the portrait hand frame.`);
    }
    const row = Math.round(card.y);
    rows.set(row, [...(rows.get(row) ?? []), card.x]);
  }
  if (rows.size !== expectedRows) {
    throw new Error(`Portrait hand uses ${rows.size} rows instead of ${expectedRows}.`);
  }
  for (const positions of rows.values()) {
    positions.sort((a, b) => a - b);
    for (let index = 1; index < positions.length; index += 1) {
      if (positions[index] - positions[index - 1] < minimumPitch) {
        throw new Error(
          `Portrait card pitch is below the ${minimumPitch}px touch-density target.`
        );
      }
    }
  }
}

async function verifyDragSelection(page) {
  const cards = page.locator(".player-hand .playing-card");
  const boxes = await Promise.all([0, 1, 2].map((index) => cards.nth(index).boundingBox()));
  if (boxes.some((box) => !box)) throw new Error("Could not measure cards for drag selection.");
  const y = boxes[0].y + 18;
  await page.mouse.move(boxes[0].x + 10, y);
  await page.mouse.down();
  await page.mouse.move(boxes[1].x + 30, y, { steps: 5 });
  await page.mouse.move(boxes[2].x + 30, y, { steps: 5 });
  await page.mouse.up();
  const selected = await page.locator(".player-hand .playing-card.selected").count();
  if (selected < 3) {
    throw new Error(`Drag-across selected ${selected} cards instead of at least three.`);
  }
  await page.getByRole("button", { name: "Clear selected cards" }).click();
}

async function verifyHintPlacementAndActions(page) {
  const [hint, action, hand] = await Promise.all([
    page.locator(".hint-callout").boundingBox(),
    page.locator(".action-callout").boundingBox(),
    page.locator(".hand-zone").boundingBox()
  ]);
  if (!hint || !action || !hand) throw new Error("Could not measure mobile table callouts.");
  if (hint.y + hint.height > hand.y + 2 || hand.y - (hint.y + hint.height) > 110) {
    throw new Error("Best Play hint is not positioned immediately above the hand.");
  }
  if (action.y + action.height > hand.y + 2 || hand.y - (action.y + action.height) > 45) {
    throw new Error("Last-action status is not positioned immediately above the hand.");
  }
  const actionHeights = await page.locator(".game-actions button").evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().height)
  );
  if (actionHeights.some((height) => height < 44)) {
    throw new Error("A mobile game action is shorter than the 44px touch target.");
  }
}

async function verifyLandscapeHand(page) {
  const cards = page.locator(".player-hand .playing-card");
  if ((await cards.count()) !== 27) throw new Error("Landscape hand does not contain all 27 cards.");
  const metrics = await page.locator(".hand-scroll").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  if (metrics.scrollWidth <= metrics.clientWidth) {
    throw new Error("Landscape hand is not using its intended horizontal card rail.");
  }
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  if (!first || !second || second.x - first.x < 32) {
    throw new Error("Landscape exposed card pitch is below the 32px readability target.");
  }
  const actionHeights = await page.locator(".game-actions button").evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().height)
  );
  if (actionHeights.some((height) => height < 44)) {
    throw new Error("A landscape game action is shorter than the 44px touch target.");
  }
  const pageMetrics = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight
  }));
  if (pageMetrics.documentHeight > pageMetrics.viewportHeight + 2) {
    throw new Error("Landscape table requires unintended vertical scrolling.");
  }
}

async function verifyOffTurnPreselection(browser) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const session = await openRoom(browser, {
      game: "guandan",
      mode: "solo",
      name: "Alex",
      viewport: { width: 390, height: 844 }
    });
    const { page } = session;
    const yourTurn = await page.locator(".seat-bottom").evaluate((seat) =>
      seat.classList.contains("active-seat")
    );
    if (yourTurn) {
      await session.context.close();
      continue;
    }
    const priorAction = (await page.locator(".action-callout").textContent())?.trim();
    await page.locator(".player-hand .playing-card").first().click();
    await page.waitForFunction(
      (prior) => document.querySelector(".action-callout")?.textContent?.trim() !== prior,
      priorAction,
      { timeout: 3_000 }
    );
    if ((await page.locator(".player-hand .playing-card.selected").count()) !== 1) {
      throw new Error("Prepared off-turn card selection was cleared by an opponent action.");
    }
    await session.context.close();
    console.log("Verified off-turn card preparation persists across opponent actions");
    return;
  }
  throw new Error("Could not open a Guan Dan room during an AI turn.");
}

async function verifyMobileFriendJoin(browser) {
  const host = await openRoom(browser, {
    game: "guandan",
    mode: "friends",
    name: "Host",
    viewport: { width: 1280, height: 900 }
  });
  const roomCode = new URL(host.page.url()).pathname.split("/").at(-1);
  const phone = await openHome(browser, { width: 390, height: 844 });
  await phone.page.goto(`${baseUrl}/room/${roomCode}`, { waitUntil: "domcontentloaded" });
  await phone.page.locator("#join-name").fill("Phone Player");
  await phone.page.getByRole("button", { name: "Pig zodiac avatar" }).click();
  await phone.page.waitForTimeout(220);
  await phone.page.screenshot({
    path: path.join(screenshotDir, "10-zodiac-picker-mobile-join.png"),
    fullPage: false
  });
  await phone.page.getByRole("button", { name: "Take my seat" }).click();
  await phone.page.waitForSelector(".waiting-page");
  await phone.page.locator(".lobby-seat", { hasText: "Phone Player" }).locator(".animal-pig").waitFor();

  await host.page.getByRole("button", { name: "Fill open seats with AI" }).click();
  await host.page.getByRole("button", { name: "Deal the cards" }).click();
  await phone.page.waitForSelector(".game-shell");
  await phone.page.waitForSelector(".player-hand .playing-card");
  await phone.page.locator(".hand-label .animal-pig").waitFor();
  const privateCards = await phone.page.locator(".player-hand .playing-card").count();
  if (privateCards !== 27) {
    throw new Error(`Mobile friend received ${privateCards} cards instead of a private 27-card hand.`);
  }
  await host.context.close();
  await phone.context.close();
  console.log("Verified QR-equivalent phone join, private hand, and shared game start");
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  {
    const { context, page } = await openHome(browser, { width: 1440, height: 960 });
    await page.screenshot({
      path: path.join(screenshotDir, "01-launcher-desktop.png"),
      fullPage: false
    });
    await page.locator("#create").screenshot({
      path: path.join(screenshotDir, "02-game-launcher.png")
    });
    await page.locator(".zodiac-step").screenshot({
      path: path.join(screenshotDir, "09-zodiac-avatar-picker.png")
    });
    await context.close();
  }

  {
    const { context, page } = await openRoom(browser, {
      game: "shengji",
      mode: "friends",
      name: "Mei"
    });
    await page.screenshot({
      path: path.join(screenshotDir, "03-qr-friends-lobby.png"),
      fullPage: false
    });
    await context.close();
  }

  {
    const { context, page } = await openRoom(browser, {
      game: "shengji",
      mode: "solo",
      name: "Alex",
      viewport: { width: 1440, height: 1000 }
    });
    await page.waitForSelector(".seat-bottom.active-seat", { timeout: 20_000 });
    await settle(page);
    await page.screenshot({
      path: path.join(screenshotDir, "04-shengji-table.png"),
      fullPage: false
    });
    await context.close();
  }

  {
    const { context, page } = await openGuanDanWithWild(browser, { width: 1440, height: 1000 });
    await page.screenshot({
      path: path.join(screenshotDir, "05-guandan-table.png"),
      fullPage: false
    });
    await context.close();
  }

  {
    const { context, page } = await openHome(browser, { width: 390, height: 844 });
    await page.screenshot({
      path: path.join(screenshotDir, "06-launcher-mobile.png"),
      fullPage: false
    });
    await context.close();
  }

  {
    const { context, page } = await openGuanDanWithWild(browser, { width: 390, height: 844 });
    await verifyPortraitHand(page);
    await page.screenshot({
      path: path.join(screenshotDir, "07-guandan-mobile-table.png"),
      fullPage: false
    });
    await page.locator(".hand-zone").screenshot({
      path: path.join(screenshotDir, "08-guandan-mobile-27-card-hand.png")
    });
    const firstCard = page.locator(".player-hand .playing-card").first();
    await firstCard.click();
    await page.locator(".player-hand .playing-card.selected .selection-check").waitFor();
    await firstCard.click();
    if ((await page.locator(".player-hand .playing-card.selected").count()) !== 0) {
      throw new Error("Tapping a selected portrait card did not clear its selection.");
    }
    await verifyDragSelection(page);
    await page.getByRole("button", { name: /Sort/ }).click();
    await page.locator(".hand-zone").screenshot({
      path: path.join(screenshotDir, "12-guandan-mobile-sort-menu.png")
    });
    await page.getByRole("menuitemradio", { name: /^rank/i }).click();
    if ((await page.locator(".mobile-sort-toggle b").textContent())?.trim() !== "rank") {
      throw new Error("Dedicated mobile Sort menu did not apply Rank mode.");
    }
    await page.getByRole("button", { name: "Suggest best play" }).click();
    await page.locator(".hint-callout").waitFor();
    const hintAction = await page
      .locator(".hint-callout")
      .evaluate((element) =>
        [...element.classList].find((className) => className.startsWith("hint-") && className !== "hint-callout")
      );
    if (hintAction === "hint-play") {
      const hintedCards = await page.locator(".player-hand .playing-card.selected").count();
      if (hintedCards < 1) throw new Error("Best Play hint did not preselect its recommended cards.");
    } else if (hintAction === "hint-pass") {
      await page.locator(".pass-button.hinted").waitFor();
    } else {
      throw new Error(`Unexpected Guan Dan hint action: ${hintAction}`);
    }
    await verifyHintPlacementAndActions(page);
    await page.screenshot({
      path: path.join(screenshotDir, "13-guandan-mobile-best-play-hint.png"),
      fullPage: false
    });
    await context.close();
  }

  {
    const { context, page } = await openRoom(browser, {
      game: "guandan",
      mode: "solo",
      name: "Alex",
      viewport: { width: 360, height: 740 }
    });
    await verifyPortraitHand(page, { expectedRows: 4, minimumPitch: 38 });
    await page.screenshot({
      path: path.join(screenshotDir, "14-guandan-small-phone-4-row-hand.png"),
      fullPage: false
    });
    await context.close();
  }

  {
    const { context, page } = await openGuanDanWithWild(browser, { width: 844, height: 390 });
    await verifyLandscapeHand(page);
    await page.screenshot({
      path: path.join(screenshotDir, "11-guandan-mobile-landscape.png"),
      fullPage: false
    });
    await context.close();
  }

  await verifyMobileFriendJoin(browser);
  await verifyOffTurnPreselection(browser);

  console.log(`Captured 14 screenshots in ${path.relative(projectRoot, screenshotDir)}/`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
