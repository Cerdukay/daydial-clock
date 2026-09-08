const cycleCount = Number.parseInt(process.argv[2] ?? "60", 10);
const cdpUrl = process.env.DAYDIAL_CDP_URL ?? "http://127.0.0.1:9222";
const soakMode = process.argv[3] ?? process.env.DAYDIAL_SOAK_MODE ?? "route";
const commandTimeoutMs = 10_000;

if (!Number.isInteger(cycleCount) || cycleCount < 1) {
  throw new Error("Cycle count must be a positive integer");
}

const targets = await fetch(`${cdpUrl}/json/list`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === "page");

if (!target) {
  throw new Error("No Android WebView page target found");
}

const socket = new WebSocket(target.webSocketDebuggerUrl.replace("localhost", "127.0.0.1"));
const pending = new Map();
let nextId = 1;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const entry = pending.get(message.id);
  if (!entry) return;
  clearTimeout(entry.timeoutId);
  pending.delete(message.id);
  if (message.error) {
    entry.reject(new Error(`${message.error.code}: ${message.error.message}`));
  } else {
    entry.resolve(message);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

const command = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    const timeoutId = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out after ${commandTimeoutMs}ms`));
    }, commandTimeoutMs);
    pending.set(id, { resolve, reject, timeoutId });
    socket.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const response = await command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  const result = response.result.result;
  if (result.subtype === "error") throw new Error(result.description);
  return result.value;
};

const waitFor = async (expression, attempts = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};

const typeIntoFocusedInput = async (text) => {
  const latencies = [];
  for (const character of text) {
    const startedAt = performance.now();
    await command("Input.insertText", { text: character });
    latencies.push(performance.now() - startedAt);
  }
  return latencies;
};

const percentile = (values, amount) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * amount))];
};

const allTypingLatencies = [];
const saveLatencies = [];
const startedAt = performance.now();

if ((await evaluate(`location.pathname`)) !== "/") {
  const returned = await evaluate(`(() => {
    const button = document.querySelector('[aria-label="Back"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!returned || !(await waitFor(`location.pathname === '/'`))) {
    throw new Error("Unable to return to the home route before the soak run");
  }
}

if (soakMode === "continuous") {
  const opened = await evaluate(`(() => {
    const button = document.querySelector('[aria-label="New event"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!opened || !(await waitFor(`location.pathname === '/event/new'`))) {
    throw new Error("Continuous mode could not open the new event editor");
  }

  for (let cycle = 1; cycle <= cycleCount; cycle += 1) {
    const cycleStartedAt = performance.now();
    const text = `continuous-${String(cycle).padStart(3, "0")} ${"responsive writing ".repeat(8)}`;
    await evaluate(`(() => {
      const input = document.querySelector('#event-title');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '');
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      input.focus();
      return true;
    })()`);
    const latencies = await typeIntoFocusedInput(text);
    allTypingLatencies.push(...latencies);
    console.log(
      JSON.stringify({
        type: "cycle",
        mode: soakMode,
        cycle,
        cycleDurationMs: Math.round(performance.now() - cycleStartedAt),
        typingP95Ms: Math.round(percentile(latencies, 0.95)),
        typingMaxMs: Math.round(Math.max(...latencies)),
      }),
    );
  }

  console.log(
    JSON.stringify({
      type: "summary",
      mode: soakMode,
      cycles: cycleCount,
      keystrokes: allTypingLatencies.length,
      durationMs: Math.round(performance.now() - startedAt),
      typingP95Ms: Math.round(percentile(allTypingLatencies, 0.95)),
      typingP99Ms: Math.round(percentile(allTypingLatencies, 0.99)),
      typingMaxMs: Math.round(Math.max(...allTypingLatencies)),
    }),
  );
  socket.close();
  process.exit(0);
}

if (soakMode !== "route") {
  throw new Error(`Unsupported soak mode: ${soakMode}`);
}

for (let cycle = 1; cycle <= cycleCount; cycle += 1) {
  const cycleStartedAt = performance.now();
  const title =
    `SOAK-${String(cycle).padStart(3, "0")}-${Date.now()} ${"writing remains responsive ".repeat(6)}`.trim();

  if ((await evaluate(`location.pathname`)) !== "/") {
    throw new Error(`Cycle ${cycle}: expected the home route before opening the editor`);
  }
  const opened = await evaluate(`(() => {
    const button = document.querySelector('[aria-label="New event"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!opened) throw new Error(`Cycle ${cycle}: new event button was not available`);
  if (
    !(await waitFor(
      `location.pathname === '/event/new' && Boolean(document.querySelector('#event-title'))`,
    ))
  ) {
    throw new Error(`Cycle ${cycle}: new event editor did not become ready`);
  }

  await evaluate(`(() => {
    const input = document.querySelector('#event-title');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    input.focus();
  })()`);
  const createTypingLatencies = await typeIntoFocusedInput(title);
  allTypingLatencies.push(...createTypingLatencies);

  const createSaveStartedAt = performance.now();
  await evaluate(`document.querySelector('[aria-label="Save event"]')?.click()`);
  if (!(await waitFor(`location.pathname === '/'`))) {
    throw new Error(`Cycle ${cycle}: create save did not return home`);
  }
  saveLatencies.push(performance.now() - createSaveStartedAt);

  const persisted = await evaluate(
    `Object.values(localStorage).some((value) => value.includes(${JSON.stringify(title)}))`,
  );
  if (!persisted) throw new Error(`Cycle ${cycle}: created title was not persisted`);

  const cycleDurationMs = performance.now() - cycleStartedAt;
  console.log(
    JSON.stringify({
      type: "cycle",
      cycle,
      cycleDurationMs: Math.round(cycleDurationMs),
      typingP95Ms: Math.round(percentile(createTypingLatencies, 0.95)),
      typingMaxMs: Math.round(Math.max(...createTypingLatencies)),
      latestSaveMs: Math.round(saveLatencies.at(-1)),
    }),
  );
}

const result = {
  type: "summary",
  cycles: cycleCount,
  keystrokes: allTypingLatencies.length,
  durationMs: Math.round(performance.now() - startedAt),
  typingP95Ms: Math.round(percentile(allTypingLatencies, 0.95)),
  typingP99Ms: Math.round(percentile(allTypingLatencies, 0.99)),
  typingMaxMs: Math.round(Math.max(...allTypingLatencies)),
  saveP95Ms: Math.round(percentile(saveLatencies, 0.95)),
  saveMaxMs: Math.round(Math.max(...saveLatencies)),
  nativePluginsReady: await evaluate(
    `Boolean(window.Capacitor?.Plugins?.Preferences && window.Capacitor?.Plugins?.DayDialWidget && window.Capacitor?.Plugins?.Keyboard)`,
  ),
};

console.log(JSON.stringify(result));
socket.close();
