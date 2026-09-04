/**
 * 把 AI 回复里的 markdown 压成纯文本，供单行预览使用。
 *
 * 预览行是截断的一行字，渲染粗体/列表只会变成噪音；但把 `**17 件商品**`
 * 原样显示同样糟糕——线上就出现过。这里只做去标记，不做渲染。
 */
export function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
