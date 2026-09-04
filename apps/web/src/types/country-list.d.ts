declare module "country-list" {
  export function getData(): Array<{ code: string; name: string }>;
}
