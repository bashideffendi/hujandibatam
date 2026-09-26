// Export "hls.js/light" nggak punya .d.mts sendiri — tipe-nya identik dengan build penuh.
declare module "hls.js/light" {
  export * from "hls.js";
  export { default } from "hls.js";
}
