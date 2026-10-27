/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the Socket.IO server when it is hosted on a different domain than the app. */
  readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
