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

function overlaps(a, b, tolerance = 1) {
  return (
    a.x < b.x + b.width - tolerance &&
    b.x < a.x + a.width - tolerance &&
    a.y < b.y + b.height - tolerance &&
    b.y < a.y + a.height - tolerance
  );
}

async function boxes(page, selectors) {
  const measured = {};
  for (const [name, selector] of Object.entries(selectors)) {
    measured[name] = await page.locator(selector).boundingBox();
    if (!measured[name]) throw new Error(`Could not measure ${selector}.`);
  }
  return measured;
}

/** Fails when something with a higher stacking order paints over `selector`. */
async function verifyNothingCovers(page, selector, label) {
  const blocker = await page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!element) return "a missing element";
    const box = element.getBoundingClientRect();
    const probes = [
      [box.x + box.width / 2, box.y + box.height / 2],
      [box.x + 6, box.y + box.height / 2],
      [box.right - 6, box.y + box.height / 2]
    ];
    for (const [x, y] of probes) {
      const top = document.elementFromPoint(x, y);
      if (!top) return "the viewport edge";
      if (top !== element && !element.contains(top)) {
        return `.${[...top.classList].join(".") || top.tagName.toLowerCase()}`;
      }
    }
    return null;
  }, selector);
  if (blocker) throw new Error(`${label} is painted behind ${blocker}.`);
}

/**
 * The spread rail must never park a card outside its scroll viewport: it is
 * centred while it fits and flush-left plus scrollable once it does not.
 */
async function verifyDesktopHandRail(page) {
  const rail = page.locator(".hand-scroll");
  const cards = page.locator(".player-hand .playing-card");
  const frame = await rail.boundingBox();
  if (!frame) throw new Error("Desktop hand rail is missing.");
  const metrics = await rail.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    paddingLeft: Number.parseFloat(getComputedStyle(element).paddingLeft),
    paddingRight: Number.parseFloat(getComputedStyle(element).paddingRight)
  }));
  const scrollable = metrics.scrollWidth > metrics.clientWidth + 1;

  const first = await cards.first().boundingBox();
  if (!first) throw new Error("Could not measure the first desktop hand card.");
  if (first.x < frame.x - 0.5) {
    throw new Error(
      `The first desktop hand card starts ${(frame.x - first.x).toFixed(1)}px outside the rail and cannot be scrolled into view.`
    );
  }
  if (first.x + first.width > frame.x + frame.width + 0.5) {
    throw new Error("The first desktop hand card is clipped by the right edge of the rail.");
  }

  if (scrollable) {
    const classes = await rail.getAttribute("class");
    if (!classes.includes("hand-fade-end")) {
      throw new Error("An overflowing desktop hand rail shows no scroll affordance.");
    }
    await rail.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await page.waitForTimeout(60);
    const last = await cards.last().boundingBox();
    if (!last || last.x + last.width > frame.x + frame.width + 0.5 || last.x < frame.x - 0.5) {
      throw new Error("The last desktop hand card is not reachable inside the rail.");
    }
    const scrolledClasses = await rail.getAttribute("class");
    if (!scrolledClasses.includes("hand-fade-start")) {
      throw new Error("A scrolled desktop hand rail drops its start-edge affordance.");
    }
    await rail.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await page.waitForTimeout(60);
  } else {
    const hand = await page.locator(".player-hand").boundingBox();
    if (!hand) throw new Error("Could not measure the desktop hand rail contents.");
    const startGap = hand.x - (frame.x + metrics.paddingLeft);
    const endGap = frame.x + frame.width - metrics.paddingRight - (hand.x + hand.width);
    if (Math.abs(startGap - endGap) > 2) {
      throw new Error("A desktop hand rail that fits its viewport is not centred.");
    }
  }
}

/** The hand-zone header must stay readable and clear of the cards below it. */
async function verifyDesktopHandLabel(page) {
  const rail = await page.locator(".hand-scroll").boundingBox();
  const tray = await page.locator(".sort-tray").boundingBox();
  if (!rail || !tray) throw new Error("Could not measure the desktop hand header.");
  const parts = await page.locator(".hand-label > *").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        text: element.textContent.trim().slice(0, 40),
        truncated: element.scrollWidth > element.clientWidth + 1,
        primary: element.tagName === "B",
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height
      };
    })
  );
  if (parts.length === 0) throw new Error("The desktop hand header rendered no content.");
  for (const part of parts) {
    if (part.primary && part.truncated) {
      throw new Error(`The desktop hand label truncates "${part.text}".`);
    }
    if (part.y + part.height > rail.y + 1) {
      throw new Error(`The desktop hand label line "${part.text}" is buried under the cards.`);
    }
    if (overlaps(part, tray)) {
      throw new Error(`The desktop hand label line "${part.text}" collides with the sort tray.`);
    }
  }
}

/**
 * Seat badge, hint and last-action share one column above the hand. They must
 * stack without touching, and the status line must never hide behind the badge.
 */
async function verifyDesktopStatusStack(page) {
  const measured = await boxes(page, {
    action: ".action-callout",
    seat: ".seat-bottom",
    hand: ".hand-zone",
    center: ".center-table",
    seatTop: ".seat-top",
    ribbon: ".score-ribbon"
  });
  if (overlaps(measured.action, measured.seat)) {
    throw new Error("The last-action callout collides with the bottom seat badge.");
  }
  if (overlaps(measured.action, measured.hand)) {
    throw new Error("The last-action callout collides with the hand zone.");
  }
  if (overlaps(measured.seat, measured.center)) {
    throw new Error("The bottom seat badge collides with the played cards.");
  }
  if (overlaps(measured.seatTop, measured.center)) {
    throw new Error("The top seat badge collides with the played cards.");
  }
  if (overlaps(measured.ribbon, measured.center)) {
    throw new Error("The score ribbon collides with the played cards.");
  }
  if (measured.hand.y - (measured.action.y + measured.action.height) > 60) {
    throw new Error("The last-action callout drifted away from the hand it describes.");
  }
  await verifyNothingCovers(page, ".action-callout", "The last-action callout");

  await page.getByRole("button", { name: "Suggest best play" }).click();
  await page.locator(".hint-callout").waitFor({ timeout: 3_000 });
  const withHint = await boxes(page, {
    hint: ".hint-callout",
    action: ".action-callout",
    seat: ".seat-bottom",
    hand: ".hand-zone"
  });
  if (overlaps(withHint.hint, withHint.seat)) {
    throw new Error("The best-play hint collides with the bottom seat badge.");
  }
  if (overlaps(withHint.hint, withHint.action)) {
    throw new Error("The best-play hint collides with the last-action callout.");
  }
  if (overlaps(withHint.hint, withHint.hand)) {
    throw new Error("The best-play hint collides with the hand zone.");
  }
  await verifyNothingCovers(page, ".hint-callout", "The best-play hint");
  await verifyNothingCovers(page, ".action-callout", "The last-action callout");
  await page.getByRole("button", { name: "Dismiss play hint" }).click();
  await page.locator(".hint-callout").waitFor({ state: "detached" });
  if ((await page.locator(".player-hand .playing-card.selected").count()) > 0) {
    await page.getByRole("button", { name: "Clear selected cards" }).click();
  }
}

async function verifyDesktopTable(page) {
  const viewport = page.viewportSize();
  const stage = await page.locator(".table-stage").boundingBox();
  const firstCard = await page.locator(".player-hand .playing-card").first().boundingBox();
  if (!viewport || !stage || !firstCard) {
    throw new Error("Could not measure the desktop table.");
  }
  if (
    Math.abs(stage.x) > 1 ||
    Math.abs(stage.y) > 1 ||
    Math.abs(stage.width - viewport.width) > 2 ||
    Math.abs(stage.height - viewport.height) > 2
  ) {
    throw new Error("The desktop playing surface is not using the full viewport.");
  }
  // Laptop-height desktops shrink the cards on purpose (see the max-height
  // tiers in styles.css); anything shorter than that curve is a regression.
  const expectedCardHeight = Math.min(174, Math.max(122, 0.26 * viewport.height - 55));
  if (
    firstCard.height < expectedCardHeight - 2 ||
    firstCard.width < expectedCardHeight * 0.7011 - 2
  ) {
    throw new Error(
      `Desktop hand cards (${Math.round(firstCard.width)}x${Math.round(
        firstCard.height
      )}) are below the readability target for a ${viewport.height}px-tall viewport.`
    );
  }
  if (firstCard.y < 0 || firstCard.y + firstCard.height > viewport.height + 1) {
    throw new Error("A large desktop hand card is clipped outside the viewport.");
  }
  const centerCard = page.locator(".center-table .playing-card").first();
  if ((await centerCard.count()) > 0) {
    const box = await centerCard.boundingBox();
    if (!box || box.width < 70 || box.height < 100) {
      throw new Error("A desktop center-play card is below the readability target.");
    }
  }
  await verifyDesktopHandRail(page);
  await verifyDesktopHandLabel(page);
  await verifyDesktopStatusStack(page);
}

async function verifyLandscapeHand(page) {
  const cards = page.locator(".player-hand .playing-card");
  if ((await cards.count()) !== 27) throw new Error("Landscape hand does not contain all 27 cards.");
  const handScroll = page.locator(".hand-scroll");
  const metrics = await handScroll.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  if (metrics.scrollWidth <= metrics.clientWidth) {
    throw new Error("Landscape hand is not using its intended horizontal card rail.");
  }
  const frame = await handScroll.boundingBox();
  if (!frame) throw new Error("Landscape hand frame is missing.");
  const cardBoxes = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    })
  );
  if (
    cardBoxes.some(
      ({ top, bottom }) => top < frame.y - 1 || bottom > frame.y + frame.height + 1
    )
  ) {
    throw new Error("A landscape card is vertically clipped by the hand rail.");
  }
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  if (!first || !second || second.x - first.x < 32) {
    throw new Error("Landscape exposed card pitch is below the 32px readability target.");
  }
  if (first.x < frame.x + 4) {
    throw new Error("The first landscape card lacks a safe inset at the start of the rail.");
  }
  await handScroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const last = await cards.last().boundingBox();
  if (!last || last.x + last.width > frame.x + frame.width - 4) {
    throw new Error("The last landscape card lacks a safe inset at the end of the rail.");
  }
  await handScroll.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await cards.nth(2).click({ position: { x: 10, y: 18 } });
  const selectionMetrics = await Promise.all(
    [cards.nth(2), cards.nth(3)].map((card) =>
      card.evaluate((element) => ({
        zIndex: Number(getComputedStyle(element).zIndex),
        selected: element.classList.contains("selected")
      }))
    )
  );
  if (!selectionMetrics[0].selected || selectionMetrics[0].zIndex >= selectionMetrics[1].zIndex) {
    throw new Error("A selected landscape card obscures the next card in the hand.");
  }
  const selected = await cards.nth(2).boundingBox();
  if (!selected || selected.y < frame.y - 1 || selected.y + selected.height > frame.y + frame.height + 1) {
    throw new Error("A selected landscape card is clipped by the hand rail.");
  }
  await page.getByRole("button", { name: "Clear selected cards" }).click();
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
    await verifyDesktopTable(page);
    await page.screenshot({
      path: path.join(screenshotDir, "04-shengji-table.png"),
      fullPage: false
    });
    await context.close();
  }

  {
    const { context, page } = await openGuanDanWithWild(browser, { width: 1440, height: 1000 });
    await verifyDesktopTable(page);
    await page.screenshot({
      path: path.join(screenshotDir, "05-guandan-table.png"),
      fullPage: false
    });
    // Laptop viewports are the common desktop case, and the stage is a fixed
    // vertical stack: re-run every table assertion at the short end of it.
    for (const viewport of [
      { width: 1440, height: 800 },
      { width: 1280, height: 720 }
    ]) {
      await page.setViewportSize(viewport);
      await settle(page);
      await verifyDesktopTable(page);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await settle(page);
    await page.screenshot({
      path: path.join(screenshotDir, "15-guandan-laptop-table.png"),
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

  console.log(`Captured 15 screenshots in ${path.relative(projectRoot, screenshotDir)}/`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
