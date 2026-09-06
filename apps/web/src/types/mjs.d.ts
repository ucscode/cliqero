declare module "*.mjs" {
  const plugin: (...args: any[]) => any;
  export default plugin;
}
