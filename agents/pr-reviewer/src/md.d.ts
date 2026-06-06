// Markdown files are inlined as raw strings by Rspack (`asset/source`).
declare module "*.md" {
  const content: string;
  export default content;
}
