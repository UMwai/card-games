import { io } from "socket.io-client";

const baseUrl = process.env.SMOKE_URL ?? "http://127.0.0.1:4173";

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const callback = (response) => {
      if (!response?.ok) reject(new Error(`${event}: ${response?.error ?? "unknown failure"}`));
      else resolve(response);
    };
    if (payload === undefined) socket.emit(event, callback);
    else socket.emit(event, payload, callback);
  });
}

function waitForState(socket, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("room:state", listener);
      reject(new Error("Timed out waiting for room state."));
    }, timeoutMs);
    const listener = (room) => {
      if (!predicate(room)) return;
      clearTimeout(timeout);
      socket.off("room:state", listener);
      resolve(room);
    };
    socket.on("room:state", listener);
  });
}

async function smoke(game) {
  const host = io(baseUrl, { transports: ["websocket"] });
  const friend = io(baseUrl, { transports: ["websocket"] });
  await Promise.all([
    new Promise((resolve) => host.on("connect", resolve)),
    new Promise((resolve) => friend.on("connect", resolve))
  ]);

  const created = await emit(host, "room:create", {
    game,
    mode: "friends",
    playerName: "Smoke Host",
    avatar: "dragon"
  });
  const joined = await emit(friend, "room:join", {
    code: created.room.code,
    playerName: "Smoke Friend",
    avatar: "pig"
  });
  if (joined.room.yourSeat !== 1) throw new Error(`${game}: friend did not receive seat 2.`);
  if (created.room.players[0].avatar !== "dragon") throw new Error(`${game}: host avatar was not preserved.`);
  if (joined.room.players[1].avatar !== "pig") throw new Error(`${game}: friend avatar was not preserved.`);

  await emit(host, "room:fillBots");
  const playingPromise = waitForState(host, (room) => room.status === "playing" && room.gameState);
  await emit(host, "room:start");
  const playing = await playingPromise;
  if (playing.game !== game) throw new Error(`${game}: wrong game started.`);
  if (playing.players.filter(Boolean).length !== 4) throw new Error(`${game}: table is not full.`);
  if (playing.players.some((player) => player && !player.avatar))
    throw new Error(`${game}: a seated player is missing an avatar.`);
  if (!playing.hand.length) throw new Error(`${game}: host received no private hand.`);
  if (!playing.joinUrl.includes(`/room/${playing.code}`)) throw new Error(`${game}: QR join URL is malformed.`);

  console.log(
    `${game}: room ${playing.code}, ${playing.hand.length}-card private hand, friend join and two AI seats verified`
  );
  host.disconnect();
  friend.disconnect();
}

await smoke("shengji");
await smoke("guandan");
