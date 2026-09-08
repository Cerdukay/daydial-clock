const targets = await fetch("http://127.0.0.1:9222/json/list").then((response) => response.json());
const target = targets.find((candidate) => candidate.type === "page");

if (!target) {
  throw new Error("No Android WebView page target found");
}

const socket = new WebSocket(target.webSocketDebuggerUrl.replace("localhost", "127.0.0.1"));
const pending = new Map();
let nextId = 1;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const resolver = pending.get(message.id);
  if (resolver) {
    pending.delete(message.id);
    resolver(message);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

const command = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const response = await command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return response.result.result.value;
};

if ((await evaluate("location.pathname")) !== "/event/new") {
  await evaluate(`location.href = '/event/new'`);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if ((await evaluate("location.pathname")) === "/event/new") break;
  }
}

const title = `Android write QA ${Date.now()} ${"responsive typing ".repeat(10)}`.trim();
await evaluate(`(() => {
  const input = document.querySelector('#event-title');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, '');
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  input.focus();
})()`);

const latencies = [];
for (const character of title) {
  const startedAt = performance.now();
  await command("Input.insertText", { text: character });
  latencies.push(performance.now() - startedAt);
}
const sorted = [...latencies].sort((left, right) => left - right);
const typedValue = await evaluate(`document.querySelector('#event-title').value`);
await evaluate(`document.querySelector('[aria-label="Save event"]')?.click()`);
for (let attempt = 0; attempt < 60; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  if ((await evaluate("location.pathname")) === "/") break;
}

const result = {
  titleLength: title.length,
  typedExactly: typedValue === title,
  maxCharacterLatencyMs: Math.round(Math.max(...latencies)),
  p95CharacterLatencyMs: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
  returnedHome: (await evaluate("location.pathname")) === "/",
  savedTitlePersisted: await evaluate(
    `Object.values(localStorage).some((value) => value.includes(${JSON.stringify(title)}))`,
  ),
  nativePluginsReady: await evaluate(
    `Boolean(window.Capacitor?.Plugins?.Preferences && window.Capacitor?.Plugins?.DayDialWidget)`,
  ),
};

console.log(JSON.stringify(result));
socket.close();
process.exit(
  result.typedExactly &&
    result.returnedHome &&
    result.savedTitlePersisted &&
    result.nativePluginsReady
    ? 0
    : 1,
);
