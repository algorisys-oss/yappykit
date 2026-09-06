/// <reference types="vite-plugin-pwa/client" />

// CSS side-effect imports from the vendored zen-ui packages.
declare module '@algorisys/zen-ui-solid/styles';
declare module '@algorisys/zen-ui-core/tokens.css';

// The Contribute link's payment URL, supplied by the deployment host and absent
// in a fork's build. See src/lib/support.ts.
interface ImportMetaEnv {
  readonly VITE_SUPPORT_RAZORPAY_URL?: string;
}
