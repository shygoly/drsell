import { Card, CardContent } from "@/components/ui/card";

/**
 * ComingSoon — Stitch 稿中存在但尚未实现的入口所用的占位页。
 *
 * 稿中侧边栏与顶栏共 9 + 3 个入口，其中 6 个当前无实现。按「照搬导航 + 建占位页」
 * 的决策，这些路由存在且可点击，但明确告知商家功能未上线，不做虚假界面。
 */
export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-accent-deep text-display-lg font-bold">{title}</h1>
      <Card className="rounded-lg p-6">
        <CardContent className="flex flex-col items-center gap-3 px-0 py-16 text-center">
          <p className="text-accent-deep text-base font-semibold">Coming soon</p>
          <p className="text-muted-foreground max-w-md text-sm">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
