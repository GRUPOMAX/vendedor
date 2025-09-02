// EventTarget leve para comunicar Console -> App
const bus = new EventTarget();

export const devBus = bus;

export function emitDev(type, detail = {}) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function onDev(type, fn) {
  const h = (e) => fn(e.detail);
  bus.addEventListener(type, h);
  return () => bus.removeEventListener(type, h);
}
