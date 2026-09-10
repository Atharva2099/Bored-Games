/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TURN_ENDPOINT?: string;
  /** 'ws' (default) uses the WebSocket relay; 'p2p' forces the Trystero
   * WebRTC mesh fallback. See src/net/transport.ts. */
  readonly VITE_TRANSPORT?: string;
  /** Base URL of the room-worker Cloudflare Worker. Empty disables the WS
   * transport and falls back to Trystero even if VITE_TRANSPORT='ws'. */
  readonly VITE_ROOM_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
