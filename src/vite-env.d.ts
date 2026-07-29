/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
    readonly VITE_API_ORIGIN?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
