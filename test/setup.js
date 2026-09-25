// Node 22.0.0 exposes fetch lazily. Read it before mock.method inspects its
// property descriptor so tests can replace the initialized function.
void globalThis.fetch
