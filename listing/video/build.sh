#!/bin/bash
# listing/video/build.sh — 用 listing/screenshots/ 里的静态图合成上架演示视频。
#
# 为什么是「图片合成」而不是录屏：这台机器的终端没有屏幕录制权限（ffmpeg
# avfoundation 会挂起等待授权），而经浏览器桥接逐帧抓图只有 ~2.8fps，
# 离可用视频差约 9 倍。截图本身是真实应用的实拍，不是渲染稿。
#
# 重新生成：bash listing/video/build.sh
# 依赖：ffmpeg（brew install ffmpeg）
#
# 性能注记：早先版本用 zoompan 做缓推运镜、并两两 xfade 拼接，实测 2 秒画面要
# 35.2s（不带只需 1.4s，慢 25 倍），加上 xfade 串行重编码是 O(n^2)，8 个镜头
# 跑 20 分钟还没过半。现在改为静帧 + 各段自带淡入淡出 + concat 流拷贝，全片约 1 分钟。

set -euo pipefail
cd "$(dirname "$0")/../.."

SHOTS=listing/screenshots
OUT=listing/video/dr-sell-demo.mp4
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_R="/System/Library/Fonts/Supplemental/Arial.ttf"
[ -f "$FONT" ] || FONT="/Library/Fonts/Arial Unicode.ttf"
[ -f "$FONT_R" ] || FONT_R="$FONT"

SEC=9          # 每个镜头时长
FPS=30
W=1920; H=1080
IW=1600; IH=900   # 截图原尺寸；整幅放进画布，字幕另占底部，绝不遮挡界面

# 镜头顺序即叙事：先让人看见顾客侧发生了什么，再讲商家怎么装、怎么管。
# 文案只描述画面里真实存在的东西——描述与画面不符是审核驳回项。
shot() { # shot <文件名> <主标题> <副标题>
  local src="$SHOTS/$1" idx="$2" title="$3" sub="$4"
  ffmpeg -y -loglevel error -loop 1 -t "$SEC" -i "$src" \
    -vf "
      scale=${IW}:${IH},setsar=1,
      pad=${W}:${H}:(ow-iw)/2:36:color=0x0A1F18,
      drawtext=fontfile='${FONT}':text='${title}':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=980,
      drawtext=fontfile='${FONT_R}':text='${sub}':fontcolor=white@0.78:fontsize=27:x=(w-text_w)/2:y=1038,
      fade=t=in:st=0:d=0.6,fade=t=out:st=$(python3 -c "print($SEC-0.8)"):d=0.8
    " -c:v libx264 -pix_fmt yuv420p -r "$FPS" -preset veryfast -crf 21 "$TMP/$idx.mp4"
}

shot 08-storefront-widget.jpg 01 \
  "A chat button on your storefront" \
  "One toggle in your theme. No code, no theme edits."

shot 09-storefront-chat.jpg 02 \
  "It answers from your real catalogue" \
  "Live product names, prices and stock — in the shopper’s own language."

shot 04-setup-welcome.jpg 03 \
  "Guided setup, four steps" \
  "You choose what the assistant is allowed to read."

shot 05-setup-widget.jpg 04 \
  "Make it yours" \
  "Colour, position and greeting. Your store data syncs in the background."

shot 06-setup-done.jpg 05 \
  "Live on your storefront" \
  "Setup takes about a minute."

shot 02-inbox.jpg 06 \
  "Every conversation, in your admin" \
  "Full transcripts. Take over any chat yourself."

shot 01-dashboard.jpg 07 \
  "See what shoppers are asking" \
  "Conversation volume and how much the AI resolves on its own."

shot 03-widget-config.jpg 08 \
  "Tune it any time" \
  "Appearance and quick replies, with a live preview."

# 拼接：各段已自带淡入淡出，直接 concat 流拷贝，不再重编码
: > "$TMP/list.txt"
SHOT_COUNT=0
for f in "$TMP"/0*.mp4; do echo "file '$f'" >> "$TMP/list.txt"; SHOT_COUNT=$((SHOT_COUNT+1)); done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/final.mp4"
CUR="$TMP/final.mp4"

mkdir -p "$(dirname "$OUT")"
cp "$CUR" "$OUT"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")
SIZE=$(ls -l "$OUT" | awk '{print $5}')
echo "生成 $OUT"
echo "  时长 ${DUR}s   大小 ${SIZE} B   ${W}x${H} @ ${FPS}fps   ${SHOT_COUNT} 个镜头"
echo "  截图 ${IW}x${IH} 整幅置入，字幕独立占底部，不遮挡界面"
