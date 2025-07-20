# Service Worker 错误修复指南

## 🚨 问题：Service worker registration failed. Status code: 15

### 已实施的修复方案

1. **简化了background.js文件**
   - 移除了复杂的功能
   - 使用现代的async/await语法
   - 添加了错误处理

2. **创建了最简化版本**
   - `background_simple.js` - 用于测试
   - 已更新manifest.json使用简化版本

### 🔧 立即解决步骤

1. **重新加载扩展程序**
   ```
   1. 打开 chrome://extensions/
   2. 找到"音频转文本助手"
   3. 点击"重新加载"按钮
   4. 检查是否还有错误
   ```

2. **如果仍有错误，查看详细信息**
   ```
   1. 在扩展程序卡片上点击"错误"按钮
   2. 查看具体的错误信息
   3. 检查Service Worker状态
   ```

### 🔍 调试步骤

1. **检查Service Worker状态**
   - 在扩展详情页面查看"Service Worker"部分
   - 应该显示"正在运行"或"已停止"

2. **查看控制台日志**
   - 点击Service Worker旁边的"检查视图"
   - 在控制台中应该看到 "Service Worker started"

### 🎯 常见解决方案

#### 方案1：使用简化版本（当前）
- 已切换到 `background_simple.js`
- 移除了所有可能导致错误的复杂功能

#### 方案2：如果简化版本仍有问题
让我知道具体的错误信息，我会进一步简化

#### 方案3：完全移除background script（临时）
如果需要，可以暂时删除background配置：

```json
// 在manifest.json中注释掉background部分
/*
"background": {
  "service_worker": "background_simple.js"
},
*/
```

### ✅ 验证修复

扩展程序正常工作的标志：
- ✅ 扩展程序列表中没有错误提示
- ✅ 可以点击扩展程序图标
- ✅ 弹出窗口正常显示
- ✅ 控制台显示 "Service Worker started"

### 📝 下一步

1. 先尝试重新加载扩展程序
2. 如果问题解决，我们可以逐步恢复完整功能
3. 如果仍有问题，请提供具体的错误信息

现在请重新加载扩展程序并测试！
