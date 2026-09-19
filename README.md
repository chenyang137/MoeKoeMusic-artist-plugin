# 歌手写真轮播插件

为 MoeKoeMusic 播放器添加歌手写真轮播功能，在全屏歌词界面展示歌手写真背景图并自动轮播。

<img width="1670" height="1111" alt="图片" src="https://github.com/user-attachments/assets/1e2249a3-521e-4406-b9c2-738aa7bd038b" />


## 功能特性

- 📸 **获取歌手写真**：从酷狗开放平台 API 获取高质量歌手写真图片
- 🔄 **自动轮播**：默认每 10 秒自动切换下一张写真图片
- 🎨 **平滑过渡**：使用双缓冲技术实现淡入淡出效果，避免闪烁
- 👥 **多歌手支持**：支持合唱歌曲，自动合并多个歌手的写真并交替播放
- 🔍 **智能搜索**：自动搜索歌手 ID，无需手动配置
- 📱 **响应式设计**：适配不同屏幕尺寸和分辨率
- ✨ **高清显示**：优化图片渲染，确保写真清晰显示
- 🎵 **智能切换**：检测歌曲切换，自动更新对应歌手写真

### 右键菜单（酷狗风格）

在全屏歌词界面的空白处点击鼠标右键，弹出操作菜单：

- 🖼 **选择写真参加轮播**：打开写真选择弹窗，网格浏览全部写真
  - 顶部按歌手分标签切换（类似酷狗），单歌手时也显示歌手名
  - 点击勾选 / 取消勾选要参加轮播的图片，支持「全选本歌手 / 取消本歌手」
  - 至少保留一张参加轮播
  - **右键任意缩略图**可放大预览该写真
- 💾 **保存当前写真**：把当前正在播放的背景写真直接下载到本地（经 Service Worker 跨域拉取，规避 CORS）
- ⏱ **轮播间隔设置**：在 3 秒 ~ 10 分钟之间自定义，提供 5s / 10s / 15s / 30s / 60s 预设和自定义秒数，自动保存到 `chrome.storage.local`，重启后依然生效

### 写真大图预览（Lightbox）

- 在写真选择弹窗里右键任意缩略图，即可放大查看完整写真
- 大图界面可直接点「💾 保存写真」下载原图
- 按 `Esc` 或点击遮罩关闭

## 安装方法

### 方法一：手动安装

1. 确保 MoeKoeMusic 已关闭
2. 将插件目录复制到 MoeKoeMusic 的插件目录：
   ```bash
   # macOS/Linux
   cp -r artist-wallpaper-rotation /path/to/MoeKoeMusic/plugins/extensions/
   
   # Windows
   xcopy /E /I artist-wallpaper-rotation "C:\path\to\MoeKoeMusic\plugins\extensions\artist-wallpaper-rotation"
   ```

3. 启动 MoeKoeMusic
4. 在设置中启用插件

### 方法二：通过应用内安装

1. 打开 MoeKoeMusic 设置
2. 进入「扩展管理」页面
3. 点击「打开插件目录」
4. 将 `artist-wallpaper-rotation` 文件夹复制到插件目录
5. 刷新页面或重启应用

## 使用说明

1. 播放任意歌曲
2. 点击播放器打开全屏歌词界面
3. 背景将自动显示歌手写真并开始轮播
4. 如果没有歌手写真，将回退到专辑封面
5. **右键空白处**可调出操作菜单：
   - 选择要参加轮播的写真
   - 保存当前写真
   - 修改轮播间隔

## 技术实现

### 架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Content Script │────▶│ Background Worker│────▶│  External APIs  │
│   (注入页面)     │◀────│  (IPC 通信)       │◀────│  (酷狗 API)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### 核心组件

- **manifest.json**: 插件配置文件（Manifest V3）
- **background.js**: Service Worker，处理与外部 API 的通信，以及跨域图片下载（`DOWNLOAD_IMAGE`）转 base64，供 content script 触发保存
- **content.js**: 注入到页面的脚本，实现写真轮播逻辑、右键菜单、写真选择弹窗、间隔设置、大图预览
- **styles.css**: 样式文件，提供平滑过渡效果、右键菜单 / 弹窗 / 大图预览的深色毛玻璃样式

### 双缓冲机制

使用两个背景图层交替切换，实现平滑的淡入淡出效果：

```javascript
// 图层 1 (可见)          // 图层 2 (隐藏)
opacity: 1               opacity: 0
background: image1       background: image2

// 切换时
↓

// 图层 1 (隐藏)          // 图层 2 (可见)
opacity: 0               opacity: 1
background: image1       background: image2
```

为防止写真数量多、连续切换时多个 `requestAnimationFrame` 排队导致图层状态错乱（两张图同时可见），会跟踪并取消待执行的切换帧；同时通过「轮播代 token」（`rotationToken`）在切歌 / 重启轮播时立即作废旧的在途回调，避免旧歌手写真残留。

### 多歌手写真

- 自动按 `、,，;；` 等分隔符拆分歌手 ID 与歌手名
- 按歌手分组成两个以上图组，交替播放
- 写真选择弹窗顶部以歌手标签区分展示，标签与图组严格一一对应

## API 说明

### 获取歌手写真

```
GET https://openapicdnretry.kugou.com/kmr/v1/author/extend
Query Parameters:
  - fields_pack: allimages
  - authorimg_type: 2,3
  - entity_id: {歌手 ID}
```

### 搜索歌手 ID

```
GET http://127.0.0.1:6521/search
Query Parameters:
  - keywords: {歌手名称}
  - type: author
```

## 配置选项

轮播间隔默认 10000 毫秒，可在播放界面右键菜单中直接修改（范围 3 秒 ~ 10 分钟），并自动持久化到 `chrome.storage.local`，key 为 `rotationInterval`。

如需恢复默认值，清除该存储项即可：

```javascript
chrome.storage.local.remove('rotationInterval');
```

## 兼容性

- ✅ MoeKoeMusic v1.5.9
- ✅ Electron 20+
- ✅ Chrome Extension Manifest V3

## 故障排除

### 写真不显示

1. 检查网络连接
2. 确认歌手 ID 是否正确
3. 查看控制台错误信息

### 轮播卡顿

1. 适当增大轮播间隔时间
2. 检查图片加载速度
3. 清理浏览器缓存

### 多歌手写真重复

插件会自动去重，如果仍有重复，请清除 localStorage 后重试。

### 写真选择弹窗里图片重叠 / 留白

CSS 使用 `padding-bottom` 比例法固定 16:9 单元格，图片绝对定位铺满。若仍异常，请确认已强制刷新（Ctrl + Shift + R）或在扩展管理页重新加载插件，以加载最新 `styles.css`。

## 开发调试

1. 打开 MoeKoeMusic 开发者工具
2. 切换到 Console 标签
3. 查看 `[ArtistWallpaper]` 前缀的日志

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 致谢

- 感谢酷狗音乐开放平台提供的 API
- 感谢 MoeKoeMusic 项目团队
