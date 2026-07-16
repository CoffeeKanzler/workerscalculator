// Plan export/import and share links. Share links gzip the state with the
// native CompressionStream API (no dependencies) into the URL fragment.

const b64url = {
  encode(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  },
  decode(str) {
    const s = atob(str.replaceAll('-', '+').replaceAll('_', '/'));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  },
};

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function stateToFragment(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  const gz = await pipe(raw, new CompressionStream('gzip'));
  return b64url.encode(gz);
}

export async function fragmentToState(frag) {
  const gz = b64url.decode(frag);
  const raw = await pipe(gz, new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(raw));
}

export function downloadJson(obj, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
