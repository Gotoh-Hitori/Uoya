// Adapted from chat-demo-main, Copyright (c) 2026 DeepSeek, MIT.
// See public/social-chat/CHAT-DEMO-LICENSE.txt.
const LINE_BREAK = /\r\n|\r|\n/g;
class ServerSentEventDecoder {
  buffer = "";
  data = "";
  hasData = false;
  eventType = "";
  lastEventId = "";
  /** 输入一段已解码的文本，返回其中完整的事件 */
  push(text) {
    this.buffer += text;
    if (this.buffer.length + this.data.length > 1048576) throw new Error("SSE event too large");
    const events = [];
    let lineStart = 0;
    LINE_BREAK.lastIndex = 0;
    for (let match = LINE_BREAK.exec(this.buffer); match; match = LINE_BREAK.exec(this.buffer)) {
      if (match[0] === "\r" && LINE_BREAK.lastIndex === this.buffer.length) {
        break;
      }
      const event = this.processLine(this.buffer.slice(lineStart, match.index));
      if (event) {
        events.push(event);
      }
      lineStart = LINE_BREAK.lastIndex;
    }
    this.buffer = this.buffer.slice(lineStart);
    return events;
  }
  /** 流结束：结尾的 CR 是完整的换行，其余未以空行结尾的事件按规范丢弃 */
  end() {
    const event = this.buffer.endsWith("\r") ? this.processLine(this.buffer.slice(0, -1)) : null;
    this.buffer = "";
    this.data = "";
    this.hasData = false;
    this.eventType = "";
    return event ? [event] : [];
  }
  processLine(line) {
    if (line === "") {
      return this.dispatch();
    }
    if (line.startsWith(":")) {
      return null;
    }
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    switch (field) {
      case "data":
        this.data = this.hasData ? `${this.data}
${value}` : value;
        this.hasData = true;
        break;
      case "event":
        this.eventType = value;
        break;
      case "id":
        if (!value.includes("\0")) {
          this.lastEventId = value;
        }
        break;
      default:
        break;
    }
    return null;
  }
  dispatch() {
    const event = this.hasData ? { event: this.eventType || "message", data: this.data, lastEventId: this.lastEventId } : null;
    this.data = "";
    this.hasData = false;
    this.eventType = "";
    return event;
  }
}
async function* readServerSentEvents(stream, signal) {
  const reader = stream.getReader();
  const onAbort = () => {
    reader.cancel(signal?.reason).catch(() => {
    });
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const textDecoder = new TextDecoder();
  const decoder = new ServerSentEventDecoder();
  let finished = false;
  try {
    for (; ; ) {
      if (signal?.aborted) throw signal.reason || new Error("aborted");
      const { done, value } = await reader.read();
      if (signal?.aborted) throw signal.reason || new Error("aborted");
      if (done) {
        finished = true;
        yield* decoder.push(textDecoder.decode());
        yield* decoder.end();
        return;
      }
      yield* decoder.push(textDecoder.decode(value, { stream: true }));
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (!finished) {
      reader.cancel().catch(() => {
      });
    }
    reader.releaseLock();
  }
}
export {
  ServerSentEventDecoder,
  readServerSentEvents
};
